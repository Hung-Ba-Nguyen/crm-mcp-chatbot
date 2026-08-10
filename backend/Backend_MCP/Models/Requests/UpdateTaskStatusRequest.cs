namespace Backend_MCP.Models.Requests;

public class UpdateTaskStatusRequest
{
    public string TaskId { get; set; } = string.Empty;

    public string Status { get; set; } = string.Empty;
}
