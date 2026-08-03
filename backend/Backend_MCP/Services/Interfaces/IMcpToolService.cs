namespace Backend_MCP.Services.Interfaces;

public interface IMcpToolService
{
    Task<JsonRpcResponse> HandleAsync(JsonRpcRequest request, CancellationToken cancellationToken = default);
    object GetAvailableTools();
}