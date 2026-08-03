namespace Backend_MCP.Models.Responses;

public class ChatResponse
{
    public string Answer { get; set; } = string.Empty;
    public string? ToolUsed { get; set; }
    public DateTime ProcessedAt { get; set; } = DateTime.UtcNow;
}