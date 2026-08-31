import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable, map } from 'rxjs';
import { JsonRpcRequest, JsonRpcResponse, TaskItem, WorkloadSummary } from '../models/task-rpc.model';

@Injectable({ providedIn: 'root' })
export class TaskRpcService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl.replace(/\/+$/, '')}/mcp`;

  public rpc<T>(method: string, params: any = {}): Observable<T> {
    const payload: JsonRpcRequest<any> = {
      jsonrpc: '2.0',
      id: `req-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      method,
      params
    };

    const headers = new HttpHeaders({ 'Content-Type': 'application/json' });

    return this.http.post<JsonRpcResponse<T>>(this.apiUrl, payload, { headers }).pipe(
      map(res => {
        if (!res) throw new Error('Empty response from RPC server');
        if (res.error) throw new Error(res.error.message ?? `RPC Error code=${res.error.code}`);
        if (typeof res.result === 'undefined') throw new Error('RPC result is undefined');
        return res.result as T;
      })
    );
  }

  // Ép toàn bộ payload sang PascalCase và map Priority sang số (Enum C#)
  public createTask(params: any): Observable<TaskItem> {
    // Chuyển đổi Priority từ String sang Number
    let priorityNum = 1; // Mặc định là Medium (1)
    const pStr = String(params.priority ?? params.Priority ?? 'Medium').toLowerCase();
    if (pStr === 'low' || pStr === '0') priorityNum = 0;
    else if (pStr === 'medium' || pStr === '1') priorityNum = 1;
    else if (pStr === 'high' || pStr === '2') priorityNum = 2;

    const payload = {
      Title: params.title ?? params.Title,
      Description: params.description ?? params.Description,
      DepartmentId: params.departmentId ?? params.DepartmentId,
      AssigneeId: params.assigneeId ?? params.AssigneeId,
      DueDate: params.dueDate ?? params.DueDate,
      Priority: priorityNum, // <--- Đã gửi con số thay vì chữ
      SupervisorIds: params.supervisorIds ?? params.SupervisorIds ?? []
    };
    return this.rpc<TaskItem>('create_task', payload);
  }

  public updateTaskStatus(taskId: string, status: number | string): Observable<TaskItem> {
    return this.rpc<TaskItem>('update_task_status', { TaskId: taskId, Status: status });
  }

  public getOverdueTasks(departmentId: string, limit: number = 20): Observable<TaskItem[]> {
    return this.rpc<TaskItem[]>('get_overdue_tasks', { DepartmentId: departmentId, Limit: limit });
  }

  public getWorkloadSummary(params: { userId?: string; departmentId?: string } | any): Observable<WorkloadSummary[]> {
    const payload: any = {};
    if (params.UserId || params.userId) payload.UserId = params.UserId ?? params.userId;
    if (params.DepartmentId || params.departmentId) payload.DepartmentId = params.DepartmentId ?? params.departmentId;
    return this.rpc<WorkloadSummary[]>('get_workload_summary', payload);
  }

  public updateTask(taskId: string, payload: any): Observable<TaskItem> {
    const url = `${environment.apiUrl.replace(/\/+$/, '')}/Tasks/${taskId}`;
    return this.http.put<TaskItem>(url, payload);
  }
}
