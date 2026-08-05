namespace Backend_MCP.Services.Implementations;

using System;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

public class McpToolService : IMcpToolService
{
    private readonly IDepartmentService _departmentService;
    private readonly ITaskChatService _taskChatService;
    private readonly IUserService _userService;

    public McpToolService(
        IDepartmentService departmentService,
        ITaskChatService taskChatService,
        IUserService userService)
    {
        _departmentService = departmentService;
        _taskChatService = taskChatService;
        _userService = userService;
    }

    public async Task<JsonRpcResponse> HandleAsync(JsonRpcRequest request, CancellationToken cancellationToken = default)
    {
        try
        {
            return request.Method switch
            {
                "get_user_tasks" => await HandleUsersTasksAsync(request, cancellationToken),
                "get_department_kpi" => await HandleDepartmentKpiAsync(request, cancellationToken),
                "get_task_chat_history" => await HandleChatHistoryAsync(request, cancellationToken),
                _ => JsonRpcResponse.Failure(-32601, $"Method not found: {request.Method}", request.Id)
            };
        }
        catch (Exception exception)
        {
            return JsonRpcResponse.Failure(-32603, exception.Message, request.Id);
        }
    }

    private async Task<JsonRpcResponse> HandleDepartmentKpiAsync(JsonRpcRequest request, CancellationToken cancellationToken)
    {
        var payload = DeserializeParameter<GetDepartmentKpiRequest>(request.Parameters);
        if (payload is null)
        {
            return JsonRpcResponse.Failure(-32602, "Invalid params", request.Id);
        }

        return JsonRpcResponse.Success(await _departmentService.GetKpiAsync(payload, cancellationToken), request.Id);
    }

    private async Task<JsonRpcResponse> HandleChatHistoryAsync(JsonRpcRequest request, CancellationToken cancellationToken)
    {
        var payload = DeserializeParameter<GetTaskChatHistoryRequest>(request.Parameters);
        if (payload is null)
        {
            return JsonRpcResponse.Failure(-32602, "Invalid params", request.Id);
        }

        return JsonRpcResponse.Success(await _taskChatService.GetHistoryAsync(payload, cancellationToken), request.Id);
    }

    private async Task<JsonRpcResponse> HandleUsersTasksAsync(JsonRpcRequest request, CancellationToken cancellationToken)
    {
        var payload = DeserializeParameter<GetUserTasksRequest>(request.Parameters);
        if (payload is null || string.IsNullOrWhiteSpace(payload.UserId))
        {
            return JsonRpcResponse.Failure(-32602, "Invalid params", request.Id);
        }

        return JsonRpcResponse.Success(await _userService.GetUserTasksAsync(payload, cancellationToken), request.Id);
    }

    public object GetAvailableTools()
    {
        return new object[]
        {
            new
            {
                functionDeclarations = new object[]
                {
                    new
                    {
                        name = "get_department_kpi",
                        description = "Tính toán KPI của phòng ban theo departmentId, gồm tổng task, hoàn thành, đang làm, trễ hạn và tỷ lệ hoàn thành.",
                        parameters = new
                        {
                            type = "object",
                            properties = new
                            {
                                departmentId = new { type = "string", description = "ID của phòng ban cần tính KPI" }
                            },
                            required = new[] { "departmentId" }
                        }
                    },
                    new
                    {
                        name = "get_task_chat_history",
                        description = "Lấy toàn bộ lịch sử tin nhắn và bình luận của một task theo taskId.",
                        parameters = new
                        {
                            type = "object",
                            properties = new
                            {
                                taskId = new { type = "string", description = "ID của công việc cần xem lịch sử trao đổi" }
                            },
                            required = new[] { "taskId" }
                        }
                    },
                    new
                    {
                        name = "get_user_tasks",
                        description = "Lấy danh sách task của một user theo userId, có hỗ trợ bộ lọc status, priority và limit.",
                        parameters = new
                        {
                            type = "object",
                            properties = new
                            {
                                userId = new { type = "string", description = "ID của người dùng cần tra cứu task" },
                                filters = new
                                {
                                    type = "object",
                                    description = "Bộ lọc tùy chọn để thu hẹp danh sách task",
                                    properties = new
                                    {
                                        status = new { type = "string", description = "Trạng thái task, ví dụ: Todo, InProgress, Completed, Cancelled" },
                                        priority = new { type = "string", description = "Độ ưu tiên task, ví dụ: Low, Medium, High, Critical" },
                                        limit = new { type = "integer", description = "Giới hạn số lượng task trả về" }
                                    }
                                }
                            },
                            required = new[] { "userId" }
                        }
                    }
                }
            }
        };
    }

    private static T? DeserializeParameter<T>(JsonElement? parameters)
    {
        if (parameters is null || parameters.Value.ValueKind == JsonValueKind.Null || parameters.Value.ValueKind == JsonValueKind.Undefined)
        {
            return default;
        }

        return JsonSerializer.Deserialize<T>(parameters.Value.GetRawText());
    }
}