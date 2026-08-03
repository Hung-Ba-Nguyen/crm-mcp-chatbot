namespace Backend_MCP.Models.Requests;

public class GetUserTasksRequest
{
    public string UserId { get; set; } = string.Empty;

    public GetUserTasksFilters? Filters { get; set; }
}

public class GetUserTasksFilters
{
    public string? Status { get; set; }

    public string? Priority { get; set; }

    public int? Limit { get; set; }
}