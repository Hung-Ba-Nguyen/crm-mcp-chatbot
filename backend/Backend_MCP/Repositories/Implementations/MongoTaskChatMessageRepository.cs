namespace Backend_MCP.Repositories.Implementations;

public class MongoTaskChatMessageRepository : ITaskChatMessageRepository
{
    private readonly IMongoCollection<TaskChatMessage> _collection;

    public MongoTaskChatMessageRepository(IMongoDatabase database, IOptions<MongoDbSettings> options)
    {
        _collection = database.GetCollection<TaskChatMessage>(options.Value.TaskChatMessagesCollectionName);
    }

    public async Task<List<TaskChatMessage>> GetByTaskIdAsync(string taskId, CancellationToken cancellationToken = default)
    {
        return await _collection.Find(message => message.TaskId == taskId)
            .SortBy(message => message.CreatedAt)
            .ToListAsync(cancellationToken);
    }

    public Task CreateAsync(TaskChatMessage message, CancellationToken cancellationToken = default)
    {
        return _collection.InsertOneAsync(message, cancellationToken: cancellationToken);
    }
}