namespace Backend_MCP.Services.Implementations;

public class DepartmentService : IDepartmentService
{
    private readonly IDepartmentRepository _departmentRepository;
    private readonly ITaskRepository _taskRepository;

    public DepartmentService(IDepartmentRepository departmentRepository, ITaskRepository taskRepository)
    {
        _departmentRepository = departmentRepository;
        _taskRepository = taskRepository;
    }

    public Task<List<Department>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        return _departmentRepository.GetAllAsync(cancellationToken);
    }

    public Task<Department?> GetByIdAsync(string id, CancellationToken cancellationToken = default)
    {
        return _departmentRepository.GetByIdAsync(id, cancellationToken);
    }

    public async Task<Department> CreateAsync(Department department, CancellationToken cancellationToken = default)
    {
        department.CreatedAt = DateTime.UtcNow;
        await _departmentRepository.CreateAsync(department, cancellationToken);
        return department;
    }

    public async Task<DepartmentKpiResponse> GetKpiAsync(GetDepartmentKpiRequest request, CancellationToken cancellationToken = default)
    {
        var department = await _departmentRepository.GetByIdAsync(request.DepartmentId, cancellationToken);
        var tasks = await _taskRepository.GetByDepartmentIdAsync(request.DepartmentId, cancellationToken);

        var now = DateTime.UtcNow;
        var total = tasks.Count;
        var completed = tasks.Count(task => task.Status == TaskStatus.Completed);
        var inProgress = tasks.Count(task => task.Status == TaskStatus.InProgress);
        var overdue = tasks.Count(task => task.Status != TaskStatus.Completed && task.DueDate < now);

        return new DepartmentKpiResponse
        {
            DepartmentId = request.DepartmentId,
            DepartmentName = department?.Name ?? string.Empty,
            TotalTasks = total,
            CompletedTasks = completed,
            InProgressTasks = inProgress,
            OverdueTasks = overdue,
            CompletionRate = total == 0 ? 0 : Math.Round((decimal)completed * 100 / total, 2)
        };
    }
}