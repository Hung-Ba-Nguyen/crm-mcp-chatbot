namespace Backend_MCP.Models.Requests;

public class AskAiRequest
{
    public string Message { get; set; } = string.Empty;
    public string UserId { get; set; } = string.Empty;
    public string? TaskId { get; set; }
    public string? DepartmentId { get; set; }
}