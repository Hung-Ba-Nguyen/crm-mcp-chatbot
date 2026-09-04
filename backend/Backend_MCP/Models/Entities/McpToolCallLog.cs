namespace Backend_MCP.Models.Entities;

public class McpToolCallLog
{
    public string ToolName { get; set; } = string.Empty;

    public string? Arguments { get; set; }

    public DateTime ExecutedAt { get; set; } = DateTime.UtcNow;

    public string? Result { get; set; }
}
