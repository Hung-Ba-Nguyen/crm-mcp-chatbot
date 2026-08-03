namespace Backend_MCP.Services.Implementations;

public class TaskChatService : ITaskChatService
{
    private readonly ITaskChatMessageRepository _taskChatMessageRepository;

    public TaskChatService(ITaskChatMessageRepository taskChatMessageRepository)
    {
        _taskChatMessageRepository = taskChatMessageRepository;
    }

    public async Task<List<TaskChatMessageResponse>> GetHistoryAsync(GetTaskChatHistoryRequest request, CancellationToken cancellationToken = default)
    {
        var messages = await _taskChatMessageRepository.GetByTaskIdAsync(request.TaskId, cancellationToken);
        return messages.Select(TaskChatMessageResponse.FromEntity).ToList();
    }

    public async Task<TaskChatMessageResponse> CreateAsync(CreateTaskChatMessageRequest request, CancellationToken cancellationToken = default)
    {
        var message = new TaskChatMessage
        {
            TaskId = request.TaskId,
            AuthorId = request.AuthorId,
            AuthorName = request.AuthorName,
            Message = request.Message,
            CreatedAt = DateTime.UtcNow
        };

        await _taskChatMessageRepository.CreateAsync(message, cancellationToken);
        return TaskChatMessageResponse.FromEntity(message);
    }
}