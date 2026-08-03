namespace Backend_MCP.Models.Requests;

public class AssignTaskRequest
{
    public string AssigneeId { get; set; } = string.Empty;

    public List<string> SupervisorIds { get; set; } = [];
}