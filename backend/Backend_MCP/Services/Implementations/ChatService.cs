namespace Backend_MCP.Services.Implementations;

public class ChatService : IChatService
{
    private readonly IChatRepository _chatRepository;

    public ChatService(IChatRepository chatRepository)
    {
        _chatRepository = chatRepository;
    }

    public async Task<ChatSession> EnsureSessionAsync(string userId, string? sessionId, string? title, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(userId))
        {
            throw new ArgumentException("UserId không được để trống.", nameof(userId));
        }

        if (!string.IsNullOrWhiteSpace(sessionId))
        {
            var existingSession = await _chatRepository.GetSessionByIdAsync(sessionId, cancellationToken);
            if (existingSession is not null && existingSession.UserId != userId)
            {
                throw new UnauthorizedAccessException("Session không thuộc về người dùng hiện tại.");
            }

            if (existingSession is not null)
            {
                return existingSession;
            }
        }

        var session = new ChatSession
        {
            UserId = userId,
            SessionId = string.IsNullOrWhiteSpace(sessionId) ? Guid.NewGuid().ToString() : sessionId,
            Title = string.IsNullOrWhiteSpace(title) ? "Cuộc trò chuyện mới" : title,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
            IsArchived = false
        };

        return await _chatRepository.CreateSessionAsync(session, cancellationToken);
    }

    public async Task<ChatMessage> SaveUserMessageAsync(string userId, string? sessionId, string content, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(content))
        {
            throw new ArgumentException("Nội dung tin nhắn không được để trống.", nameof(content));
        }

        var session = await EnsureSessionAsync(userId, sessionId, "Cuộc trò chuyện mới", cancellationToken);
        var message = new ChatMessage
        {
            SessionId = session.SessionId,
            Sender = "user",
            Content = content.Trim(),
            Timestamp = DateTime.UtcNow,
            McpToolCalls = []
        };

        await _chatRepository.SaveMessageAsync(message, cancellationToken);
        await UpdateSessionTimestampAsync(session.SessionId, cancellationToken);
        return message;
    }

    public async Task<ChatMessage> SaveAssistantMessageAsync(string userId, string sessionId, string content, List<McpToolCallLog>? mcpToolCalls = null, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(content))
        {
            throw new ArgumentException("Nội dung phản hồi AI không được để trống.", nameof(content));
        }

        var session = await EnsureSessionAsync(userId, sessionId, null, cancellationToken);
        var message = new ChatMessage
        {
            SessionId = session.SessionId,
            Sender = "assistant",
            Content = content.Trim(),
            Timestamp = DateTime.UtcNow,
            McpToolCalls = mcpToolCalls ?? []
        };

        await _chatRepository.SaveMessageAsync(message, cancellationToken);
        await UpdateSessionTimestampAsync(session.SessionId, cancellationToken);
        return message;
    }

    public async Task<List<ChatMessage>> GetContextMessagesAsync(string sessionId, int limit, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(sessionId))
        {
            throw new ArgumentException("SessionId không được để trống.", nameof(sessionId));
        }

        var effectiveLimit = Math.Max(1, limit);
        var allMessages = await _chatRepository.GetMessagesBySessionIdAsync(sessionId, effectiveLimit, cancellationToken);

        return allMessages
            .OrderBy(message => message.Timestamp)
            .ToList();
    }

    public async Task<List<ChatSession>> GetSessionsByUserIdAsync(string userId, int page, int pageSize, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(userId))
        {
            throw new ArgumentException("UserId không được để trống.", nameof(userId));
        }

        return await _chatRepository.GetSessionsByUserIdAsync(userId, page, pageSize, cancellationToken);
    }

    public async Task<List<ChatMessage>> GetMessagesBySessionIdAsync(string userId, string sessionId, int limit, CancellationToken cancellationToken = default)
    {
        await RequireOwnedSessionAsync(userId, sessionId, cancellationToken);

        if (string.IsNullOrWhiteSpace(sessionId))
        {
            throw new ArgumentException("SessionId không được để trống.", nameof(sessionId));
        }

        return await _chatRepository.GetMessagesBySessionIdAsync(sessionId, Math.Max(1, limit), cancellationToken);
    }

    public async Task UpdateSessionTitleAsync(string userId, string sessionId, string newTitle, CancellationToken cancellationToken = default)
    {
        await RequireOwnedSessionAsync(userId, sessionId, cancellationToken);

        if (string.IsNullOrWhiteSpace(sessionId))
        {
            throw new ArgumentException("SessionId không được để trống.", nameof(sessionId));
        }

        if (string.IsNullOrWhiteSpace(newTitle))
        {
            throw new ArgumentException("Tiêu đề phiên chat không được để trống.", nameof(newTitle));
        }

        await _chatRepository.UpdateSessionTitleAsync(sessionId, userId, newTitle, cancellationToken);
    }

    public async Task DeleteSessionAsync(string userId, string sessionId, CancellationToken cancellationToken = default)
    {
        await RequireOwnedSessionAsync(userId, sessionId, cancellationToken);

        if (string.IsNullOrWhiteSpace(sessionId))
        {
            throw new ArgumentException("SessionId không được để trống.", nameof(sessionId));
        }

        await _chatRepository.DeleteSessionAsync(sessionId, userId, cancellationToken);
    }

    private async Task UpdateSessionTimestampAsync(string sessionId, CancellationToken cancellationToken)
    {
        await _chatRepository.UpdateSessionTimestampAsync(sessionId, cancellationToken);
    }

    private async Task<ChatSession> RequireOwnedSessionAsync(string userId, string sessionId, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(userId))
        {
            throw new ArgumentException("UserId không được để trống.", nameof(userId));
        }

        if (string.IsNullOrWhiteSpace(sessionId))
        {
            throw new ArgumentException("SessionId không được để trống.", nameof(sessionId));
        }

        var session = await _chatRepository.GetSessionByUserIdAsync(sessionId, userId, cancellationToken);
        return session ?? throw new UnauthorizedAccessException("Session không thuộc về người dùng hiện tại.");
    }
}
