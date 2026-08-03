namespace Backend_MCP.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class DepartmentsController : ControllerBase
{
    private readonly IDepartmentService _departmentService;

    public DepartmentsController(IDepartmentService departmentService)
    {
        _departmentService = departmentService;
    }

    [HttpGet]
    public async Task<ActionResult<List<Department>>> GetAll(CancellationToken cancellationToken)
    {
        return Ok(await _departmentService.GetAllAsync(cancellationToken));
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<Department>> GetById(string id, CancellationToken cancellationToken)
    {
        var department = await _departmentService.GetByIdAsync(id, cancellationToken);
        return department is null ? NotFound() : Ok(department);
    }

    [HttpPost]
    public async Task<ActionResult<Department>> Create([FromBody] Department department, CancellationToken cancellationToken)
    {
        var created = await _departmentService.CreateAsync(department, cancellationToken);
        return Ok(created);
    }

    [HttpGet("{id}/kpi")]
    public async Task<ActionResult<DepartmentKpiResponse>> GetKpi(string id, CancellationToken cancellationToken)
    {
        var request = new GetDepartmentKpiRequest { DepartmentId = id };
        return Ok(await _departmentService.GetKpiAsync(request, cancellationToken));
    }
}