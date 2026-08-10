namespace Backend_MCP.Models.Requests;

public class GetWorkloadSummaryRequest
{
    public string? UserId { get; set; }

    public string? DepartmentId { get; set; }
}
