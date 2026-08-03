namespace Backend_MCP.Models.Responses;

public class TaskChatMessageResponse
{
    public string Id { get; set; } = string.Empty;

    public string TaskId { get; set; } = string.Empty;

    public string AuthorId { get; set; } = string.Empty;

    public string AuthorName { get; set; } = string.Empty;

    public string Message { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; }

    public static TaskChatMessageResponse FromEntity(TaskChatMessage entity)
    {
        return new TaskChatMessageResponse
        {
            Id = entity.Id,
            TaskId = entity.TaskId,
            AuthorId = entity.AuthorId,
            AuthorName = entity.AuthorName,
            Message = entity.Message,
            CreatedAt = entity.CreatedAt
        };
    }
}