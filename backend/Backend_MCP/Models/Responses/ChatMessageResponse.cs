namespace Backend_MCP.Models.Responses;

public class ChatMessageResponse
{
    public string Id { get; set; } = string.Empty;

    public string SessionId { get; set; } = string.Empty;

    public string Sender { get; set; } = "user";

    public string Content { get; set; } = string.Empty;

    public DateTime Timestamp { get; set; }

    public List<McpToolCallLogResponse> McpToolCalls { get; set; } = [];

    public static ChatMessageResponse FromEntity(ChatMessage entity)
    {
        return new ChatMessageResponse
        {
            Id = entity.Id,
            SessionId = entity.SessionId,
            Sender = entity.Sender,
            Content = entity.Content,
            Timestamp = entity.Timestamp,
            McpToolCalls = entity.McpToolCalls.Select(McpToolCallLogResponse.FromEntity).ToList()
        };
    }
}

public class McpToolCallLogResponse
{
    public string ToolName { get; set; } = string.Empty;

    public string? Arguments { get; set; }

    public DateTime ExecutedAt { get; set; }

    public string? Result { get; set; }

    public static McpToolCallLogResponse FromEntity(McpToolCallLog entity)
    {
        return new McpToolCallLogResponse
        {
            ToolName = entity.ToolName,
            Arguments = entity.Arguments,
            ExecutedAt = entity.ExecutedAt,
            Result = entity.Result
        };
    }
}
