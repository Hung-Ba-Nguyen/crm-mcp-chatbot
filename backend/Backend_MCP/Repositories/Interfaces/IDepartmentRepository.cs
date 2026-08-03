namespace Backend_MCP.Repositories.Interfaces;

public interface IDepartmentRepository
{
    Task<List<Department>> GetAllAsync(CancellationToken cancellationToken = default);

    Task<Department?> GetByIdAsync(string id, CancellationToken cancellationToken = default);

    Task CreateAsync(Department department, CancellationToken cancellationToken = default);

    Task ReplaceAsync(Department department, CancellationToken cancellationToken = default);
}