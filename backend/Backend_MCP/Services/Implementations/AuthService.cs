namespace Backend_MCP.Services.Implementations;

public class AuthService : IAuthService
{
    private readonly IUserRepository _userRepository;
    private readonly JwtSettings _jwtSettings;

    public AuthService(IUserRepository userRepository, IOptions<JwtSettings> jwtOptions)
    {
        _userRepository = userRepository;
        _jwtSettings = jwtOptions.Value;
    }

    public async Task<AuthResponse?> RegisterAsync(RegisterRequest request, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request.FullName) ||
            string.IsNullOrWhiteSpace(request.Email) ||
            string.IsNullOrWhiteSpace(request.Password))
        {
            return null;
        }

        var email = request.Email.Trim().ToLowerInvariant();
        var existedUser = await _userRepository.GetByEmailAsync(email, cancellationToken);
        if (existedUser is not null)
        {
            return null;
        }

        var user = new User
        {
            FullName = request.FullName.Trim(),
            Email = email,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
            Role = string.IsNullOrWhiteSpace(request.Role) ? "User" : request.Role,
            DepartmentId = request.DepartmentId,
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };

        await _userRepository.CreateAsync(user, cancellationToken);

        return await CreateAuthResponseAsync(user, cancellationToken);
    }

    public async Task<AuthResponse?> LoginAsync(LoginRequest request, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
        {
            return null;
        }

        var user = await _userRepository.GetByEmailAsync(request.Email.Trim().ToLowerInvariant(), cancellationToken);
        if (user is null || !user.IsActive)
        {
            return null;
        }

        var isValidPassword = BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash);
        if (!isValidPassword)
        {
            return null;
        }

        return await CreateAuthResponseAsync(user, cancellationToken);
    }

    public async Task<AuthResponse?> GenerateTokenForEmailAsync(string email, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(email)) return null;

        var user = await _userRepository.GetByEmailAsync(email.Trim().ToLowerInvariant(), cancellationToken);
        if (user is null || !user.IsActive) return null;

        return await CreateAuthResponseAsync(user, cancellationToken);
    }

    public async Task<AuthResponse?> RefreshTokenAsync(string refreshToken, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(refreshToken)) return null;

        var tokenParts = refreshToken.Split('.', 2);
        if (tokenParts.Length != 2 || string.IsNullOrWhiteSpace(tokenParts[0]) || string.IsNullOrWhiteSpace(tokenParts[1]))
        {
            return null;
        }

        var userId = tokenParts[0];
        var user = await _userRepository.GetByIdAsync(userId, cancellationToken);
        
        if (user is null || !user.IsActive || 
            string.IsNullOrWhiteSpace(user.RefreshTokenHash) || 
            !user.RefreshTokenExpiresAtUtc.HasValue || 
            user.RefreshTokenExpiresAtUtc.Value <= DateTime.UtcNow)
        {
            return null;
        }

        var suppliedHashHex = HashRefreshToken(refreshToken);

        if (!TryParseHexString(user.RefreshTokenHash, out var storedHashBytes) || 
            !TryParseHexString(suppliedHashHex, out var suppliedHashBytes))
        {
            return null;
        }

        // So sánh bằng hằng số thời gian chống tấn công Timing Attack
        if (!CryptographicOperations.FixedTimeEquals(storedHashBytes, suppliedHashBytes))
        {
            return null;
        }

        return await CreateAuthResponseAsync(user, cancellationToken);
    }

    private async Task<AuthResponse> CreateAuthResponseAsync(User user, CancellationToken cancellationToken)
    {
        var expirationMinutes = _jwtSettings.ExpirationMinutes > 0 ? _jwtSettings.ExpirationMinutes : 60;
        var refreshExpirationDays = _jwtSettings.RefreshTokenExpirationDays > 0
            ? _jwtSettings.RefreshTokenExpirationDays
            : 30;
        var accessTokenExpiresAtUtc = DateTime.UtcNow.AddMinutes(expirationMinutes);
        var refreshTokenExpiresAtUtc = DateTime.UtcNow.AddDays(refreshExpirationDays);
        var refreshToken = $"{user.Id}.{Convert.ToBase64String(RandomNumberGenerator.GetBytes(64))}";

        user.RefreshTokenHash = HashRefreshToken(refreshToken);
        user.RefreshTokenExpiresAtUtc = refreshTokenExpiresAtUtc;
        await _userRepository.ReplaceAsync(user, cancellationToken);

        return new AuthResponse
        {
            AccessToken = CreateToken(user, accessTokenExpiresAtUtc),
            ExpiresAtUtc = accessTokenExpiresAtUtc,
            RefreshToken = refreshToken,
            RefreshTokenExpiresAtUtc = refreshTokenExpiresAtUtc,
            UserId = user.Id,
            Email = user.Email,
            Role = user.Role
        };
    }

    private static string HashRefreshToken(string refreshToken)
    {
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(refreshToken)));
    }

    private static bool TryParseHexString(string hex, out byte[] bytes)
    {
        bytes = Array.Empty<byte>();
        try
        {
            bytes = Convert.FromHexString(hex);
            return true;
        }
        catch
        {
            return false;
        }
    }

    private string CreateToken(User user, DateTime expiresAt)
    {
        var keyBytes = Encoding.UTF8.GetBytes(_jwtSettings.SecretKey);
        var key = new SymmetricSecurityKey(keyBytes);
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, user.Id ?? string.Empty),
            new(ClaimTypes.Email, user.Email ?? string.Empty),
            new(ClaimTypes.Role, user.Role ?? "User"),
            new(ClaimTypes.Name, user.FullName ?? string.Empty)
        };

        var tokenDescriptor = new JwtSecurityToken(
            issuer: _jwtSettings.Issuer,
            audience: _jwtSettings.Audience,
            claims: claims,
            expires: expiresAt,
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(tokenDescriptor);
    }
}