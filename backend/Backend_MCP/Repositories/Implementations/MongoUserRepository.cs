namespace Backend_MCP.Repositories.Implementations;

public class MongoUserRepository : IUserRepository
{
    private readonly IMongoCollection<User> _collection;

    public MongoUserRepository(IMongoDatabase database, IOptions<MongoDbSettings> options)
    {
        _collection = database.GetCollection<User>(options.Value.UsersCollectionName);
    }

    public async Task<List<User>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        return await _collection.Find(FilterDefinition<User>.Empty).ToListAsync(cancellationToken);
    }

    public async Task<User?> GetByIdAsync(string id, CancellationToken cancellationToken = default)
    {
        return await _collection.Find(user => user.Id == id).FirstOrDefaultAsync(cancellationToken);
    }

    public async Task<User?> GetByEmailAsync(string email, CancellationToken cancellationToken = default)
    {
        return await _collection.Find(user => user.Email == email).FirstOrDefaultAsync(cancellationToken);
    }

    public Task CreateAsync(User user, CancellationToken cancellationToken = default)
    {
        return _collection.InsertOneAsync(user, cancellationToken: cancellationToken);
    }

    public Task ReplaceAsync(User user, CancellationToken cancellationToken = default)
    {
        return _collection.ReplaceOneAsync(item => item.Id == user.Id, user, cancellationToken: cancellationToken);
    }
}