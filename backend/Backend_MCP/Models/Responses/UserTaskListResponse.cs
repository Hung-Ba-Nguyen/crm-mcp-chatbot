namespace Backend_MCP.Models.Responses;

// Dùng để gom danh sách task của một user vào một object.
public class UserTaskListResponse
{
    public string UserId { get; set; } = string.Empty;

    public string UserName { get; set; } = string.Empty;

    public List<TaskItemResponse> Tasks { get; set; } = [];
}