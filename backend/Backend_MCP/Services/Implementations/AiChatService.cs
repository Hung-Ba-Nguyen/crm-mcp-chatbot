namespace Backend_MCP.Services.Implementations;

public class AiChatService : IAiChatService
{
    private readonly IMcpToolService _mcpToolService;
    private readonly HttpClient _httpClient;
    private readonly IConfiguration _configuration;

    public AiChatService(
        IMcpToolService mcpToolService, 
        HttpClient httpClient, 
        IConfiguration configuration)
    {
        _mcpToolService = mcpToolService;
        _httpClient = httpClient;
        _configuration = configuration;
    }

    public async Task<ChatResponse> AskAsync(AskAiRequest request, CancellationToken cancellationToken = default)
    {
        var apiKey = _configuration["Gemini:ApiKey"] ?? string.Empty;
        var apiUrl = $"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key={apiKey}";

        var contextPrompt = $"User Id hiện tại đang gọi hệ thống: {request.UserId}.";
        if (!string.IsNullOrWhiteSpace(request.TaskId))
        {
            contextPrompt += $" Context TaskId: {request.TaskId}.";
        }
        if (!string.IsNullOrWhiteSpace(request.DepartmentId))
        {
            contextPrompt += $" Context DepartmentId: {request.DepartmentId}.";
        }

        var toolsDeclaration = _mcpToolService.GetAvailableTools();

        var initialRequestBody = new
        {
            contents = new object[]
            {
                new
                {
                    role = "user",
                    parts = new object[]
                    {
                        new { text = $"{contextPrompt}\nCâu hỏi: {request.Message}" }
                    }
                }
            },
            tools = toolsDeclaration
        };

        var response = await SendToGeminiAsync(apiUrl, initialRequestBody, cancellationToken);
        var responseJson = await response.Content.ReadAsStringAsync(cancellationToken);

        using var doc = JsonDocument.Parse(responseJson);
        var root = doc.RootElement;

        // Kiểm tra xem LLM có muốn gọi Tool hay không
        if (root.TryGetProperty("candidates", out var candidates) &&
            candidates.EnumerateArray().Any() &&
            candidates[0].TryGetProperty("content", out var content) &&
            content.TryGetProperty("parts", out var parts))
        {
            var firstPart = parts.EnumerateArray().FirstOrDefault();
            if (firstPart.ValueKind != JsonValueKind.Undefined && firstPart.TryGetProperty("functionCall", out var functionCall))
            {
                var functionName = functionCall.GetProperty("name").GetString();
                var args = functionCall.GetProperty("args");

                var mcpRequest = new JsonRpcRequest
                {
                    Id = Guid.NewGuid().ToString(),
                    Method = functionName ?? string.Empty,
                    Parameters = args
                };

                var mcpResponse = await _mcpToolService.HandleAsync(mcpRequest, cancellationToken);

                var followUpRequestBody = new
                {
                    contents = new object[]
                    {
                        new
                        {
                            role = "user",
                            parts = new object[] { new { text = $"{contextPrompt}\nCâu hỏi: {request.Message}" } }
                        },
                        new
                        {
                            role = "model",
                            parts = parts
                        },
                        new
                        {
                            role = "user",
                            parts = new object[]
                            {
                                new
                                {
                                    functionResponse = new
                                    {
                                        name = functionName,
                                        response = mcpResponse.Result
                                    }
                                }
                            }
                        }
                    },
                    tools = toolsDeclaration
                };

                var followUpResponse = await SendToGeminiAsync(apiUrl, followUpRequestBody, cancellationToken);
                var followUpJson = await followUpResponse.Content.ReadAsStringAsync(cancellationToken);
                using var followUpDoc = JsonDocument.Parse(followUpJson);

                var finalAnswer = ExtractTextFromGeminiResponse(followUpDoc.RootElement);

                return new ChatResponse
                {
                    Answer = finalAnswer,
                    ToolUsed = functionName,
                    ProcessedAt = DateTime.UtcNow
                };
            }
        }

        var directAnswer = ExtractTextFromGeminiResponse(root);
        return new ChatResponse
        {
            Answer = directAnswer,
            ToolUsed = null,
            ProcessedAt = DateTime.UtcNow
        };
    }

    private Task<HttpResponseMessage> SendToGeminiAsync(string url, object body, CancellationToken cancellationToken)
    {
        var jsonContent = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");
        return _httpClient.PostAsync(url, jsonContent, cancellationToken);
    }

    private static string ExtractTextFromGeminiResponse(JsonElement root)
    {
        // 1. Kiểm tra xem Gemini có trả về lỗi không
        if (root.TryGetProperty("error", out var errorInfo))
        {
            var errorMsg = errorInfo.TryGetProperty("message", out var msg) ? msg.GetString() : "Lỗi không xác định";
            return $"Lỗi từ API Gemini: {errorMsg}";
        }

        // Nếu thành công thì mới bóc tách nội dung
        try
        {
            // 2. Bóc tách JSON an toàn bằng TryGetProperty
            if (root.TryGetProperty("candidates", out var candidates) && candidates.GetArrayLength() > 0)
            {
                var firstCandidate = candidates[0];

                // Nếu AI bị chặn hoặc không có nội dung
                if (!firstCandidate.TryGetProperty("content", out var content))
                {
                    var finishReason = firstCandidate.TryGetProperty("finishReason", out var reason) ? reason.GetString() : "Không rõ lý do";
                    return $"AI không trả về nội dung (Lý do dừng: {finishReason}).";
                }

                if (content.TryGetProperty("parts", out var parts))
                {
                    // Lặp qua tất cả các parts để tìm văn bản (text)
                    foreach (var part in parts.EnumerateArray())
                    {
                        if (part.TryGetProperty("text", out var textElem))
                        {
                            return textElem.GetString() ?? "";
                        }
                    }

                    // Trường hợp AI ngoan cố muốn gọi thêm một Tool nữa thay vì trả lời
                    if (parts.GetArrayLength() > 0 && parts[0].TryGetProperty("functionCall", out var funcCall))
                    {
                        var funcName = funcCall.TryGetProperty("name", out var nameElem) ? nameElem.GetString() : "Unknown";
                        return $"[Hệ thống] Dữ liệu đã được xử lý bằng hàm {funcName}, nhưng AI chưa đưa ra câu trả lời cuối cùng.";
                    }
                }
            }
            
            return "Không tìm thấy nội dung văn bản trong phản hồi của AI.";
        }
        catch (Exception ex)
        {
            return $"Lỗi parse JSON ở Backend: {ex.Message}";
        }
    }
}