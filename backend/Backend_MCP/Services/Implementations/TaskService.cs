namespace Backend_MCP.Services.Implementations;

public class TaskService : ITaskService
{
    private readonly ITaskRepository _taskRepository;

    public TaskService(ITaskRepository taskRepository)
    {
        _taskRepository = taskRepository;
    }

    public async Task<List<TaskItemResponse>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        var tasks = await _taskRepository.GetAllAsync(cancellationToken);
        return tasks.Select(TaskItemResponse.FromEntity).ToList();
    }

    public async Task<TaskItemResponse?> GetByIdAsync(string id, CancellationToken cancellationToken = default)
    {
        var task = await _taskRepository.GetByIdAsync(id, cancellationToken);
        return task is null ? null : TaskItemResponse.FromEntity(task);
    }

    public async Task<List<TaskItemResponse>> GetByDepartmentAsync(string departmentId, CancellationToken cancellationToken = default)
    {
        var tasks = await _taskRepository.GetByDepartmentIdAsync(departmentId, cancellationToken);
        return tasks.Select(TaskItemResponse.FromEntity).ToList();
    }

    public async Task<List<TaskItemResponse>> GetByUserAsync(string userId, CancellationToken cancellationToken = default)
    {
        var tasks = await _taskRepository.GetByAssigneeIdAsync(userId, cancellationToken);
        return tasks.Select(TaskItemResponse.FromEntity).ToList();
    }

    public async Task<TaskItemResponse> CreateAsync(CreateTaskRequest request, CancellationToken cancellationToken = default)
    {
        var task = new TaskItem
        {
            Title = request.Title,
            Description = request.Description,
            DepartmentId = request.DepartmentId,
            AssigneeId = request.AssigneeId,
            SupervisorIds = request.SupervisorIds,
            DueDate = request.DueDate,
            Priority = request.Priority,
            Status = TaskStatus.Todo,
            CreatedAt = DateTime.UtcNow
        };

        await _taskRepository.CreateAsync(task, cancellationToken);
        return TaskItemResponse.FromEntity(task);
    }

    public async Task<TaskItemResponse?> UpdateAsync(string id, UpdateTaskRequest request, CancellationToken cancellationToken = default)
    {
        var task = await _taskRepository.GetByIdAsync(id, cancellationToken);
        if (task is null)
        {
            return null;
        }

        task.Title = request.Title;
        task.Description = request.Description;
        task.DepartmentId = request.DepartmentId;
        task.AssigneeId = request.AssigneeId;
        task.SupervisorIds = request.SupervisorIds;
        task.DueDate = request.DueDate;
        task.Status = request.Status;
        task.Priority = request.Priority;
        task.CompletedAt = request.Status == TaskStatus.Completed ? DateTime.UtcNow : null;

        await _taskRepository.ReplaceAsync(task, cancellationToken);
        return TaskItemResponse.FromEntity(task);
    }

    public async Task<TaskItemResponse?> AssignAsync(string id, AssignTaskRequest request, CancellationToken cancellationToken = default)
    {
        var task = await _taskRepository.GetByIdAsync(id, cancellationToken);
        if (task is null)
        {
            return null;
        }

        task.AssigneeId = request.AssigneeId;
        task.SupervisorIds = request.SupervisorIds;

        await _taskRepository.ReplaceAsync(task, cancellationToken);
        return TaskItemResponse.FromEntity(task);
    }

    public async Task<bool> DeleteAsync(string id, CancellationToken cancellationToken = default)
    {
        var task = await _taskRepository.GetByIdAsync(id, cancellationToken);
        if (task is null)
        {
            return false;
        }

        await _taskRepository.DeleteAsync(id, cancellationToken);
        return true;
    }
}