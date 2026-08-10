namespace Backend_MCP.Repositories.Implementations;

public class MongoTaskRepository : ITaskRepository
{
    private readonly IMongoCollection<TaskItem> _collection;

    public MongoTaskRepository(IMongoDatabase database, IOptions<MongoDbSettings> options)
    {
        _collection = database.GetCollection<TaskItem>(options.Value.TaskItemsCollectionName);
    }

    public async Task<List<TaskItem>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        return await _collection.Find(FilterDefinition<TaskItem>.Empty).ToListAsync(cancellationToken);
    }

    public async Task<TaskItem?> GetByIdAsync(string id, CancellationToken cancellationToken = default)
    {
        return await _collection.Find(item => item.Id == id).FirstOrDefaultAsync(cancellationToken);
    }

    public async Task<List<TaskItem>> GetByDepartmentIdAsync(string departmentId, CancellationToken cancellationToken = default)
    {
        return await _collection.Find(item => item.DepartmentId == departmentId).ToListAsync(cancellationToken);
    }

    public async Task<List<TaskItem>> GetByAssigneeIdAsync(string assigneeId, CancellationToken cancellationToken = default)
    {
        return await _collection.Find(item => item.AssigneeId == assigneeId).ToListAsync(cancellationToken);
    }

    public async Task<List<TaskItem>> GetOverdueAsync(DateTime? now = null, CancellationToken cancellationToken = default)
    {
        var referenceTime = now ?? DateTime.UtcNow;
        return await _collection.Find(item => item.Status != TaskStatus.Completed && item.DueDate < referenceTime)
            .ToListAsync(cancellationToken);
    }

    public Task CreateAsync(TaskItem taskItem, CancellationToken cancellationToken = default)
    {
        return _collection.InsertOneAsync(taskItem, cancellationToken: cancellationToken);
    }

    public Task ReplaceAsync(TaskItem taskItem, CancellationToken cancellationToken = default)
    {
        return _collection.ReplaceOneAsync(item => item.Id == taskItem.Id, taskItem, cancellationToken: cancellationToken);
    }

    public Task DeleteAsync(string id, CancellationToken cancellationToken = default)
    {
        return _collection.DeleteOneAsync(item => item.Id == id, cancellationToken);
    }
}