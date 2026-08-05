import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatSidenavModule } from '@angular/material/sidenav';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { ChatService } from '../chat.service';
import { MarkdownModule } from 'ngx-markdown';
import { environment } from '../../environments/environment';

export interface Task {
  id: string;
  title: string;
  status: 'Todo' | 'InProgress' | 'Completed' | 'Cancelled' | string;
}

export interface ChatMessage {
  sender: 'user' | 'bot';
  text: string;
  processedText?: string;
  timestamp?: Date;
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
    MarkdownModule,
  ],
  templateUrl: './task-chat.component.html',
  styleUrl: './task-chat.component.scss',
})
export class TaskChatComponent implements OnInit {

  // Thêm tham chiếu đến khung chat và biến trạng thái
  @ViewChild('chatContainer') private chatContainer!: ElementRef;
  isBotTyping: boolean = false;

  private readonly baseUrl = environment.apiUrl;
  private readonly userId = '6a709be6af0d8b17ec32592a';
  private readonly deptId = '6a709be6af0d8b17ec325927';
  

  // Inject HttpClient và ChangeDetectorRef (Giải quyết lỗi lười cập nhật UI)
  private http = inject(HttpClient);
  private cdr = inject(ChangeDetectorRef);
  private chatService = inject(ChatService);

  // Biến lưu trữ dữ liệu
  tasks: Task[] = [];
  messages: ChatMessage[] = [];
  selectedTask: Task | null = null;
  newMessage = '';

  ngOnInit(): void {
    this.loadUserTasks();
    this.testMcpTools();
  }

  // Convert patterns like [Task CV01] into markdown links to /tasks/CV01
  private linkifyTaskCodes(text: string): string {
    if (!text) return text;

    // Replace [Task CV01] -> [Task CV01](/tasks/CV01)
    const replaced = text.replace(/\[Task\s+([A-Za-z0-9-]+)\]/g, (_match, id) => {
      const safeId = encodeURIComponent(id);
      return `[Task ${id}](/tasks/${safeId})`;
    });

    // Optional: also convert simple [CV01] -> [CV01](/tasks/CV01)
    return replaced.replace(/\[([A-Za-z0-9-]{2,})\]/g, (match, maybeId) => {
      if (/^[A-Za-z0-9-]+$/.test(maybeId)) {
        const safe = encodeURIComponent(maybeId);
        return `[${maybeId}](/tasks/${safe})`;
      }
      return match;
    });
  }

  // 3. Hàm xử lý cuộn xuống đáy chat
  private scrollToBottom(): void {
    setTimeout(() => {
      try {
        if (this.chatContainer) {
          this.chatContainer.nativeElement.scrollTop = this.chatContainer.nativeElement.scrollHeight;
        }
      } catch(err) { }
    }, 50);
  }

  // --- HÀM NGHIỆM THU: Test 3 công cụ MCP theo PRD ---
  testMcpTools(): void {
    console.log('--- BẮT ĐẦU KIỂM TRA 3 TOOL MCP ---');
    const url = `${this.baseUrl}/mcp`; 

    const payload1 = {
      jsonrpc: "2.0", id: `req-mcp-${new Date().getTime()}-1`, method: "get_user_tasks",
      params: { UserId: this.userId }
    };
    this.http.post<any>(url, payload1).subscribe({
      next: (res) => console.log('✅ 1. Dữ liệu Tool get_user_tasks:', res),
      error: (err) => console.error('❌ Lỗi Tool 1:', err)
    });

    const payload2 = {
      jsonrpc: "2.0", id: `req-mcp-${new Date().getTime()}-2`, method: "get_department_kpi", 
      params: { DepartmentId: this.deptId }
    };
    this.http.post<any>(url, payload2).subscribe({
      next: (res) => console.log('✅ 2. Dữ liệu Tool get_department_kpi:', res),
      error: (err) => console.error('❌ Lỗi Tool 2:', err)
    });

    const payload3 = {
      jsonrpc: "2.0", id: `req-mcp-${new Date().getTime()}-3`, method: "get_task_chat_history", 
      params: { TaskId: "6a709be7af0d8b17ec32592c" } 
    };
    this.http.post<any>(url, payload3).subscribe({
      next: (res) => console.log('✅ 3. Dữ liệu Tool get_task_chat_history:', res),
      error: (err) => console.error('❌ Lỗi Tool 3:', err)
    });
  }

  // --- API 1: Lấy danh sách công việc của User ---
  loadUserTasks(): void {
    const url = `${this.baseUrl}/users/${this.userId}/tasks`;
    
    this.http.get<any>(url).subscribe({
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
    this.messages = []; 
    
    const url = `${this.baseUrl}/mcp`;
    const rpcPayload = {
      jsonrpc: "2.0",
      id: `req-${new Date().getTime()}`,
      method: "get_task_chat_history", 
      params: { taskId: task.id }
    };

    this.http.post<any>(url, rpcPayload).subscribe({
      next: (response) => {
        console.log('Lịch sử chat MCP (Tương tác UI):', response);
        const rawMessages = response.result || response.Result || [];
        
        if (Array.isArray(rawMessages) && rawMessages.length > 0) {
          this.messages = rawMessages.map((msg: any) => {
            const text = msg.content || msg.Content || msg.text || msg.Text || '';
            return {
              sender: ((msg.role || msg.Role || msg.sender || msg.Sender || 'bot').toString().toLowerCase() === 'user') ? 'user' : 'bot',
              text,
              processedText: this.linkifyTaskCodes(text),
              timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date()
            } as ChatMessage;
          });
          
          // Cập nhật UI và cuộn xuống sau khi load lịch sử
          this.cdr.detectChanges();
          this.scrollToBottom();
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
    
    this.http.get<any>(url).subscribe({
      next: (response) => {
        alert(`KPI Phòng ${response.departmentName}:\n- Tổng Task: ${response.totalTasks}\n- Hoàn thành: ${response.completedTasks}\n- Đang làm: ${response.inProgressTasks}\n- Tỷ lệ: ${response.completionRate}%`);
      },
      error: (err) => {
        console.error('Lỗi lấy KPI:', err);
      }
    });
  }

  // --- API 4: Gửi tin nhắn mới cho AI ---
  sendMessage(): void {
    const content = this.newMessage.trim();
    if (!content || !this.selectedTask) return;

    // Push user message
    this.messages = [...this.messages, { sender: 'user', text: content, timestamp: new Date() }];
    this.newMessage = '';

    // Show typing indicator
    this.isBotTyping = true;
    this.cdr.detectChanges();
    this.scrollToBottom();

    const requestBody = {
      Message: content,
      UserId: this.userId,
      TaskId: this.selectedTask.id,
      DepartmentId: this.deptId
    };

    // Use ChatService if available, otherwise fallback to HttpClient
    const send$ = (this.chatService && this.chatService.sendMessage)
      ? this.chatService.sendMessage(requestBody)
      : this.http.post<any>(`${this.baseUrl}/chat`, requestBody);

    send$.subscribe({
      next: (response: any) => {
        this.isBotTyping = false;

        let aiText = 'Bot did not return an answer.';
        if (response) {
          const payload = response.data || response.Data || response;
          aiText = payload.answer || payload.Answer || payload.text || payload.Text || (typeof payload === 'string' ? payload : 'Bot did not return an answer.');
        }

        this.messages = [...this.messages, { sender: 'bot', text: aiText, processedText: this.linkifyTaskCodes(aiText), timestamp: new Date() }];
        this.cdr.detectChanges();
        this.scrollToBottom();
      },
      error: (err: any) => {
        console.error('Lỗi khi gửi tin nhắn:', err);
        this.isBotTyping = false;
        this.messages = [...this.messages, { sender: 'bot', text: 'Có lỗi xảy ra khi kết nối với AI.', timestamp: new Date() }];
        this.cdr.detectChanges();
        this.scrollToBottom();
      }
    });
  }
}
