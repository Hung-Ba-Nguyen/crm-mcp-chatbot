namespace Backend_MCP.Services.Interfaces;

public interface ITaskChatService
{
    Task<List<TaskChatMessageResponse>> GetHistoryAsync(GetTaskChatHistoryRequest request, CancellationToken cancellationToken = default);

    Task<TaskChatMessageResponse> CreateAsync(CreateTaskChatMessageRequest request, CancellationToken cancellationToken = default);
}