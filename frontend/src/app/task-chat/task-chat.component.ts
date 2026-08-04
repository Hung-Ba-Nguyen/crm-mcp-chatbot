import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatSidenavModule } from '@angular/material/sidenav';
import { HttpClient, HttpHeaders } from '@angular/common/http';

export interface Task {
  id: string;
  title: string;
  status: 'Todo' | 'InProgress' | 'Completed' | 'Cancelled' | string;
}

export interface ChatMessage {
  sender: 'User' | 'Bot' | string;
  content: string;
  timestamp: Date;
}

@Component({
  selector: 'app-task-chat',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatSidenavModule,
    MatListModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatFormFieldModule,
  ],
  templateUrl: './task-chat.component.html',
  styleUrl: './task-chat.component.scss',
})
export class TaskChatComponent implements OnInit {

  private readonly baseUrl = 'https://localhost:7209/api';
  private readonly userId = '6a709be6af0d8b17ec32592a';
  private readonly deptId = '6a709be6af0d8b17ec325927';
  
  // TODO: Dán chuỗi Token vào đây
  private readonly token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJodHRwOi8vc2NoZW1hcy54bWxzb2FwLm9yZy93cy8yMDA1LzA1L2lkZW50aXR5L2NsYWltcy9uYW1laWRlbnRpZmllciI6IjZhNzA5YmU2YWYwZDhiMTdlYzMyNTkyYSIsImh0dHA6Ly9zY2hlbWFzLnhtbHNvYXAub3JnL3dzLzIwMDUvMDUvaWRlbnRpdHkvY2xhaW1zL2VtYWlsYWRkcmVzcyI6ImRldjFAY29tcGFueS5jb20iLCJodHRwOi8vc2NoZW1hcy5taWNyb3NvZnQuY29tL3dzLzIwMDgvMDYvaWRlbnRpdHkvY2xhaW1zL3JvbGUiOiJVc2VyIiwiaHR0cDovL3NjaGVtYXMueG1sc29hcC5vcmcvd3MvMjAwNS8wNS9pZGVudGl0eS9jbGFpbXMvbmFtZSI6IlRy4bqnbiBUaOG7iyBM4bqtcCBUcsOsbmgiLCJleHAiOjE3ODU4MzQ2NjgsImlzcyI6IkNoYXRCb3QiLCJhdWQiOiJDaGF0Qm90In0.rjCL0GvsCuPrXvy2nw8_gMIQvbeN238lZ4hldkSyQzQ'; 

  // Khởi tạo HttpHeaders chứa Token
  private readonly httpOptions = {
    headers: new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.token}`
    })
  };

  // Inject HttpClient của Angular
  private http = inject(HttpClient);

  // Biến lưu trữ dữ liệu
  tasks: Task[] = [];
  messages: ChatMessage[] = [];
  selectedTask: Task | null = null;
  newMessage = '';

  ngOnInit(): void {
    this.loadUserTasks();
    
    // Gọi hàm test 3 công cụ MCP ngay khi trang vừa load xong
    this.testMcpTools();
  }

  // --- HÀM NGHIỆM THU: Test 3 công cụ MCP theo PRD ---
  testMcpTools(): void {
    console.log('--- BẮT ĐẦU KIỂM TRA 3 TOOL MCP ---');
    const url = `${this.baseUrl}/mcp`; 

    // Tool 1: get_user_tasks
    const payload1 = {
      jsonrpc: "2.0", id: `req-mcp-${new Date().getTime()}-1`, method: "get_user_tasks",
      params: { UserId: this.userId }
    };
    this.http.post<any>(url, payload1, this.httpOptions).subscribe({
      next: (res) => console.log('✅ 1. Dữ liệu Tool get_user_tasks:', res),
      error: (err) => console.error('❌ Lỗi Tool 1:', err)
    });

    // Tool 2: get_department_kpi
    const payload2 = {
      jsonrpc: "2.0", id: `req-mcp-${new Date().getTime()}-2`, method: "get_department_kpi", 
      params: { DepartmentId: this.deptId }
    };
    this.http.post<any>(url, payload2, this.httpOptions).subscribe({
      next: (res) => console.log('✅ 2. Dữ liệu Tool get_department_kpi:', res),
      error: (err) => console.error('❌ Lỗi Tool 2:', err)
    });

    // Tool 3: get_task_chat_history
    const payload3 = {
      jsonrpc: "2.0", id: `req-mcp-${new Date().getTime()}-3`, method: "get_task_chat_history", 
      params: { TaskId: "6a709be7af0d8b17ec32592c" } // Id trong data đã seed trong collection task_items
    };
    this.http.post<any>(url, payload3, this.httpOptions).subscribe({
      next: (res) => console.log('✅ 3. Dữ liệu Tool get_task_chat_history:', res),
      error: (err) => console.error('❌ Lỗi Tool 3:', err)
    });
  }

  // --- API 1: Lấy danh sách công việc của User ---
  loadUserTasks(): void {
    const url = `${this.baseUrl}/users/${this.userId}/tasks`;
    
    this.http.get<any>(url, this.httpOptions).subscribe({
      next: (response) => {
        let dataArray = [];
        if (Array.isArray(response)) {
            dataArray = response; 
        } else if (response && Array.isArray(response.tasks)) {
            dataArray = response.tasks; 
        } else if (response && Array.isArray(response.Tasks)) {
            dataArray = response.Tasks; 
        } else if (response && response.data && Array.isArray(response.data.tasks)) {
            dataArray = response.data.tasks; 
        } else if (response && response.data && Array.isArray(response.data)) {
            dataArray = response.data; 
        }

        if (dataArray && dataArray.length > 0) {
            this.tasks = dataArray.map((t: any) => ({
              id: t.id || t.Id,
              title: t.title || t.Title,
              status: t.status || t.Status
            }));
        } else {
            console.warn('Không tìm thấy danh sách công việc trong response!');
        }
      },
      error: (err) => {
        console.error('Lỗi khi lấy danh sách tasks:', err);
      }
    });
  }

  // --- API 2: Lịch sử Chat bằng MCP Json-RPC---
  selectTask(task: Task): void {
    this.selectedTask = task;
    this.messages = []; // Xóa tin nhắn cũ khi chuyển task
    
    const url = `${this.baseUrl}/mcp`;
    const rpcPayload = {
      jsonrpc: "2.0",
      id: `req-${new Date().getTime()}`,
      method: "get_task_chat_history", 
      params: { taskId: task.id }
    };

    this.http.post<any>(url, rpcPayload, this.httpOptions).subscribe({
      next: (response) => {
        console.log('Lịch sử chat MCP (Tương tác UI):', response);
        const rawMessages = response.result || response.Result || [];
        
        // Nếu có lịch sử chat thì map nó ra, nếu mảng rỗng thì UI tự hiện "Chưa có dữ liệu"
        if (Array.isArray(rawMessages) && rawMessages.length > 0) {
          this.messages = rawMessages.map((msg: any) => ({
             // Ép kiểu xem ai là người gửi (đề phòng backend trả về 'user', 'User', 'Role', v.v.)
            sender: (msg.role || msg.Role || msg.sender || msg.Sender || 'Bot').toString().toLowerCase() === 'user' ? 'User' : 'Bot',
            content: msg.content || msg.Content || msg.text || msg.Text || '',
            timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date()
          }));
        } else {
          this.messages = []; 
        }
      },
      error: (err) => {
        console.error('Lỗi khi gọi MCP:', err);
      }
    });
  }

  // --- API 3: Thống kê KPI Phòng ban---
  testKpiApi(): void {
    const url = `${this.baseUrl}/departments/${this.deptId}/kpi`;
    
    this.http.get<any>(url, this.httpOptions).subscribe({
      next: (response) => {
        alert(`KPI Phòng ${response.departmentName}:\n- Tổng Task: ${response.totalTasks}\n- Hoàn thành: ${response.completedTasks}\n- Đang làm: ${response.inProgressTasks}\n- Tỷ lệ: ${response.completionRate}%`);
      },
      error: (err) => {
        console.error('Lỗi lấy KPI:', err);
      }
    });
  }

  // --- API 4: Gửi tin nhắn mới cho AI (Đã chuẩn hóa theo tài liệu API) ---
  sendMessage(): void {
    const content = this.newMessage.trim();
    if (!content || !this.selectedTask) return;

    // 1. Hiển thị tin nhắn của User lên màn hình ngay lập tức cho mượt
    this.messages = [
      ...this.messages,
      { sender: 'User', content, timestamp: new Date() }
    ];
    this.newMessage = ''; // Xóa ô input

    // 2. Gọi API /api/chat theo đúng chuẩn tài liệu
    const url = `${this.baseUrl}/chat`;
    
    // Body gửi lên bao gồm Message, UserId, TaskId, DepartmentId
    const requestBody = {
      Message: content,
      UserId: this.userId,
      TaskId: this.selectedTask.id,
      DepartmentId: this.deptId
    };

    this.http.post<any>(url, requestBody, this.httpOptions).subscribe({
      next: (response) => {
        console.log('AI Trả lời:', response);
        
        let aiContent = "Lỗi đọc dữ liệu từ Bot.";
        
        // Hứng data trả về từ AI qua ApiResponse<ChatResponse>
        if (response && response.data && response.data.Answer) {
            aiContent = response.data.Answer;
        } else if (response && response.data && response.data.answer) {
            aiContent = response.data.answer;
        } else if (response && response.Answer) {
            aiContent = response.Answer; 
        }

        // Cập nhật câu trả lời của Bot lên giao diện
        this.messages = [
          ...this.messages,
          { sender: 'Bot', content: aiContent, timestamp: new Date() }
        ];
      },
      error: (err) => {
        console.error('Lỗi khi gửi tin nhắn:', err);
        this.messages = [
          ...this.messages,
          { sender: 'Bot', content: 'Có lỗi xảy ra khi kết nối với AI.', timestamp: new Date() }
        ];
      }
    });
  }
}