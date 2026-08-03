namespace Backend_MCP.Services.Interfaces;

public interface IDepartmentService
{
    Task<List<Department>> GetAllAsync(CancellationToken cancellationToken = default);

    Task<Department?> GetByIdAsync(string id, CancellationToken cancellationToken = default);

    Task<Department> CreateAsync(Department department, CancellationToken cancellationToken = default);

    Task<DepartmentKpiResponse> GetKpiAsync(GetDepartmentKpiRequest request, CancellationToken cancellationToken = default);
}