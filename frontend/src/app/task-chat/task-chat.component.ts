import { Component, OnInit, OnDestroy, inject, signal, HostListener, ChangeDetectorRef } from '@angular/core';
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
  // Department is inferred from the user's JWT on the backend; do not hardcode here
  private http = inject(HttpClient);
  private chatService = inject(ChatService);
  private router = inject(Router) as Router;
  private cdr = inject(ChangeDetectorRef);
  private currentStreamController?: AbortController;
  private currentStreamSub: import('rxjs').Subscription | null = null;
  // typing simulation: queue per bot message index and interval handles
  private typingQueues = new Map<number, string>();
  private typingIntervals = new Map<number, any>();

  // state
  tasks: Task[] = [];
  messages = signal<ChatMessage[]>([]);
  selectedTask: Task | null = null;
  newMessage = '';
  isBotTyping = signal(false);

  // KPI modal state
  showKpiModal = signal(false);
  kpiData = signal<{ departmentName?: string; totalTasks?: number; completedTasks?: number; inProgressTasks?: number; completionRate?: number } | null>(null);

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

  // Summarize the selected task by asking the LLM for a concise summary
  summarizeTask(): void {
    if (!this.selectedTask) return;

    const prompt = 'Please summarize the current status and blockers of this task.';
    const currentActiveTaskId = this.selectedTask.id;

    // push a user-like info message to indicate action
    const userMsg: ChatMessage = { sender: 'user', text: '[Request] Summarize task', processedText: '[Request] Summarize task', timestamp: new Date() };
    this.messages.update(prev => [...prev, userMsg, { sender: 'bot', text: '', processedText: '', timestamp: new Date() }]);
    const botIndex = this.messages().length - 1;
    this.chatCache.set(currentActiveTaskId, this.messages());
    this.isBotTyping.set(true);

    const requestBody = { Message: prompt, TaskId: currentActiveTaskId };

    const hasStream = typeof (this.chatService as any).sendMessageStream === 'function';
    if (hasStream) {
      const abortCtrl = new AbortController();
      const stream$ = (this.chatService as any).sendMessageStream(requestBody, abortCtrl.signal) as import('rxjs').Observable<string>;

      stream$.subscribe({
        next: (chunk: string) => {
          // Normalize chunk: if it contains a JSON wrapper like {.."data":{ "answer": "..." }..}
          // extract only the inner answer text. Otherwise treat as plain incremental text.
          const extractAnswer = (input: string): string => {
            if (!input) return '';
            const s = input.trim();
            // Quick attempt: full JSON
            try {
              const obj = JSON.parse(s);
              return obj?.data?.answer ?? obj?.Answer ?? obj?.answer ?? input;
            } catch {
              // try to find a JSON substring
              const match = s.match(/\{[\s\S]*\}/);
              if (match) {
                try {
                  const obj = JSON.parse(match[0]);
                  return obj?.data?.answer ?? obj?.Answer ?? obj?.answer ?? input;
                } catch {
                  /* fallthrough */
                }
              }
            }
            return input;
          };

          const piece = extractAnswer(chunk);

          // Simulate typewriter: enqueue characters and start an interval if needed.
          const queueKey = botIndex;
          const existingQueue = this.typingQueues.get(queueKey) || '';
          this.typingQueues.set(queueKey, existingQueue + piece);

          if (!this.typingIntervals.has(queueKey)) {
            // Bot has started producing output; hide the thinking indicator
            try { this.isBotTyping.set(false); } catch { }
            const intervalMs = 18; // typing speed per character
            const intervalHandle = setInterval(() => {
              const q = this.typingQueues.get(queueKey) || '';
              if (!q) {
                // nothing to type currently; stop interval until new data arrives
                clearInterval(intervalHandle);
                this.typingIntervals.delete(queueKey);
                this.typingQueues.delete(queueKey);
                return;
              }

              const char = q.charAt(0);
              this.typingQueues.set(queueKey, q.substring(1));

              // append a single character to the bot message at botIndex
              const isActiveLocal = this.selectedTask?.id === currentActiveTaskId;
              const targetArray = isActiveLocal ? this.messages() : (this.chatCache.get(currentActiveTaskId) || []);
              const copy = [...targetArray];
              const existing = copy[botIndex] || { sender: 'bot', text: '', processedText: '', timestamp: new Date() };
              const newText = (existing.text || '') + char;
              copy[botIndex] = { ...existing, text: newText, processedText: this.linkifyTaskCodes(newText) };
              if (isActiveLocal) this.messages.set(copy);
              this.chatCache.set(currentActiveTaskId, copy);
            }, intervalMs);

            this.typingIntervals.set(queueKey, intervalHandle as any);
          }
        },
        error: (err: any) => {
          console.error('Summarize stream error', err);
          // clear any typing intervals and queues for this botIndex
          try {
            const h = this.typingIntervals.get(botIndex);
            if (h) { clearInterval(h); this.typingIntervals.delete(botIndex); }
          } catch {}
          this.typingQueues.delete(botIndex);
          if (this.selectedTask?.id === currentActiveTaskId) this.isBotTyping.set(false);
        },
        complete: () => {
          // Wait until any remaining queued characters are flushed by the interval,
          // then mark bot typing as finished.
          const checkFinish = () => {
            const q = this.typingQueues.get(botIndex) || '';
            if (!q) {
              if (this.selectedTask?.id === currentActiveTaskId) this.isBotTyping.set(false);
            } else {
              const waiter = setInterval(() => {
                const q2 = this.typingQueues.get(botIndex) || '';
                if (!q2) {
                  clearInterval(waiter);
                  if (this.selectedTask?.id === currentActiveTaskId) this.isBotTyping.set(false);
                }
              }, 50);
            }
          };

          checkFinish();
        }
      });
    } else {
      const send$ = (this.chatService && this.chatService.sendMessage) ? this.chatService.sendMessage(requestBody) : this.http.post<any>(`${this.baseUrl}/chat`, requestBody);
      send$.subscribe({
        next: (response: any) => {
          this.isBotTyping.set(false);
          const botText = response?.Answer || response?.answer || response?.result || (typeof response === 'string' ? response : '') || 'No response';
          const isActive = this.selectedTask?.id === currentActiveTaskId;
          const targetArray = isActive ? this.messages() : (this.chatCache.get(currentActiveTaskId) || []);
          const copy = [...targetArray];
          copy[botIndex] = { sender: 'bot', text: botText, processedText: this.linkifyTaskCodes(botText), timestamp: new Date() };
          if (isActive) this.messages.set(copy);
          this.chatCache.set(currentActiveTaskId, copy);
        },
        error: (err: any) => {
          console.error('Summarize error', err);
          if (this.selectedTask?.id === currentActiveTaskId) this.isBotTyping.set(false);
        }
      });
    }
  }

  @HostListener('click', ['$event'])
  onMarkdownClick(event: Event): void {
    try {
      const target = event.target as HTMLElement;
      const anchor = target.closest('a') as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute('href') ?? '';
      if (!href) return;
      // deep link pattern /tasks/:id or tasks/:id
      // Only intercept anchors that are inside the chat message content (markdown-rendered bubble)
      const insideMessage = !!anchor.closest('.message-content');
      const match = insideMessage ? href.match(/\/?tasks\/?([A-Za-z0-9-_%]+)/i) : null;
      if (match && insideMessage) {
        event.preventDefault();
        const id = decodeURIComponent(match[1]);
        const path = `/tasks/${id}`;
        // Prefer SPA navigation, fallback to full navigation if it fails
        try {
          this.router.navigateByUrl(path).catch(() => { (window.location as any).href = path; });
        } catch {
          (window.location as any).href = path;
        }
      }
    } catch {
      // ignore
    }
  }

  testMcpTools(): void {
    const url = `${this.baseUrl}/mcp`;

    // Request user tasks via MCP RPC. When running against the live backend with JWT auth,
    // the server should infer the user from the Authorization token; omit explicit UserId.
    const payload1 = { jsonrpc: '2.0', id: `req-mcp-${Date.now()}-1`, method: 'get_user_tasks', params: {} };
    this.http.post<any>(url, payload1).subscribe({ next: res => console.log('get_user_tasks', res), error: err => console.error(err) });

    const payload2 = { jsonrpc: '2.0', id: `req-mcp-${Date.now()}-2`, method: 'get_department_kpi', params: {} };
    this.http.post<any>(url, payload2).subscribe({ next: res => console.log('get_department_kpi', res), error: err => console.error(err) });

    const payload3 = { jsonrpc: '2.0', id: `req-mcp-${Date.now()}-3`, method: 'get_task_chat_history', params: { TaskId: '6a709be7af0d8b17ec32592c' } };
    this.http.post<any>(url, payload3).subscribe({ next: res => console.log('get_task_chat_history', res), error: err => console.error(err) });
  }

  loadUserTasks(): void {
    // Use the new backend endpoint which infers the user from the Authorization token.
    const url = `${this.baseUrl}/Tasks`;
    this.http.get<any>(url).subscribe({
      next: (response) => {
        let dataArray: any[] = [];
        if (Array.isArray(response)) dataArray = response;
        else if (response && Array.isArray(response.tasks)) dataArray = response.tasks;
        else if (response && Array.isArray(response.Tasks)) dataArray = response.Tasks;
        else if (response && response.data && Array.isArray(response.data.tasks)) dataArray = response.data.tasks;
        else if (response && response.data && Array.isArray(response.data)) dataArray = response.data;
        else if (response && Array.isArray(response.result)) dataArray = response.result;

        if (!dataArray) dataArray = [];

        this.tasks = dataArray.map((t: any) => ({
          id: t.id || t.Id || t._id || (t._id && t._id.toString && t._id.toString()) || '',
          title: t.title || t.Title || t.name || t.Name || '',
          status: t.status || t.Status || 'Todo'
        } as Task)).filter(x => x.id);

        try { this.cdr.detectChanges(); } catch { }
      },
      error: (err) => console.error('Error fetching tasks:', err),
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
    // Call backend Departments KPI endpoint. Backend should infer department by JWT.
    const url = `${this.baseUrl}/Departments/kpi`;
    this.http.get<any>(url).subscribe({
      next: response => {
        // store KPI data and show modal instead of blocking alert
        this.kpiData.set({
          departmentName: response?.departmentName ?? response?.DepartmentName,
          totalTasks: response?.totalTasks ?? response?.TotalTasks,
          completedTasks: response?.completedTasks ?? response?.CompletedTasks,
          inProgressTasks: response?.inProgressTasks ?? response?.InProgressTasks,
          completionRate: response?.completionRate ?? response?.CompletionRate,
        });
        this.showKpiModal.set(true);
        try { this.cdr.detectChanges(); } catch { }
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

    const requestBody = { Message: content, TaskId: currentActiveTaskId };

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
        next: (chunk: string) => {
          // extract answer if JSON-wrapped
          const extractAnswer = (input: string): string => {
            if (!input) return '';
            const s = input.trim();
            try {
              const obj = JSON.parse(s);
              return obj?.data?.answer ?? obj?.Answer ?? obj?.answer ?? input;
            } catch {
              const match = s.match(/\{[\s\S]*\}/);
              if (match) {
                try {
                  const obj = JSON.parse(match[0]);
                  return obj?.data?.answer ?? obj?.Answer ?? obj?.answer ?? input;
                } catch {}
              }
            }
            return input;
          };

          const piece = extractAnswer(chunk);

          // enqueue for typing simulation per botIndex
          const existingQueue = this.typingQueues.get(botIndex) || '';
          this.typingQueues.set(botIndex, existingQueue + piece);

          if (!this.typingIntervals.has(botIndex)) {
            // Bot has started producing output; hide the thinking indicator
            try { this.isBotTyping.set(false); } catch { }
            const intervalMs = 18;
            const handle = setInterval(() => {
              const q = this.typingQueues.get(botIndex) || '';
              if (!q) {
                clearInterval(handle);
                this.typingIntervals.delete(botIndex);
                this.typingQueues.delete(botIndex);
                return;
              }
              const char = q.charAt(0);
              this.typingQueues.set(botIndex, q.substring(1));

              updateMessageBackground(char);
            }, intervalMs);

            this.typingIntervals.set(botIndex, handle as any);
          }
        },
        error: (err) => {
          console.error('Stream error', err);
          updateMessageBackground('', true);
          try { const h = this.typingIntervals.get(botIndex); if (h) { clearInterval(h); this.typingIntervals.delete(botIndex); } } catch {}
          this.typingQueues.delete(botIndex);
          if (this.selectedTask?.id === currentActiveTaskId) this.isBotTyping.set(false);
        },
        complete: () => {
          // wait until queue empties to clear typing indicator
          const checkFinish = () => {
            const q = this.typingQueues.get(botIndex) || '';
            if (!q) {
              if (this.selectedTask?.id === currentActiveTaskId) this.isBotTyping.set(false);
            } else {
              const waiter = setInterval(() => {
                const q2 = this.typingQueues.get(botIndex) || '';
                if (!q2) {
                  clearInterval(waiter);
                  if (this.selectedTask?.id === currentActiveTaskId) this.isBotTyping.set(false);
                }
              }, 50);
            }
          };
          checkFinish();
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
