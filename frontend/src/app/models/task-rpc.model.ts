export interface JsonRpcRequest<T> {
  jsonrpc: '2.0';
  id: string;
  method: string;
  params: T;
}

export interface JsonRpcResponse<T> {
  jsonrpc: '2.0';
  id: string;
  result?: T;
  error?: {
    code: number;
    message: string;
  } | null;
}

export interface TaskItem {
  Id: string;
  Title: string;
  Description: string;
  Status: string;
  Priority: string;
  DepartmentId: string;
  AssigneeId: string;
  SupervisorIds: string[];
  DueDate: string;
  CreatedAt: string;
  CompletedAt: string | null;
}

export interface WorkloadSummary {
  UserId: string;
  UserName: string;
  TotalTasks: number;
  CompletedTasks: number;
  InProgressTasks: number;
  OverdueTasks: number;
  CompletionRate: number;
}
