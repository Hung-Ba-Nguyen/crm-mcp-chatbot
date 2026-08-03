namespace Backend_MCP.Services.Interfaces;

public interface IUserService
{
    Task<List<User>> GetAllAsync(CancellationToken cancellationToken = default);

    Task<User?> GetByIdAsync(string id, CancellationToken cancellationToken = default);

    Task<User?> GetByEmailAsync(string email, CancellationToken cancellationToken = default);

    Task<UserTaskListResponse> GetUserTasksAsync(GetUserTasksRequest request, CancellationToken cancellationToken = default);
}