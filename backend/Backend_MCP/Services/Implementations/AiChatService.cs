namespace Backend_MCP.Services.Implementations;

public class AiChatService : IAiChatService
{
    private readonly IMcpToolService _mcpToolService;
    private readonly IChatService _chatService;
    private readonly HttpClient _httpClient;
    private readonly IConfiguration _configuration;

    public AiChatService(
        IMcpToolService mcpToolService,
        IChatService chatService,
        HttpClient httpClient,
        IConfiguration configuration)
    {
        _mcpToolService = mcpToolService;
        _chatService = chatService;
        _httpClient = httpClient;
        _configuration = configuration;
    }

    public async Task<ChatResponse> AskAsync(AskAiRequest request, CancellationToken cancellationToken = default)
    {
        if (request is null)
        {
            throw new ArgumentNullException(nameof(request));
        }

        var apiKey = _configuration["Gemini:ApiKey"] ?? string.Empty;
        var apiUrl = $"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key={apiKey}";

        var session = await _chatService.EnsureSessionAsync(request.UserId, request.SessionId, request.SessionTitle, cancellationToken);
        await _chatService.SaveUserMessageAsync(request.UserId, session.SessionId, request.Message, cancellationToken);

        var contextMessages = await _chatService.GetContextMessagesAsync(session.SessionId, 20, cancellationToken);
        var contextText = contextMessages.Count == 0
            ? string.Empty
            : string.Join("\n", contextMessages.Select(message => $"[{message.Sender}] {message.Content}"));

        var contextPrompt = $"User Id hiện tại đang gọi hệ thống: {request.UserId}.";
        if (!string.IsNullOrWhiteSpace(request.TaskId))
        {
            contextPrompt += $" Context TaskId: {request.TaskId}.";
        }
        if (!string.IsNullOrWhiteSpace(request.DepartmentId))
        {
            contextPrompt += $" Context DepartmentId: {request.DepartmentId}.";
        }
        if (!string.IsNullOrWhiteSpace(contextText))
        {
            contextPrompt += $"\nLịch sử trò chuyện gần đây:\n{contextText}";
        }

        var toolsDeclaration = _mcpToolService.GetAvailableTools();

        var contentsList = new List<object>
        {
            new
            {
                role = "user",
                parts = new object[] { new { text = $"{contextPrompt}\nCâu hỏi: {request.Message}" } }
            }
        };

        string? lastFunctionName = null;
        var toolCallLogs = new List<McpToolCallLog>();

        const int maxRounds = 5;
        for (int round = 0; round < maxRounds; round++)
        {
            var requestBody = new
            {
                contents = contentsList.ToArray(),
                tools = toolsDeclaration
            };

            var response = await SendToGeminiAsync(apiUrl, requestBody, cancellationToken);
            var responseJson = await response.Content.ReadAsStringAsync(cancellationToken);

            using var doc = JsonDocument.Parse(responseJson);
            var root = doc.RootElement;

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

                    if (string.IsNullOrWhiteSpace(functionName))
                    {
                        break;
                    }

                    lastFunctionName = functionName;

                    var mcpRequest = new JsonRpcRequest
                    {
                        Id = Guid.NewGuid().ToString(),
                        Method = functionName,
                        Parameters = args
                    };

                    var mcpResponse = await _mcpToolService.HandleAsync(mcpRequest, cancellationToken);
                    toolCallLogs.Add(new McpToolCallLog
                    {
                        ToolName = functionName,
                        Arguments = args.GetRawText(),
                        ExecutedAt = DateTime.UtcNow,
                        Result = mcpResponse.Result is null ? null : JsonSerializer.Serialize(mcpResponse.Result)
                    });

                    JsonElement partsClone;
                    try
                    {
                        partsClone = JsonSerializer.Deserialize<JsonElement>(parts.GetRawText());
                    }
                    catch
                    {
                        using var tmpDoc = JsonDocument.Parse(parts.GetRawText());
                        partsClone = tmpDoc.RootElement.Clone();
                    }

                    contentsList.Add(new { role = "model", parts = partsClone });
                    contentsList.Add(new
                    {
                        role = "user",
                        parts = new object[]
                        {
                            new
                            {
                                functionResponse = new
                                {
                                    name = functionName,
                                    response = new { data = mcpResponse.Result }
                                }
                            }
                        }
                    });

                    continue;
                }
            }

            var finalAnswer = ExtractTextFromGeminiResponse(root);
            var responsePayload = new ChatResponse
            {
                Answer = finalAnswer,
                ToolUsed = lastFunctionName,
                ProcessedAt = DateTime.UtcNow
            };

            await _chatService.SaveAssistantMessageAsync(request.UserId, session.SessionId, responsePayload.Answer, toolCallLogs, cancellationToken);
            return responsePayload;
        }

        var fallbackPayload = new ChatResponse
        {
            Answer = "AI did not return a final textual answer after multiple tool calls.",
            ToolUsed = null,
            ProcessedAt = DateTime.UtcNow
        };

        await _chatService.SaveAssistantMessageAsync(request.UserId, session.SessionId, fallbackPayload.Answer, toolCallLogs, cancellationToken);
        return fallbackPayload;
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