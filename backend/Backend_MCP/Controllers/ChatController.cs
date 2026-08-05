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
    [AllowAnonymous]
        public async Task<ActionResult<ApiResponse<ChatResponse>>> Ask([FromBody] AskAiRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Message))
        {
            return BadRequest(ApiResponse<ChatResponse>.Fail("Câu hỏi không được để trống."));
        }

        // Delegate to AI chat service to produce a real response
        var aiResponse = await _aiChatService.AskAsync(request, cancellationToken);

        if (aiResponse is null)
        {
            return Ok(ApiResponse<ChatResponse>.Fail("AI không trả về phản hồi."));
        }

        return Ok(ApiResponse<ChatResponse>.Ok(aiResponse, "Phản hồi thành công từ AI."));
    }
}