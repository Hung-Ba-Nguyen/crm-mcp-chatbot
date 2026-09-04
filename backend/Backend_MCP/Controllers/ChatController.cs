namespace Backend_MCP.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ChatController : ControllerBase
{
    private readonly IAiChatService _aiChatService;
    private readonly IChatService _chatService;

    public ChatController(IAiChatService aiChatService, IChatService chatService)
    {
        _aiChatService = aiChatService;
        _chatService = chatService;
    }

    [HttpPost]
    public async Task<ActionResult<ApiResponse<ChatResponse>>> Ask([FromBody] AskAiRequest request, CancellationToken cancellationToken)
    {
        if (request is null || string.IsNullOrWhiteSpace(request.Message))
        {
            return BadRequest(ApiResponse<ChatResponse>.Fail("Câu hỏi không được để trống."));
        }

        var userId = GetCurrentUserId();
        if (string.IsNullOrWhiteSpace(userId))
        {
            return Unauthorized(ApiResponse<ChatResponse>.Fail("Không xác định được người dùng từ token."));
        }

        request.UserId = userId;

        ChatResponse? aiResponse;
        try
        {
            aiResponse = await _aiChatService.AskAsync(request, cancellationToken);
        }
        catch (UnauthorizedAccessException)
        {
            return Forbid();
        }
        if (aiResponse is null)
        {
            return Ok(ApiResponse<ChatResponse>.Fail("AI không trả về phản hồi."));
        }

        return Ok(ApiResponse<ChatResponse>.Ok(aiResponse, "Phản hồi thành công từ AI."));
    }

    [HttpGet("sessions")]
    public async Task<ActionResult<ApiResponse<List<ChatSessionResponse>>>> GetSessions([FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken cancellationToken = default)
    {
        var userId = GetCurrentUserId();
        if (userId is null)
        {
            return Unauthorized(ApiResponse<List<ChatSessionResponse>>.Fail("Không xác định được người dùng từ token."));
        }

        var sessions = await _chatService.GetSessionsByUserIdAsync(userId, page, pageSize, cancellationToken);
        var response = sessions.Select(ChatSessionResponse.FromEntity).ToList();
        return Ok(ApiResponse<List<ChatSessionResponse>>.Ok(response, "Lấy danh sách phiên chat thành công."));
    }

    [HttpGet("sessions/{sessionId}/messages")]
    public async Task<ActionResult<ApiResponse<List<ChatMessageResponse>>>> GetMessages(string sessionId, [FromQuery] int limit = 50, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(sessionId))
        {
            return BadRequest(ApiResponse<List<ChatMessageResponse>>.Fail("SessionId không được để trống."));
        }

        var userId = GetCurrentUserId();
        if (userId is null)
        {
            return Unauthorized(ApiResponse<List<ChatMessageResponse>>.Fail("Không xác định được người dùng từ token."));
        }

        List<ChatMessage> messages;
        try
        {
            messages = await _chatService.GetMessagesBySessionIdAsync(userId, sessionId, limit, cancellationToken);
        }
        catch (UnauthorizedAccessException)
        {
            return NotFound(ApiResponse<List<ChatMessageResponse>>.Fail("Không tìm thấy phiên chat."));
        }
        var response = messages.Select(ChatMessageResponse.FromEntity).ToList();
        return Ok(ApiResponse<List<ChatMessageResponse>>.Ok(response, "Lấy lịch sử tin nhắn thành công."));
    }

    [HttpDelete("sessions/{sessionId}")]
    public async Task<ActionResult<ApiResponse<object>>> DeleteSession(string sessionId, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(sessionId))
        {
            return BadRequest(ApiResponse<object>.Fail("SessionId không được để trống."));
        }

        var userId = GetCurrentUserId();
        if (userId is null)
        {
            return Unauthorized(ApiResponse<object>.Fail("Không xác định được người dùng từ token."));
        }

        try
        {
            await _chatService.DeleteSessionAsync(userId, sessionId, cancellationToken);
        }
        catch (UnauthorizedAccessException)
        {
            return NotFound(ApiResponse<object>.Fail("Không tìm thấy phiên chat."));
        }
        return Ok(ApiResponse<object>.Ok(new { sessionId }, "Xóa phiên chat thành công."));
    }

    [HttpPatch("sessions/{sessionId}/title")]
    public async Task<ActionResult<ApiResponse<object>>> UpdateSessionTitle(string sessionId, [FromBody] UpdateChatSessionTitleRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(sessionId))
        {
            return BadRequest(ApiResponse<object>.Fail("SessionId không được để trống."));
        }

        if (request is null || string.IsNullOrWhiteSpace(request.Title))
        {
            return BadRequest(ApiResponse<object>.Fail("Tiêu đề phiên chat không được để trống."));
        }

        var userId = GetCurrentUserId();
        if (userId is null)
        {
            return Unauthorized(ApiResponse<object>.Fail("Không xác định được người dùng từ token."));
        }

        try
        {
            await _chatService.UpdateSessionTitleAsync(userId, sessionId, request.Title, cancellationToken);
        }
        catch (UnauthorizedAccessException)
        {
            return NotFound(ApiResponse<object>.Fail("Không tìm thấy phiên chat."));
        }
        return Ok(ApiResponse<object>.Ok(new { sessionId, title = request.Title }, "Cập nhật tiêu đề phiên chat thành công."));
    }

    private string? GetCurrentUserId()
    {
        return User.FindFirstValue(ClaimTypes.NameIdentifier);
    }
}

public class UpdateChatSessionTitleRequest
{
    public string Title { get; set; } = string.Empty;
}