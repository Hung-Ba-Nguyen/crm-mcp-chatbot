namespace Backend_MCP.Controllers;

[ApiController]
[Route("api/[controller]")]
public class UsersController : ControllerBase
{
    private readonly IUserService _userService;
    private readonly IAuthService _authService;

    public UsersController(IUserService userService, IAuthService authService)
    {
        _userService = userService;
        _authService = authService;
    }

    [HttpPost("register")]
    public async Task<ActionResult<AuthResponse>> Register([FromBody] RegisterRequest request, CancellationToken cancellationToken)
    {
        var authResponse = await _authService.RegisterAsync(request, cancellationToken);
        if (authResponse is null)
        {
            return BadRequest("Email already exists or request is invalid");
        }

        return Ok(authResponse);
    }

    [HttpPost("login")]
    public async Task<ActionResult<AuthResponse>> Login([FromBody] LoginRequest request, CancellationToken cancellationToken)
    {
        var authResponse = await _authService.LoginAsync(request, cancellationToken);
        return authResponse is null ? Unauthorized() : Ok(authResponse);
    }

    [HttpGet]
    [Authorize]
    public async Task<ActionResult<List<User>>> GetAll(CancellationToken cancellationToken)
    {
        return Ok(await _userService.GetAllAsync(cancellationToken));
    }

    [HttpGet("{id}")]
    [Authorize]
    public async Task<ActionResult<User>> GetById(string id, CancellationToken cancellationToken)
    {
        var user = await _userService.GetByIdAsync(id, cancellationToken);
        return user is null ? NotFound() : Ok(user);
    }

    [HttpGet("{id}/tasks")]
    [Authorize]
    public async Task<ActionResult<UserTaskListResponse>> GetUserTasks(string id, CancellationToken cancellationToken)
    {
        var request = new GetUserTasksRequest { UserId = id };
        return Ok(await _userService.GetUserTasksAsync(request, cancellationToken));
    }
}