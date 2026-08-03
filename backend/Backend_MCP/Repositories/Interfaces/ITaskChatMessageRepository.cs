namespace Backend_MCP.Repositories.Interfaces;

public interface ITaskChatMessageRepository
{
    Task<List<TaskChatMessage>> GetByTaskIdAsync(string taskId, CancellationToken cancellationToken = default);

    Task CreateAsync(TaskChatMessage message, CancellationToken cancellationToken = default);
}