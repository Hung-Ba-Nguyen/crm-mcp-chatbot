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
    private readonly ITaskService _taskService;

    public McpToolService(
        IDepartmentService departmentService,
        ITaskChatService taskChatService,
        IUserService userService,
        ITaskService taskService)
    {
        _departmentService = departmentService;
        _taskChatService = taskChatService;
        _userService = userService;
        _taskService = taskService;
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
                "create_task" => await HandleCreateTaskAsync(request, cancellationToken),
                "update_task_status" => await HandleUpdateTaskStatusAsync(request, cancellationToken),
                "get_overdue_tasks" => await HandleOverdueTasksAsync(request, cancellationToken),
                "get_workload_summary" => await HandleWorkloadSummaryAsync(request, cancellationToken),
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

    private async Task<JsonRpcResponse> HandleCreateTaskAsync(JsonRpcRequest request, CancellationToken cancellationToken)
    {
        var payload = DeserializeParameter<CreateTaskRequest>(request.Parameters);
        if (payload is null)
        {
            return JsonRpcResponse.Failure(-32602, "Invalid params", request.Id);
        }

        return JsonRpcResponse.Success(await _taskService.CreateAsync(payload, cancellationToken), request.Id);
    }

    private async Task<JsonRpcResponse> HandleUpdateTaskStatusAsync(JsonRpcRequest request, CancellationToken cancellationToken)
    {
        var payload = DeserializeParameter<UpdateTaskStatusRequest>(request.Parameters);
        if (payload is null || string.IsNullOrWhiteSpace(payload.TaskId) || !Enum.TryParse<Backend_MCP.Models.Enums.TaskStatus>(payload.Status, true, out var status))
        {
            return JsonRpcResponse.Failure(-32602, "Invalid params", request.Id);
        }

        var result = await _taskService.UpdateStatusAsync(payload.TaskId, status, cancellationToken);
        return result is null
            ? JsonRpcResponse.Failure(-32004, "Task not found", request.Id)
            : JsonRpcResponse.Success(result, request.Id);
    }

    private async Task<JsonRpcResponse> HandleOverdueTasksAsync(JsonRpcRequest request, CancellationToken cancellationToken)
    {
        var payload = DeserializeParameter<GetOverdueTasksRequest>(request.Parameters);
        if (payload is null)
        {
            return JsonRpcResponse.Failure(-32602, "Invalid params", request.Id);
        }

        return JsonRpcResponse.Success(await _taskService.GetOverdueAsync(payload.DepartmentId, payload.Limit, cancellationToken), request.Id);
    }

    private async Task<JsonRpcResponse> HandleWorkloadSummaryAsync(JsonRpcRequest request, CancellationToken cancellationToken)
    {
        var payload = DeserializeParameter<GetWorkloadSummaryRequest>(request.Parameters);
        if (payload is null)
        {
            return JsonRpcResponse.Failure(-32602, "Invalid params", request.Id);
        }

        return JsonRpcResponse.Success(await _taskService.GetWorkloadSummaryAsync(payload, cancellationToken), request.Id);
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
                    },
                    new
                    {
                        name = "create_task",
                        description = "Tạo mới một task với thông tin tiêu đề, mô tả, phòng ban, người được giao và hạn hoàn thành.",
                        parameters = new
                        {
                            type = "object",
                            properties = new
                            {
                                title = new { type = "string", description = "Tiêu đề công việc" },
                                description = new { type = "string", description = "Mô tả công việc" },
                                departmentId = new { type = "string", description = "ID phòng ban phụ trách" },
                                assigneeId = new { type = "string", description = "ID người được giao" },
                                supervisorIds = new { type = "array", description = "Danh sách ID người giám sát" },
                                dueDate = new { type = "string", description = "Hạn hoàn thành theo định dạng ISO 8601" },
                                priority = new { type = "string", description = "Độ ưu tiên, ví dụ Low, Medium, High, Critical" }
                            },
                            required = new[] { "title", "description", "departmentId", "dueDate" }
                        }
                    },
                    new
                    {
                        name = "update_task_status",
                        description = "Cập nhật trạng thái của một task theo taskId.",
                        parameters = new
                        {
                            type = "object",
                            properties = new
                            {
                                taskId = new { type = "string", description = "ID của task cần cập nhật" },
                                status = new { type = "string", description = "Trạng thái mới, ví dụ Todo, InProgress, Completed, Cancelled" }
                            },
                            required = new[] { "taskId", "status" }
                        }
                    },
                    new
                    {
                        name = "get_overdue_tasks",
                        description = "Lấy danh sách task quá hạn, có thể lọc theo departmentId và giới hạn số lượng kết quả.",
                        parameters = new
                        {
                            type = "object",
                            properties = new
                            {
                                departmentId = new { type = "string", description = "ID phòng ban để lọc task quá hạn" },
                                limit = new { type = "integer", description = "Giới hạn số lượng task trả về" }
                            }
                        }
                    },
                    new
                    {
                        name = "get_workload_summary",
                        description = "Tóm tắt workload theo từng user hoặc theo department để xem tổng số task, hoàn thành, đang làm và quá hạn.",
                        parameters = new
                        {
                            type = "object",
                            properties = new
                            {
                                userId = new { type = "string", description = "ID người dùng cần xem workload" },
                                departmentId = new { type = "string", description = "ID phòng ban cần tổng hợp workload" }
                            }
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