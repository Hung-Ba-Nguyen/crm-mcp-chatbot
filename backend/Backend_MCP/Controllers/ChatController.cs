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

        string botReply = $"Tôi đã nhận được câu hỏi của bạn: \"{request.Message}\". Hệ thống Task Chat MVP đang hoạt động tốt!";

        // Nếu bạn muốn tích hợp AI thực tế (như Gemini/OpenAI), bạn có thể gọi service ở đây:
        // var aiResult = await _aiChatService.GetAnswerAsync(request.Message, cancellationToken);
        // if (!string.IsNullOrEmpty(aiResult)) { botReply = aiResult; }

        var responseData = new ChatResponse
        {
            Answer = botReply,
            ToolUsed = "mcp-dynamic-chat",
            ProcessedAt = DateTime.UtcNow
        };

        return Ok(ApiResponse<ChatResponse>.Ok(responseData, "Phản hồi thành công từ AI."));
    }
}