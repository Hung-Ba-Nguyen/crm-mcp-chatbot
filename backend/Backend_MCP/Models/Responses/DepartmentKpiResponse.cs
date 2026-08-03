namespace Backend_MCP.Models.Responses;

// Dùng để trả về số liệu tổng hợp của một phòng ban.
public class DepartmentKpiResponse
{
    public string DepartmentId { get; set; } = string.Empty;

    public string DepartmentName { get; set; } = string.Empty;

    public int TotalTasks { get; set; }

    public int CompletedTasks { get; set; }

    public int InProgressTasks { get; set; }

    public int OverdueTasks { get; set; }

    public decimal CompletionRate { get; set; }
}