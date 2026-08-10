namespace Backend_MCP.Repositories.Interfaces;

public interface ITaskRepository
{
    Task<List<TaskItem>> GetAllAsync(CancellationToken cancellationToken = default);

    Task<TaskItem?> GetByIdAsync(string id, CancellationToken cancellationToken = default);

    Task<List<TaskItem>> GetByDepartmentIdAsync(string departmentId, CancellationToken cancellationToken = default);

    Task<List<TaskItem>> GetByAssigneeIdAsync(string assigneeId, CancellationToken cancellationToken = default);

    Task<List<TaskItem>> GetOverdueAsync(DateTime? now = null, CancellationToken cancellationToken = default);

    Task CreateAsync(TaskItem taskItem, CancellationToken cancellationToken = default);

    Task ReplaceAsync(TaskItem taskItem, CancellationToken cancellationToken = default);

    Task DeleteAsync(string id, CancellationToken cancellationToken = default);
}