import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatSidenavModule } from '@angular/material/sidenav';
import { HttpClient } from '@angular/common/http';
import { ChatService } from '../chat.service';
import { environment } from '../../environments/environment';

// Import các Standalone Component và Directive mới
import MarkdownRendererComponent from '../shared/markdown/markdown-renderer.component';
import { AutoScrollDirective } from '../directives/auto-scroll.directive';

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
    FormsModule,
    MatSidenavModule,
    MatListModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatFormFieldModule,
    MarkdownRendererComponent, // Sử dụng Custom Markdown
    AutoScrollDirective        // Kích hoạt directive tự động cuộn
  ],
  templateUrl: './task-chat.component.html',
  styleUrl: './task-chat.component.scss',
})
export class TaskChatComponent implements OnInit, OnDestroy {
  private readonly baseUrl = environment.apiUrl;
  private readonly userId = '6a709be6af0d8b17ec32592a';
  private readonly deptId = '6a709be6af0d8b17ec325927';
  private http = inject(HttpClient);
  private chatService = inject(ChatService);
  private router = inject(Router) as Router;
  private currentStreamController?: AbortController;
  private currentStreamSub: import('rxjs').Subscription | null = null;

  // state
  tasks: Task[] = [];
  messages = signal<ChatMessage[]>([]);
  selectedTask: Task | null = null;
  newMessage = '';
  isBotTyping = signal(false);

  // lưu lịch sử chat của từng Task
  private chatCache = new Map<string, ChatMessage[]>();

  ngOnInit(): void {
    this.loadUserTasks();
    this.testMcpTools();
  }

  private linkifyTaskCodes(text: string): string {
    if (!text) return text;

    const replaced = text.replace(/\[Task\s+([A-Za-z0-9-]+)\]/g, (_match, id) => {
      const safeId = encodeURIComponent(id);
      return `[Task ${id}](/tasks/${safeId})`;
    });

    return replaced.replace(/\[([A-Za-z0-9-]{2,})\]/g, (match, maybeId) => {
      if (/^[A-Za-z0-9-]+$/.test(maybeId)) {
        const safe = encodeURIComponent(maybeId);
        return `[${maybeId}](/tasks/${safe})`;
      }
      return match;
    });
  }

  formatShortTime(ts?: Date): string {
    try {
      const d = ts ? new Date(ts) : new Date();
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }

  onMarkdownClick(event: Event): void {
    try {
      const target = event.target as HTMLElement;
      const anchor = target.closest('a') as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute('href') ?? '';
      if (!href) return;
      // deep link pattern /tasks/:id or tasks/:id
      const match = href.match(/\/?tasks\/?([A-Za-z0-9-_%]+)/i);
      if (match) {
        event.preventDefault();
        const id = decodeURIComponent(match[1]);
        this.router.navigate(['/tasks', id]).catch(() => { /* ignore */ });
      }
    } catch {
      // ignore
    }
  }

  testMcpTools(): void {
    const url = `${this.baseUrl}/mcp`;

    const payload1 = { jsonrpc: '2.0', id: `req-mcp-${Date.now()}-1`, method: 'get_user_tasks', params: { UserId: this.userId } };
    this.http.post<any>(url, payload1).subscribe({ next: res => console.log('get_user_tasks', res), error: err => console.error(err) });

    const payload2 = { jsonrpc: '2.0', id: `req-mcp-${Date.now()}-2`, method: 'get_department_kpi', params: { DepartmentId: this.deptId } };
    this.http.post<any>(url, payload2).subscribe({ next: res => console.log('get_department_kpi', res), error: err => console.error(err) });

    const payload3 = { jsonrpc: '2.0', id: `req-mcp-${Date.now()}-3`, method: 'get_task_chat_history', params: { TaskId: '6a709be7af0d8b17ec32592c' } };
    this.http.post<any>(url, payload3).subscribe({ next: res => console.log('get_task_chat_history', res), error: err => console.error(err) });
  }

  loadUserTasks(): void {
    const url = `${this.baseUrl}/users/${this.userId}/tasks`;
    this.http.get<any>(url).subscribe({
      next: (response) => {
        let dataArray: any[] = [];
        if (Array.isArray(response)) dataArray = response;
        else if (response && Array.isArray(response.tasks)) dataArray = response.tasks;
        else if (response && Array.isArray(response.Tasks)) dataArray = response.Tasks;
        else if (response && response.data && Array.isArray(response.data.tasks)) dataArray = response.data.tasks;
        else if (response && response.data && Array.isArray(response.data)) dataArray = response.data;

        if (dataArray && dataArray.length > 0) {
          this.tasks = dataArray.map((t: any) => ({ id: t.id || t.Id, title: t.title || t.Title, status: t.status || t.Status }));
        } else {
          this.tasks = [];
        }
      },
      error: (err) => console.error('Lỗi khi lấy danh sách tasks:', err),
    });
  }

  selectTask(task: Task): void {
    // 1. Lưu lại lịch sử hiện tại vào Cache trước khi đi
    if (this.selectedTask) {
      this.chatCache.set(this.selectedTask.id, this.messages());
    }

    // 2. KHÔNG giết API nữa! Để nó chạy ngầm. Chỉ tắt hiệu ứng "Typing..." ở màn hình hiện tại
    this.isBotTyping.set(false);

    // 3. Đổi sang Task MỚI
    this.selectedTask = task;

    // 4. Lấy dữ liệu từ Cache (nếu có)
    if (this.chatCache.has(task.id)) {
      this.messages.set(this.chatCache.get(task.id) || []);
      return;
    }

    // 5. Nếu chưa có Cache, tiến hành gọi API get_task_chat_history
    this.messages.set([]);
    const url = `${this.baseUrl}/mcp`;
    const rpcPayload = { jsonrpc: '2.0', id: `req-${Date.now()}`, method: 'get_task_chat_history', params: { taskId: task.id } };

    this.http.post<any>(url, rpcPayload).subscribe({
      next: (response) => {
        const rawMessages = response?.result || response?.Result || [];
        if (Array.isArray(rawMessages) && rawMessages.length > 0) {
          const mapped = rawMessages.map((msg: any) => {
            const text = msg.content || msg.Content || msg.text || msg.Text || '';
            return {
              sender: ((msg.role || msg.Role || msg.sender || msg.Sender || 'bot').toString().toLowerCase() === 'user') ? 'user' : 'bot',
              text,
              processedText: this.linkifyTaskCodes(text),
              timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
            } as ChatMessage;
          });
          this.messages.set(mapped);
          this.chatCache.set(task.id, mapped);
        } else {
          this.messages.set([]);
        }
      },
      error: (err) => {
        console.error('Lỗi khi lấy lịch sử chat:', err);
      }
    });
  }

  // quick KPI tester
  testKpiApi(): void {
    const url = `${this.baseUrl}/departments/${this.deptId}/kpi`;
    this.http.get<any>(url).subscribe({
      next: response => {
        alert(`KPI Phòng ${response.departmentName}:\n- Tổng Task: ${response.totalTasks}\n- Hoàn thành: ${response.completedTasks}\n- Đang làm: ${response.inProgressTasks}\n- Tỷ lệ: ${response.completionRate}%`);
      }, error: err => console.error('Lỗi lấy KPI:', err)
    });
  }

  sendMessage(): void {
    const content = (this.newMessage || '').trim();
    if (!content || !this.selectedTask) return;

    const currentActiveTaskId = this.selectedTask.id;
    const userMsg: ChatMessage = { sender: 'user', text: content, processedText: this.linkifyTaskCodes(content), timestamp: new Date() };

    // Update UI và lấy Index của tin nhắn Bot
    this.messages.update(prev => [...prev, userMsg, { sender: 'bot', text: '', processedText: '', timestamp: new Date() }]);
    const botIndex = this.messages().length - 1;

    // ÉP LƯU VÀO CACHE NGAY LẬP TỨC: Đề phòng user chuyển tab nhanh như chớp trước khi bot kịp trả lời
    this.chatCache.set(currentActiveTaskId, this.messages());

    this.newMessage = '';
    this.isBotTyping.set(true);

    const requestBody = { Message: content, UserId: this.userId, TaskId: currentActiveTaskId, DepartmentId: this.deptId };

    // HÀM HELPER CHẠY NGẦM: Cập nhật tin nhắn dù user có đang ở Tab này hay không
    const updateMessageBackground = (chunk: string, isError: boolean = false, isOverwrite: boolean = false) => {
      const isActiveTab = this.selectedTask?.id === currentActiveTaskId;
      let targetArray = isActiveTab ? this.messages() : (this.chatCache.get(currentActiveTaskId) || []);

      if (targetArray.length <= botIndex) return; // Safety check

      const copy = [...targetArray];
      const existing = copy[botIndex];

      let newText = existing.text || '';
      if (isError) newText += '\n\n[Lỗi kết nối API]';
      else if (isOverwrite) newText = chunk;
      else newText += chunk;

      copy[botIndex] = { ...existing, text: newText, processedText: this.linkifyTaskCodes(newText) };

      if (isActiveTab) this.messages.set(copy);
      this.chatCache.set(currentActiveTaskId, copy); // Luôn đồng bộ vào Cache
    };

    const hasStream = typeof (this.chatService as any).sendMessageStream === 'function';
    if (hasStream) {
      // Mỗi tin nhắn tạo 1 luồng độc lập, không dùng chung AbortController
      const abortCtrl = new AbortController();
      const stream$ = (this.chatService as any).sendMessageStream(requestBody, abortCtrl.signal) as import('rxjs').Observable<string>;

      stream$.subscribe({
        next: (chunk: string) => updateMessageBackground(chunk),
        error: (err) => {
          console.error('Stream error', err);
          updateMessageBackground('', true);
          if (this.selectedTask?.id === currentActiveTaskId) this.isBotTyping.set(false);
        },
        complete: () => {
          if (this.selectedTask?.id === currentActiveTaskId) this.isBotTyping.set(false);
        }
      });
    } else {
      const send$ = (this.chatService && this.chatService.sendMessage) ? this.chatService.sendMessage(requestBody) : this.http.post<any>(`${this.baseUrl}/chat`, requestBody);

      send$.subscribe({
        next: (response: any) => {
          if (this.selectedTask?.id === currentActiveTaskId) this.isBotTyping.set(false);
          const botText = response?.Answer || response?.answer || response?.result || (typeof response === 'string' ? response : '') || 'No response';
          updateMessageBackground(botText, false, true);
        },
        error: (err) => {
          console.error('Error sending chat message', err);
          if (this.selectedTask?.id === currentActiveTaskId) this.isBotTyping.set(false);
          updateMessageBackground('', true);
        }
      });
    }
  }

  ngOnDestroy(): void {
    try { this.currentStreamController?.abort(); } catch { }
    try { this.currentStreamSub?.unsubscribe(); } catch { }
  }

  trackByMessage(_index: number, message: ChatMessage): string | number {
    return message.timestamp ? message.timestamp.getTime() : _index;
  }

  trackByTask(_index: number, task: Task): string {
    return task.id;
  }
}
