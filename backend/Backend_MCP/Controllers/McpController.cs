namespace Backend_MCP.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class McpController : ControllerBase
{
    private readonly IMcpToolService _mcpToolService;

    public McpController(IMcpToolService mcpToolService)
    {
        _mcpToolService = mcpToolService;
    }

    [HttpPost]
    public async Task<ActionResult<JsonRpcResponse>> Handle([FromBody] JsonRpcRequest request, CancellationToken cancellationToken)
    {
        return Ok(await _mcpToolService.HandleAsync(request, cancellationToken));
    }
}