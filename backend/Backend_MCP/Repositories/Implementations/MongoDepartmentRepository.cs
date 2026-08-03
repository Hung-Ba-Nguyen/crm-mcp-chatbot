namespace Backend_MCP.Repositories.Implementations;

public class MongoDepartmentRepository : IDepartmentRepository
{
    private readonly IMongoCollection<Department> _collection;

    public MongoDepartmentRepository(IMongoDatabase database, IOptions<MongoDbSettings> options)
    {
        _collection = database.GetCollection<Department>(options.Value.DepartmentsCollectionName);
    }

    public async Task<List<Department>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        return await _collection.Find(FilterDefinition<Department>.Empty).ToListAsync(cancellationToken);
    }

    public async Task<Department?> GetByIdAsync(string id, CancellationToken cancellationToken = default)
    {
        return await _collection.Find(department => department.Id == id).FirstOrDefaultAsync(cancellationToken);
    }

    public Task CreateAsync(Department department, CancellationToken cancellationToken = default)
    {
        return _collection.InsertOneAsync(department, cancellationToken: cancellationToken);
    }

    public Task ReplaceAsync(Department department, CancellationToken cancellationToken = default)
    {
        return _collection.ReplaceOneAsync(item => item.Id == department.Id, department, cancellationToken: cancellationToken);
    }
}