namespace Backend_MCP.Services.Interfaces;

public interface IChatService
{
    Task<ChatSession> EnsureSessionAsync(string userId, string? sessionId, string? title, CancellationToken cancellationToken = default);

    Task<ChatMessage> SaveUserMessageAsync(string userId, string? sessionId, string content, CancellationToken cancellationToken = default);

    Task<ChatMessage> SaveAssistantMessageAsync(string userId, string sessionId, string content, List<McpToolCallLog>? mcpToolCalls = null, CancellationToken cancellationToken = default);

    Task<List<ChatMessage>> GetContextMessagesAsync(string sessionId, int limit, CancellationToken cancellationToken = default);

    Task<List<ChatSession>> GetSessionsByUserIdAsync(string userId, int page, int pageSize, CancellationToken cancellationToken = default);

    Task<List<ChatMessage>> GetMessagesBySessionIdAsync(string userId, string sessionId, int limit, CancellationToken cancellationToken = default);

    Task UpdateSessionTitleAsync(string userId, string sessionId, string newTitle, CancellationToken cancellationToken = default);

    Task DeleteSessionAsync(string userId, string sessionId, CancellationToken cancellationToken = default);
}
