namespace Backend_MCP.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ChatController : ControllerBase
{
    private readonly IAiChatService _aiChatService;

    public ChatController(IAiChatService aiChatService)
    {
        _aiChatService = aiChatService;
    }

    [HttpPost]
    public async Task<ActionResult<ApiResponse<ChatResponse>>> Ask([FromBody] AskAiRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Message))
        {
            return BadRequest(ApiResponse<ChatResponse>.Fail("Câu hỏi không được để trống."));
        }

        var result = await _aiChatService.AskAsync(request, cancellationToken);
        return Ok(ApiResponse<ChatResponse>.Ok(result, "Xử lý câu hỏi thành công."));
    }
}