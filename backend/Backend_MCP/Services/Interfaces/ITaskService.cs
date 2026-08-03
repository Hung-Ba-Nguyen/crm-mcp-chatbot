namespace Backend_MCP.Services.Interfaces;

public interface ITaskService
{
    Task<List<TaskItemResponse>> GetAllAsync(CancellationToken cancellationToken = default);

    Task<TaskItemResponse?> GetByIdAsync(string id, CancellationToken cancellationToken = default);

    Task<List<TaskItemResponse>> GetByDepartmentAsync(string departmentId, CancellationToken cancellationToken = default);

    Task<List<TaskItemResponse>> GetByUserAsync(string userId, CancellationToken cancellationToken = default);

    Task<TaskItemResponse> CreateAsync(CreateTaskRequest request, CancellationToken cancellationToken = default);

    Task<TaskItemResponse?> UpdateAsync(string id, UpdateTaskRequest request, CancellationToken cancellationToken = default);

    Task<TaskItemResponse?> AssignAsync(string id, AssignTaskRequest request, CancellationToken cancellationToken = default);

    Task<bool> DeleteAsync(string id, CancellationToken cancellationToken = default);
}