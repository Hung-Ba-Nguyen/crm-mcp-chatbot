import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable, map } from 'rxjs';
import { JsonRpcRequest, JsonRpcResponse, TaskItem, WorkloadSummary } from '../models/task-rpc.model';

@Injectable({ providedIn: 'root' })
export class TaskRpcService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/mcp`; 

  private callRpc<T>(method: string, params: any): Observable<T> {
    const payload: JsonRpcRequest<any> = {
      jsonrpc: '2.0',
      id: `req-${Date.now()}`,
      method,
      params
    };

    return this.http.post<JsonRpcResponse<T>>(this.apiUrl, payload).pipe(
      map(res => {
        if (res.error) {
          throw new Error(res.error.message || 'Lỗi từ MCP Server');
        }
        if (res.result === undefined) {
          throw new Error('Không nhận được dữ liệu (Result is undefined)');
        }
        return res.result;
      })
    );
  }

  createTask(params: { title?: string; description?: string; departmentId?: string; assigneeId?: string; dueDate?: string; priority?: string; supervisorIds?: string[] } | any): Observable<TaskItem> {
    // Ensure PascalCase keys for backend
    const payload = {
      Title: params.Title ?? params.title,
      Description: params.Description ?? params.description,
      DepartmentId: params.DepartmentId ?? params.departmentId,
      AssigneeId: params.AssigneeId ?? params.assigneeId,
      DueDate: params.DueDate ?? params.dueDate,
      Priority: params.Priority ?? params.priority,
      SupervisorIds: params.SupervisorIds ?? params.supervisorIds
    };

    return this.callRpc<TaskItem>('create_task', payload);
  }

  updateTaskStatus(taskId: string, status: number | string): Observable<TaskItem> {
    return this.callRpc<TaskItem>('update_task_status', { TaskId: taskId, Status: status });
  }

  getOverdueTasks(departmentId: string, limit: number = 20): Observable<TaskItem[]> {
    return this.callRpc<TaskItem[]>('get_overdue_tasks', { DepartmentId: departmentId, Limit: limit });
  }

  getWorkloadSummary(params: { userId?: string; departmentId?: string } | any): Observable<WorkloadSummary[]> {
    const payload = {
      UserId: params.UserId ?? params.userId,
      DepartmentId: params.DepartmentId ?? params.departmentId
    };
    return this.callRpc<WorkloadSummary[]>('get_workload_summary', payload);
  }
}
