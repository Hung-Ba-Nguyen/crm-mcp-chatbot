namespace Backend_MCP.Models.Responses;

public class WorkloadSummaryResponse
{
    public string UserId { get; set; } = string.Empty;

    public string UserName { get; set; } = string.Empty;

    public int TotalTasks { get; set; }

    public int CompletedTasks { get; set; }

    public int InProgressTasks { get; set; }

    public int OverdueTasks { get; set; }

    public decimal CompletionRate { get; set; }
}
