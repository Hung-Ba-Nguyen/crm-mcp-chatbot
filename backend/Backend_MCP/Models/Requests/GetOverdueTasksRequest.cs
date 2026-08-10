namespace Backend_MCP.Models.Requests;

public class GetOverdueTasksRequest
{
    public string? DepartmentId { get; set; }

    public int? Limit { get; set; }
}
