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

        var tokenResult = CreateToken(user);

        return new AuthResponse
        {
            AccessToken = tokenResult.Token,
            ExpiresAtUtc = tokenResult.ExpiresAtUtc,
            UserId = user.Id,
            Email = user.Email,
            Role = user.Role
        };
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

        var tokenResult = CreateToken(user);

        return new AuthResponse
        {
            AccessToken = tokenResult.Token,
            ExpiresAtUtc = tokenResult.ExpiresAtUtc,
            UserId = user.Id,
            Email = user.Email,
            Role = user.Role
        };
    }

    public async Task<AuthResponse?> GenerateTokenForEmailAsync(string email, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(email)) return null;

        var user = await _userRepository.GetByEmailAsync(email.Trim().ToLowerInvariant(), cancellationToken);
        if (user is null || !user.IsActive) return null;

        var tokenResult = CreateToken(user);

        return new AuthResponse
        {
            AccessToken = tokenResult.Token,
            ExpiresAtUtc = tokenResult.ExpiresAtUtc,
            UserId = user.Id,
            Email = user.Email,
            Role = user.Role
        };
    }

    private (string Token, DateTime ExpiresAtUtc) CreateToken(User user)
    {
        var expirationMinutes = _jwtSettings.ExpirationMinutes > 0 ? _jwtSettings.ExpirationMinutes : 60;
        var expiresAt = DateTime.UtcNow.AddMinutes(expirationMinutes);

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

        var token = new JwtSecurityTokenHandler().WriteToken(tokenDescriptor);
        return (token, expiresAt);
    }
}