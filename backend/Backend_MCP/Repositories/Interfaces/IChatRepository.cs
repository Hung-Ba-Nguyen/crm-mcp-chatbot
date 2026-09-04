namespace Backend_MCP.Repositories.Interfaces;

public interface IChatRepository
{
    Task<ChatSession> CreateSessionAsync(ChatSession session, CancellationToken cancellationToken = default);

    Task<ChatSession?> GetSessionByIdAsync(string sessionId, CancellationToken cancellationToken = default);

    Task<ChatSession?> GetSessionByUserIdAsync(string sessionId, string userId, CancellationToken cancellationToken = default);

    Task<List<ChatSession>> GetSessionsByUserIdAsync(string userId, int page, int pageSize, CancellationToken cancellationToken = default);

    Task<ChatMessage> SaveMessageAsync(ChatMessage message, CancellationToken cancellationToken = default);

    Task<List<ChatMessage>> GetMessagesBySessionIdAsync(string sessionId, int limit, CancellationToken cancellationToken = default);

    Task UpdateSessionTitleAsync(string sessionId, string userId, string newTitle, CancellationToken cancellationToken = default);

    Task UpdateSessionTimestampAsync(string sessionId, CancellationToken cancellationToken = default);

    Task DeleteSessionAsync(string sessionId, string userId, CancellationToken cancellationToken = default);

    Task EnsureIndexesAsync(CancellationToken cancellationToken = default);
}
