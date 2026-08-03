namespace Backend_MCP.Services.Implementations;

public class UserService : IUserService
{
    private readonly IUserRepository _userRepository;
    private readonly ITaskRepository _taskRepository;

    public UserService(IUserRepository userRepository, ITaskRepository taskRepository)
    {
        _userRepository = userRepository;
        _taskRepository = taskRepository;
    }

    public Task<List<User>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        return _userRepository.GetAllAsync(cancellationToken);
    }

    public Task<User?> GetByIdAsync(string id, CancellationToken cancellationToken = default)
    {
        return _userRepository.GetByIdAsync(id, cancellationToken);
    }

    public Task<User?> GetByEmailAsync(string email, CancellationToken cancellationToken = default)
    {
        return _userRepository.GetByEmailAsync(email, cancellationToken);
    }

    public async Task<UserTaskListResponse> GetUserTasksAsync(GetUserTasksRequest request, CancellationToken cancellationToken = default)
    {
        var user = await _userRepository.GetByIdAsync(request.UserId, cancellationToken);
        var tasks = await _taskRepository.GetByAssigneeIdAsync(request.UserId, cancellationToken);

        if (request.Filters is not null)
        {
            if (Enum.TryParse<TaskStatus>(request.Filters.Status, true, out var status))
            {
                tasks = tasks.Where(task => task.Status == status).ToList();
            }

            if (Enum.TryParse<TaskPriority>(request.Filters.Priority, true, out var priority))
            {
                tasks = tasks.Where(task => task.Priority == priority).ToList();
            }

            if (request.Filters.Limit.HasValue && request.Filters.Limit.Value > 0)
            {
                tasks = tasks.Take(request.Filters.Limit.Value).ToList();
            }
        }

        return new UserTaskListResponse
        {
            UserId = request.UserId,
            UserName = user?.FullName ?? string.Empty,
            Tasks = tasks.Select(TaskItemResponse.FromEntity).ToList()
        };
    }
}