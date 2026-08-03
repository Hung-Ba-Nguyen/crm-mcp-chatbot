namespace Backend_MCP.Services.Interfaces;

public interface IAiChatService
{
    Task<ChatResponse> AskAsync(AskAiRequest request, CancellationToken cancellationToken = default);
}