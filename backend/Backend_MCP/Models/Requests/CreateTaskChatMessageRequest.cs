namespace Backend_MCP.Models.Requests;

public class CreateTaskChatMessageRequest
{
    public string TaskId { get; set; } = string.Empty;

    public string AuthorId { get; set; } = string.Empty;

    public string AuthorName { get; set; } = string.Empty;

    public string Message { get; set; } = string.Empty;
}