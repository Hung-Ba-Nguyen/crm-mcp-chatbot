namespace Backend_MCP.Models.Responses;

public class ChatSessionResponse
{
    public string Id { get; set; } = string.Empty;

    public string SessionId { get; set; } = string.Empty;

    public string UserId { get; set; } = string.Empty;

    public string Title { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    public bool IsArchived { get; set; }

    public static ChatSessionResponse FromEntity(ChatSession entity)
    {
        return new ChatSessionResponse
        {
            Id = entity.Id,
            SessionId = entity.SessionId,
            UserId = entity.UserId,
            Title = entity.Title,
            CreatedAt = entity.CreatedAt,
            UpdatedAt = entity.UpdatedAt,
            IsArchived = entity.IsArchived
        };
    }
}
