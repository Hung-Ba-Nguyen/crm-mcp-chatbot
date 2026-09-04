namespace Backend_MCP.Repositories.Implementations;

public class MongoChatRepository : IChatRepository
{
    private readonly IMongoCollection<ChatSession> _sessions;
    private readonly IMongoCollection<ChatMessage> _messages;

    public MongoChatRepository(IMongoDatabase database, IOptions<MongoDbSettings> options)
    {
        var settings = options.Value;
        _sessions = database.GetCollection<ChatSession>(settings.ChatSessionsCollectionName);
        _messages = database.GetCollection<ChatMessage>(settings.ChatMessagesCollectionName);
    }

    public async Task<ChatSession> CreateSessionAsync(ChatSession session, CancellationToken cancellationToken = default)
    {
        await _sessions.InsertOneAsync(session, cancellationToken: cancellationToken);
        return session;
    }

    public async Task<ChatSession?> GetSessionByIdAsync(string sessionId, CancellationToken cancellationToken = default)
    {
        return await _sessions.Find(session => session.SessionId == sessionId)
            .FirstOrDefaultAsync(cancellationToken);
    }

    public async Task<ChatSession?> GetSessionByUserIdAsync(string sessionId, string userId, CancellationToken cancellationToken = default)
    {
        return await _sessions.Find(session => session.SessionId == sessionId && session.UserId == userId)
            .FirstOrDefaultAsync(cancellationToken);
    }

    public async Task<List<ChatSession>> GetSessionsByUserIdAsync(string userId, int page, int pageSize, CancellationToken cancellationToken = default)
    {
        var safePage = Math.Max(1, page);
        var safePageSize = Math.Clamp(pageSize, 1, 100);
        var skip = (safePage - 1) * safePageSize;

        return await _sessions.Find(session => session.UserId == userId && !session.IsArchived)
            .SortByDescending(session => session.UpdatedAt)
            .Skip(skip)
            .Limit(safePageSize)
            .ToListAsync(cancellationToken);
    }

    public async Task<ChatMessage> SaveMessageAsync(ChatMessage message, CancellationToken cancellationToken = default)
    {
        await _messages.InsertOneAsync(message, cancellationToken: cancellationToken);
        return message;
    }

    public async Task<List<ChatMessage>> GetMessagesBySessionIdAsync(string sessionId, int limit, CancellationToken cancellationToken = default)
    {
        var safeLimit = Math.Max(1, limit);

        return await _messages.Find(message => message.SessionId == sessionId)
            .SortByDescending(message => message.Timestamp)
            .Limit(safeLimit)
            .ToListAsync(cancellationToken);
    }

    public async Task UpdateSessionTitleAsync(string sessionId, string userId, string newTitle, CancellationToken cancellationToken = default)
    {
        var title = newTitle.Trim();
        var update = Builders<ChatSession>.Update
            .Set(session => session.Title, title)
            .Set(session => session.UpdatedAt, DateTime.UtcNow);

        await _sessions.UpdateOneAsync(session => session.SessionId == sessionId && session.UserId == userId, update, cancellationToken: cancellationToken);
    }

    public async Task UpdateSessionTimestampAsync(string sessionId, CancellationToken cancellationToken = default)
    {
        var update = Builders<ChatSession>.Update
            .Set(session => session.UpdatedAt, DateTime.UtcNow);

        await _sessions.UpdateOneAsync(session => session.SessionId == sessionId, update, cancellationToken: cancellationToken);
    }

    public async Task DeleteSessionAsync(string sessionId, string userId, CancellationToken cancellationToken = default)
    {
        var result = await _sessions.DeleteOneAsync(session => session.SessionId == sessionId && session.UserId == userId, cancellationToken);
        if (result.DeletedCount > 0)
        {
            await _messages.DeleteManyAsync(message => message.SessionId == sessionId, cancellationToken);
        }
    }

    public async Task EnsureIndexesAsync(CancellationToken cancellationToken = default)
    {
        var sessionIndexes = new[]
        {
            new CreateIndexModel<ChatSession>(
                Builders<ChatSession>.IndexKeys.Ascending(session => session.SessionId),
                new CreateIndexOptions { Unique = true }),
            new CreateIndexModel<ChatSession>(
                Builders<ChatSession>.IndexKeys
                    .Ascending(session => session.UserId)
                    .Descending(session => session.UpdatedAt))
        };

        var messageIndexes = new[]
        {
            new CreateIndexModel<ChatMessage>(
                Builders<ChatMessage>.IndexKeys
                    .Ascending(message => message.SessionId)
                    .Descending(message => message.Timestamp))
        };

        await _sessions.Indexes.CreateManyAsync(sessionIndexes, cancellationToken);
        await _messages.Indexes.CreateManyAsync(messageIndexes, cancellationToken);
    }
}
