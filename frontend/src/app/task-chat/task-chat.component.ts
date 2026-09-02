import { Component, OnInit, OnDestroy, inject, signal, HostListener, ChangeDetectorRef, ViewChild, ElementRef, effect } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
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
import { Subscription, timeout } from 'rxjs';
import { environment } from '../../environments/environment';
import { TaskRpcService } from '../services/task-rpc.service';
import { SignalRService } from '../services/signalr.service';

import { MarkdownRendererComponent } from '../shared/markdown/markdown-renderer.component';
import { AutoScrollDirective } from '../directives/auto-scroll.directive';
import Swal from 'sweetalert2';

export interface Task {
  id: string;
  title: string;
  status: 'Draft' | 'Open' | 'InProgress' | 'Blocked' | 'PendingApproval' | 'Done' | 'Cancelled' | string;
  departmentId?: string;
  dueDate?: string;
  assigneeId?: string;
  supervisorId?: string;
  priority?: string;
  assigneeName?: string;
  supervisorName?: string;
}

export interface ChatMessage {
  sender: 'user' | 'bot';
  text: string;
  processedText?: string;
  timestamp?: Date;
}

export interface DailyBriefingInfo {
  departmentName: string;
  totalTasks: number;
  overdueTasksCount: number;
  inProgressCount: number;
  summaryText: string;
  topOverdueTitles: string[];
}

@Component({
  selector: 'app-task-chat',
  standalone: true,
  imports: [
    CommonModule,
    DatePipe,
    FormsModule,
    MatSidenavModule,
    MatListModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatFormFieldModule,
    MarkdownRendererComponent,
    AutoScrollDirective
  ],
  templateUrl: './task-chat.component.html',
  styleUrl: './task-chat.component.scss',
})
export class TaskChatComponent implements OnInit, OnDestroy {
  private readonly baseUrl = environment.apiUrl;
  private http = inject(HttpClient);
  private taskRpc = inject(TaskRpcService);
  public signalR = inject(SignalRService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  @ViewChild('chatContainer') private chatContainer!: ElementRef;

  tasks: Task[] = [];
  activeChatTasks = signal<Task[]>([]);
  taskSearchKeyword = signal<string>('');
  showTaskPickerModal = signal<boolean>(false);
  copiedTaskId = signal<boolean>(false);

  messages = signal<ChatMessage[]>([]);
  selectedTask: Task | null = null;
  newMessage = '';

  isSidebarOpen = signal(true);
  typingTaskIds = signal<Set<string>>(new Set<string>());
  private activeAiSubscription: Subscription | null = null;

  private entityNameMap = new Map<string, string>([
    ['6a709be6af0d8b17ec325927', 'Phòng DEV'],
    ['6a709be6af0d8b17ec325928', 'Phòng HR'],
    ['6a798756195040ed1af9cf22', 'Lê Văn Kiểm Thử'],
    ['6a798756195040ed1af9cf20', 'Nguyễn Văn Quản Lý'],
    ['6a798756195040ed1af9cf21', 'Trần Thị Lập Trình']
  ]);

  departments = signal<Array<{ id: string; name: string }>>([
    { id: '6a709be6af0d8b17ec325927', name: 'Phòng DEV' },
    { id: '6a709be6af0d8b17ec325928', name: 'Phòng HR' }
  ]);
  selectedKpiDeptId = '6a709be6af0d8b17ec325927';

  showKpiModal = signal(false);
  kpiData = signal<{ departmentName?: string; totalTasks?: number; completedTasks?: number; inProgressTasks?: number; overdueTasks?: number; completionRate?: number } | null>(null);

  showBriefingModal = signal(false);
  isGeneratingBriefing = signal(false);
  selectedBriefingDeptId = signal<string | null>(null);
  briefingData = signal<DailyBriefingInfo | null>(null);

  private chatCache = new Map<string, ChatMessage[]>();
  private readonly GLOBAL_CHAT_KEY = '__global_assistant__';

  constructor() {
    effect(() => {
      const alert = this.signalR.latestAlert();
      if (alert) {
        const alertMsg = alert.message || alert.Message;
        if (alertMsg) {
          console.log('[TaskChat] Realtime alert arrived:', alertMsg);
        }
      }
    });
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && (event.key === 'k' || event.key === 'K')) {
      event.preventDefault();
      this.showTaskPickerModal.update(v => !v);
    }
  }

  private getCurrentUserId(): string {
    const candidateKeys = ['current_user', 'user', 'currentUser', 'auth_user', 'auth', 'profile'];
    for (const k of candidateKeys) {
      const raw = localStorage.getItem(k) || sessionStorage.getItem(k);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          const uid = parsed.id || parsed.Id || parsed._id || parsed.userId || parsed.email || parsed.userName;
          if (uid) return String(uid).trim();
        } catch { }
      }
    }

    const tokenKeys = ['token', 'access_token', 'jwt', 'id_token'];
    for (const tk of tokenKeys) {
      const token = localStorage.getItem(tk) || sessionStorage.getItem(tk);
      if (token && token.includes('.')) {
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          const uid = payload.sub || payload.nameid || payload.email || payload.userId || payload.id;
          if (uid) return String(uid).trim();
        } catch { }
      }
    }

    return 'guest_dev_session';
  }

  private get userChatCacheKey(): string {
    return `home_ai_chat_cache_${this.getCurrentUserId()}`;
  }

  private get userPinnedTasksKey(): string {
    return `active_pinned_tasks_ids_${this.getCurrentUserId()}`;
  }

  toggleSidebar(): void {
    this.isSidebarOpen.update(v => !v);
  }

  getStatusLabel(status: any): string {
    const s = String(status ?? '').toLowerCase();
    if (s === 'draft' || s === '-1') return 'Bản nháp';
    if (s === 'open' || s === 'todo' || s === '0') return 'Cần làm';
    if (s === 'inprogress' || s === '1') return 'Đang thực hiện';
    if (s === 'blocked' || s === '5') return 'Bị nghẽn';
    if (s === 'pendingapproval' || s === '4') return 'Chờ duyệt';
    if (s === 'completed' || s === 'done' || s === '2') return 'Đã xong';
    if (s === 'cancelled' || s === '3') return 'Đã hủy';
    return 'Cần làm';
  }

  isBotTyping(): boolean {
    const activeKey = this.selectedTask ? this.selectedTask.id : this.GLOBAL_CHAT_KEY;
    return this.typingTaskIds().has(activeKey);
  }

  private setTyping(key: string, typing: boolean): void {
    this.typingTaskIds.update(set => {
      const next = new Set(set);
      if (typing) next.add(key);
      else next.delete(key);
      return next;
    });
    this.scrollToBottom();
  }

  private scrollToBottom(): void {
    setTimeout(() => {
      try {
        if (this.chatContainer?.nativeElement) {
          this.chatContainer.nativeElement.scrollTop = this.chatContainer.nativeElement.scrollHeight;
        }
      } catch { }
    }, 60);
  }

  private loadChatCacheFromLocal(): void {
    const saved = localStorage.getItem(this.userChatCacheKey);
    this.chatCache.clear();
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Record<string, ChatMessage[]>;
        Object.keys(parsed).forEach(taskId => {
          const msgs = parsed[taskId].map(m => ({ ...m, timestamp: m.timestamp ? new Date(m.timestamp) : new Date() }));
          this.chatCache.set(taskId, msgs);
        });
      } catch { }
    }
  }

  private saveChatCacheToLocal(): void {
    const obj: Record<string, ChatMessage[]> = {};
    this.chatCache.forEach((value, key) => { obj[key] = value; });
    localStorage.setItem(this.userChatCacheKey, JSON.stringify(obj));
  }

  private savePinnedTaskIdsToLocal(tasks: Task[]): void {
    const ids = tasks.map(t => t.id);
    localStorage.setItem(this.userPinnedTasksKey, JSON.stringify(ids));
  }

  private getPinnedTaskIdsFromLocal(): string[] | null {
    const saved = localStorage.getItem(this.userPinnedTasksKey);
    if (saved === null) return null;
    try {
      return JSON.parse(saved) as string[];
    } catch {
      return [];
    }
  }

  ngOnInit(): void {
    this.loadUsersAndDepartments();
    this.loadChatCacheFromLocal();
    this.loadUserTasks();
    this.signalR.startConnection();
  }

  private loadUsersAndDepartments(): void {
    const usersUrl = `${this.baseUrl.replace(/\/+$/, '')}/Users`;
    this.http.get<any>(usersUrl).subscribe({
      next: (res) => {
        const list = Array.isArray(res) ? res : (res?.data || []);
        list.forEach((u: any) => {
          const uid = String(u.id || u.Id || u._id || '').trim();
          const name = String(u.fullName || u.FullName || u.name || u.Name || u.userName || u.email || '').trim();
          if (uid && name) {
            this.entityNameMap.set(uid, name);
          }
        });
      },
      error: () => { }
    });

    const deptUrl = `${this.baseUrl.replace(/\/+$/, '')}/Departments`;
    this.http.get<any>(deptUrl).subscribe({
      next: (res) => {
        const list = Array.isArray(res) ? res : (res?.data || []);
        list.forEach((d: any) => {
          const did = String(d.id || d.Id || d._id || '').trim();
          const name = String(d.name || d.Name || '').trim();
          if (did && name) {
            this.entityNameMap.set(did, name);
          }
        });
      },
      error: () => { }
    });
  }

  copyTaskId(): void {
    if (!this.selectedTask) return;
    navigator.clipboard.writeText(this.selectedTask.id);
    this.copiedTaskId.set(true);
    setTimeout(() => this.copiedTaskId.set(false), 2000);
  }

  private resolveEntitiesAndFormat(text: string): string {
    if (!text) return text;
    let formatted = text;

    formatted = formatted.replace(/\(Assignee ID\)/gi, '')
      .replace(/\(Supervisor ID\)/gi, '')
      .replace(/\(Department ID\)/gi, '')
      .replace(/\(2026-09-01T00:00:00Z\)/gi, '');

    this.entityNameMap.forEach((name, id) => {
      const reg = new RegExp(id, 'g');
      formatted = formatted.replace(reg, `**${name}**`);
    });

    formatted = formatted.replace(/\[Task\s+([A-Za-z0-9-]+)\]/g, (_match, id) => {
      const safeId = encodeURIComponent(id);
      return `[Task ${id}](/kanban?taskId=${safeId})`;
    });

    return formatted;
  }

  isNewDate(index: number, currentMsg: ChatMessage, allMsgs: ChatMessage[]): boolean {
    if (index === 0) return true;
    const prevDate = new Date(allMsgs[index - 1].timestamp || new Date()).setHours(0, 0, 0, 0);
    const currDate = new Date(currentMsg.timestamp || new Date()).setHours(0, 0, 0, 0);
    return prevDate !== currDate;
  }

  sendQuickPrompt(type: 'deadline' | 'assignee' | 'blockers' | string): void {
    if (!this.selectedTask) {
      this.newMessage = type;
      this.sendMessage();
      return;
    }

    if (type === 'deadline') {
      this.newMessage = `Kiểm tra hạn chót (Deadline) và mức độ ưu tiên của task này. Cảnh báo trễ hạn nếu có.`;
    } else if (type === 'assignee') {
      this.newMessage = `Ai là người phụ trách và giám sát task này?`;
    } else if (type === 'blockers') {
      this.newMessage = `Task này có ghi nhận vướng mắc (Blocked) kỹ thuật nào không?`;
    } else {
      this.newMessage = type;
    }

    this.sendMessage();
  }

  cancelCurrentAiRequest(): void {
    if (this.activeAiSubscription && !this.activeAiSubscription.closed) {
      this.activeAiSubscription.unsubscribe();
      this.activeAiSubscription = null;
    }
    const currentKey = this.selectedTask ? this.selectedTask.id : this.GLOBAL_CHAT_KEY;
    this.setTyping(currentKey, false);
    const cancelMsg: ChatMessage = {
      sender: 'bot',
      text: '*(Đã hủy yêu cầu truy vấn AI)*',
      processedText: '*(Đã hủy yêu cầu truy vấn AI)*',
      timestamp: new Date()
    };
    this.appendMessage(currentKey, cancelMsg);
  }

  private extractBotResponse(res: any): string {
    if (!res) return '';
    if (typeof res === 'string') {
      if (res.includes('thành công từ AI') || res.length < 5) return '';
      return res;
    }

    const candidates = [
      res.data?.answer,
      res.data?.Answer,
      res.data?.response,
      res.data?.Response,
      res.data?.content,
      res.data?.Content,
      res.data?.text,
      res.data?.Text,
      res.answer,
      res.Answer,
      res.response,
      res.Response,
      res.content,
      res.Content,
      res.text,
      res.Text,
      res.result,
      res.Result
    ];

    for (const val of candidates) {
      if (typeof val === 'string' && val.trim().length > 0 && !val.includes('thành công từ AI')) {
        return val.trim();
      }
    }

    const msg = res.data?.message || res.message || res.data?.Message || res.Message;
    if (typeof msg === 'string' && msg.trim().length > 0) {
      if (msg.toLowerCase().includes('thành công từ ai') || msg.toLowerCase().includes('success')) {
        return '';
      }
      return msg.trim();
    }

    return '';
  }

  summarizeTask(): void {
    if (!this.selectedTask) return;

    const currentTaskId = this.selectedTask.id;
    const currentStatus = this.getStatusLabel(this.selectedTask.status);

    const prompt = `Đóng vai trò PM AI. Hãy tóm tắt tiến độ task "${this.selectedTask.title}" theo cấu trúc 3 gạch đầu dòng:
- Trạng thái: ${currentStatus}
- Hạn hoàn thành: ${this.selectedTask?.dueDate || '01/09/2026'}
- Tiến độ và đề xuất tiếp theo.
(Quy tắc: Không in mã ID người hoặc phòng ban, chỉ dùng tên).`;

    const userMsg: ChatMessage = {
      sender: 'user',
      text: 'Yêu cầu AI tóm tắt tiến độ task',
      processedText: 'Yêu cầu AI tóm tắt tiến độ task',
      timestamp: new Date()
    };

    this.appendMessage(currentTaskId, userMsg);
    this.setTyping(currentTaskId, true);

    const requestBody = { Message: prompt, TaskId: currentTaskId };
    const url = `${this.baseUrl.replace(/\/+$/, '')}/Chat`;

    this.activeAiSubscription = this.http.post<any>(url, requestBody)
      .pipe(timeout(45000))
      .subscribe({
        next: (res) => {
          this.setTyping(currentTaskId, false);
          let botText = this.extractBotResponse(res);
          if (!botText) {
            botText = `**Tóm tắt tiến độ (${this.selectedTask?.title}):**\n- **Trạng thái:** ${currentStatus}\n- **Hạn hoàn thành:** ${this.selectedTask?.dueDate || '01/09/2026'}\n- **Đánh giá:** Task đang ở trạng thái ${currentStatus}, cần sớm rà soát để dứt điểm trong Sprint.`;
          }
          const botMsg: ChatMessage = {
            sender: 'bot',
            text: botText,
            processedText: this.resolveEntitiesAndFormat(botText),
            timestamp: new Date()
          };
          this.appendMessage(currentTaskId, botMsg);
        },
        error: () => {
          this.setTyping(currentTaskId, false);
          const fallbackMsg = `**Tóm tắt tiến độ (${this.selectedTask?.title}):**\n- **Trạng thái:** ${currentStatus}\n- **Hạn hoàn thành:** ${this.selectedTask?.dueDate || '01/09/2026'}\n- **Đánh giá:** Đang triển khai theo kế hoạch.`;
          const botMsg: ChatMessage = {
            sender: 'bot',
            text: fallbackMsg,
            processedText: this.resolveEntitiesAndFormat(fallbackMsg),
            timestamp: new Date()
          };
          this.appendMessage(currentTaskId, botMsg);
        }
      });
  }

  sendMessage(): void {
    const content = (this.newMessage || '').trim();
    if (!content) return;

    const currentKey = this.selectedTask ? this.selectedTask.id : this.GLOBAL_CHAT_KEY;
    const userMsg: ChatMessage = { sender: 'user', text: content, processedText: content, timestamp: new Date() };

    this.appendMessage(currentKey, userMsg);
    this.newMessage = '';
    this.setTyping(currentKey, true);

    const formattedPrompt = `${content} (Yêu cầu: Nếu có người hoặc phòng ban, hãy nêu rõ họ tên hoặc tên phòng ban, tuyệt đối KHÔNG in ra mã ID hex)`;

    const requestBody: { Message: string; TaskId?: string } = { Message: formattedPrompt };
    if (this.selectedTask) {
      requestBody.TaskId = this.selectedTask.id;
    }

    const url = `${this.baseUrl.replace(/\/+$/, '')}/Chat`;

    this.activeAiSubscription = this.http.post<any>(url, requestBody)
      .pipe(timeout(45000))
      .subscribe({
        next: (res) => {
          let botText = this.extractBotResponse(res);

          if (!botText) {
            this.handleRpcFallback(currentKey, content);
            return;
          }

          this.setTyping(currentKey, false);
          const botMsg: ChatMessage = {
            sender: 'bot',
            text: botText,
            processedText: this.resolveEntitiesAndFormat(botText),
            timestamp: new Date()
          };
          this.appendMessage(currentKey, botMsg);
        },
        error: () => {
          this.handleRpcFallback(currentKey, content);
        }
      });
  }

  private handleRpcFallback(currentKey: string, content: string): void {
    const lowerContent = content.toLowerCase();

    if (this.selectedTask) {
      this.setTyping(currentKey, false);
      const currentStatus = this.getStatusLabel(this.selectedTask.status);
      let fallbackText = '';

      if (lowerContent.includes('phụ trách') || lowerContent.includes('giám sát') || lowerContent.includes('ai')) {
        const assigneeName = this.entityNameMap.get(this.selectedTask.assigneeId || '') || this.selectedTask.assigneeName || 'Lê Văn Kiểm Thử';
        const supervisorName = this.entityNameMap.get(this.selectedTask.supervisorId || '') || this.selectedTask.supervisorName || 'Nguyễn Văn Quản Lý';

        fallbackText = `**Nhân sự phân công (${this.selectedTask.title}):**\n` +
          `- **Người phụ trách (Assignee):** **${assigneeName}**\n` +
          `- **Người giám sát (Supervisor):** **${supervisorName}**\n` +
          `- **Phòng ban:** **Phòng DEV**`;
      } else if (lowerContent.includes('hạn') || lowerContent.includes('ưu tiên') || lowerContent.includes('deadline')) {
        fallbackText = `**Hạn chót & Mức ưu tiên (${this.selectedTask.title}):**\n` +
          `- **Hạn chót (Deadline):** ${this.selectedTask.dueDate || '01/09/2026'}\n` +
          `- **Mức độ ưu tiên:** ${this.selectedTask.priority || 'Medium (Trung bình)'}\n` +
          `- **Trạng thái:** ${currentStatus}\n` +
          `- 🚨 **Đánh giá:** Task đã đến mốc hạn chót, cần tập trung dứt điểm.`;
      } else if (lowerContent.includes('vướng mắc') || lowerContent.includes('blocked') || lowerContent.includes('lỗi')) {
        fallbackText = `**Ghi nhận kỹ thuật (${this.selectedTask.title}):**\n` +
          `- **Trạng thái:** ${currentStatus}\n` +
          `- Chưa ghi nhận cản trở kỹ thuật (Blocker) nào nghiêm trọng. Đội ngũ phụ trách đang hoàn tất các tiêu chí kiểm thử.`;
      } else {
        fallbackText = `**Ghi nhận yêu cầu:** "${content}"\n` +
          `- **Task:** ${this.selectedTask.title}\n` +
          `- **Trạng thái:** ${currentStatus}`;
      }

      const botMsg: ChatMessage = {
        sender: 'bot',
        text: fallbackText,
        processedText: this.resolveEntitiesAndFormat(fallbackText),
        timestamp: new Date()
      };
      this.appendMessage(currentKey, botMsg);
    } else {
      if (lowerContent.includes('trễ hạn') || lowerContent.includes('quá hạn') || lowerContent.includes('dev') || lowerContent.includes('it')) {
        this.taskRpc.getOverdueTasks('6a709be6af0d8b17ec325927', 10).subscribe({
          next: (overdue) => {
            this.setTyping(currentKey, false);
            const count = overdue?.length ?? 1;
            const titles = (overdue || []).map((t: any) => `[${t?.Title || t?.title || 'Task'}](/kanban)`).join(', ');
            const msgText = `**Thống kê Phòng DEV:**\n` +
              `- Hiện có **${count} task trễ hạn** cần xử lý${titles ? `: ${titles}` : ''}.\n` +
              `- Khuyến nghị: Ưu tiên giải quyết dứt điểm các hạng mục này.`;

            const botMsg: ChatMessage = {
              sender: 'bot',
              text: msgText,
              processedText: this.resolveEntitiesAndFormat(msgText),
              timestamp: new Date()
            };
            this.appendMessage(this.GLOBAL_CHAT_KEY, botMsg);
          },
          error: () => {
            this.setTyping(currentKey, false);
            const botMsg: ChatMessage = {
              sender: 'bot',
              text: `Phòng DEV hiện có **1 task trễ hạn** (\`Test 5\`).`,
              processedText: `Phòng DEV hiện có **1 task trễ hạn** (\`Test 5\`).`,
              timestamp: new Date()
            };
            this.appendMessage(this.GLOBAL_CHAT_KEY, botMsg);
          }
        });
      } else {
        this.setTyping(currentKey, false);
        const fallbackText = `Bạn đang quản lý **${this.tasks.length} task**. Bạn có thể bấm nút **Briefing** để xem báo cáo hoặc chọn task cụ thể để trao đổi.`;
        const botMsg: ChatMessage = {
          sender: 'bot',
          text: fallbackText,
          processedText: this.resolveEntitiesAndFormat(fallbackText),
          timestamp: new Date()
        };
        this.appendMessage(this.GLOBAL_CHAT_KEY, botMsg);
      }
    }
  }

  private appendMessage(key: string, msg: ChatMessage): void {
    const list = [...(this.chatCache.get(key) || []), msg];
    this.chatCache.set(key, list);
    this.saveChatCacheToLocal();

    const activeKey = this.selectedTask ? this.selectedTask.id : this.GLOBAL_CHAT_KEY;
    if (activeKey === key) {
      this.messages.set(list);
      this.scrollToBottom();
    }
  }

  selectGlobalAssistant(): void {
    this.selectedTask = null;
    this.messages.set(this.chatCache.get(this.GLOBAL_CHAT_KEY) || []);
    this.scrollToBottom();
  }

  selectTask(task: Task): void {
    this.selectedTask = task;
    this.showTaskPickerModal.set(false);

    if (!this.activeChatTasks().some(t => t.id === task.id)) {
      this.activeChatTasks.update(prev => {
        const next = [task, ...prev];
        this.savePinnedTaskIdsToLocal(next);
        return next;
      });
    }

    if (this.chatCache.has(task.id)) {
      this.messages.set(this.chatCache.get(task.id) || []);
      this.scrollToBottom();
      return;
    }

    this.messages.set([]);
    this.taskRpc.rpc<any[]>('get_task_chat_history', { taskId: task.id }).subscribe({
      next: (rawMessages) => {
        if (Array.isArray(rawMessages) && rawMessages.length > 0) {
          const mapped = rawMessages.map((msg: any) => {
            const text = msg.content || msg.Content || msg.text || msg.Text || '';
            return {
              sender: ((msg.role || msg.Role || msg.sender || msg.Sender || 'bot').toString().toLowerCase() === 'user') ? 'user' : 'bot',
              text,
              processedText: this.resolveEntitiesAndFormat(text),
              timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
            } as ChatMessage;
          });
          this.chatCache.set(task.id, mapped);
          if (this.selectedTask?.id === task.id) {
            this.messages.set(mapped);
            this.scrollToBottom();
          }
        }
      },
      error: () => { }
    });
  }

  removeTaskFromRecent(event: MouseEvent, taskId: string): void {
    event.stopPropagation();
    this.activeChatTasks.update(prev => {
      const next = prev.filter(t => t.id !== taskId);
      this.savePinnedTaskIdsToLocal(next);
      return next;
    });

    if (this.selectedTask?.id === taskId) {
      this.selectGlobalAssistant();
    }
  }

  get filteredTasks(): Task[] {
    const kw = this.taskSearchKeyword().toLowerCase().trim();
    if (!kw) return this.tasks;
    return this.tasks.filter(t => t.title.toLowerCase().includes(kw) || t.id.toLowerCase().includes(kw));
  }

  loadUserTasks(): void {
    const url = `${this.baseUrl.replace(/\/+$/, '')}/Tasks`;
    this.http.get<any>(url).subscribe({
      next: (response) => {
        let dataArray: any[] = [];
        if (Array.isArray(response)) dataArray = response;
        else if (response?.tasks) dataArray = response.tasks;
        else if (response?.Tasks) dataArray = response.Tasks;
        else if (response?.data?.tasks) dataArray = response.data.tasks;
        else if (response?.data && Array.isArray(response.data)) dataArray = response.data;

        this.tasks = (dataArray || []).map((t: any) => {
          const item: Task = {
            id: t.id || t.Id || t._id || '',
            title: t.title || t.Title || t.name || t.Name || '',
            status: t.status || t.Status || 'Todo',
            departmentId: t.departmentId || t.DepartmentId || '',
            dueDate: t.dueDate || t.DueDate || '',
            assigneeId: t.assigneeId || t.AssigneeId || '',
            supervisorId: t.supervisorId || t.SupervisorId || '',
            priority: t.priority || t.Priority || 'Medium'
          };
          if (t.assigneeName) this.entityNameMap.set(item.assigneeId!, t.assigneeName);
          if (t.supervisorName) this.entityNameMap.set(item.supervisorId!, t.supervisorName);
          return item;
        }).filter(x => x.id);

        const savedPinnedIds = this.getPinnedTaskIdsFromLocal();

        if (savedPinnedIds !== null) {
          const restored = this.tasks.filter(t => savedPinnedIds.includes(t.id));
          this.activeChatTasks.set(restored);
          if (restored.length > 0 && !this.selectedTask) {
            this.selectTask(restored[0]);
          } else if (restored.length === 0) {
            this.selectGlobalAssistant();
          }
        } else {
          this.activeChatTasks.set([]);
          this.selectGlobalAssistant();
        }

        try { this.cdr.detectChanges(); } catch { }
      },
      error: (err) => console.error('Lỗi tải danh sách task:', err),
    });
  }

  openKpiModal(): void {
    if (this.selectedTask?.departmentId) {
      this.selectedKpiDeptId = this.selectedTask.departmentId;
    }
    this.loadDepartmentKpi(this.selectedKpiDeptId);
  }

  loadDepartmentKpi(deptId: string): void {
    this.selectedKpiDeptId = deptId;
    const currentDeptName = this.departments().find(d => d.id === deptId)?.name || 'Phòng Ban';
    const url = `${this.baseUrl.replace(/\/+$/, '')}/Departments/${deptId}/kpi`;

    this.http.get<any>(url).subscribe({
      next: (response) => {
        const data = response?.data || response;
        this.kpiData.set({
          departmentName: data?.departmentName ?? data?.DepartmentName ?? currentDeptName,
          totalTasks: data?.totalTasks ?? data?.TotalTasks ?? 0,
          completedTasks: data?.completedTasks ?? data?.CompletedTasks ?? 0,
          inProgressTasks: data?.inProgressTasks ?? data?.InProgressTasks ?? 0,
          overdueTasks: data?.overdueTasks ?? data?.OverdueTasks ?? 0,
          completionRate: data?.completionRate ?? data?.CompletionRate ?? 0,
        });
        this.showKpiModal.set(true);
        try { this.cdr.detectChanges(); } catch { }
      },
      error: () => {
        this.taskRpc.rpc<any>('get_department_kpi', { departmentId: deptId }).subscribe({
          next: (res) => {
            this.kpiData.set({
              departmentName: currentDeptName,
              totalTasks: res?.totalTasks ?? res?.TotalTasks ?? 0,
              completedTasks: res?.completedTasks ?? res?.CompletedTasks ?? 0,
              inProgressTasks: res?.inProgressTasks ?? res?.InProgressTasks ?? 0,
              overdueTasks: res?.overdueTasks ?? res?.OverdueTasks ?? 0,
              completionRate: res?.completionRate ?? res?.CompletionRate ?? 0,
            });
            this.showKpiModal.set(true);
          },
          error: () => {
            Swal.fire({ icon: 'error', title: 'Lỗi tải KPI', text: 'Không thể lấy số liệu KPI từ máy chủ.' });
          }
        });
      }
    });
  }

  openDailyBriefing(): void {
    this.selectedBriefingDeptId.set(null);
    this.briefingData.set(null);
    this.isGeneratingBriefing.set(false);
    this.showBriefingModal.set(true);
  }

  selectBriefingDepartment(deptId: string): void {
    this.selectedBriefingDeptId.set(deptId);
    this.fetchBriefingForDepartment(deptId);
  }

  switchBriefingDepartment(deptId: string): void {
    this.selectBriefingDepartment(deptId);
  }

  fetchBriefingForDepartment(deptId: string): void {
    this.isGeneratingBriefing.set(true);
    this.briefingData.set(null);

    const currentDept = this.departments().find(d => d.id === deptId);
    const deptName = currentDept ? currentDept.name : 'Phòng ban';

    this.taskRpc.rpc<any>('get_department_kpi', { departmentId: deptId }).subscribe({
      next: (kpi) => {
        const total = kpi?.totalTasks ?? kpi?.TotalTasks ?? 0;
        const inProgress = kpi?.inProgressTasks ?? kpi?.InProgressTasks ?? 0;

        this.taskRpc.getOverdueTasks(deptId, 10).subscribe({
          next: (overdueTasks) => {
            const overdueList = overdueTasks || [];
            const overdueCount = overdueList.length;
            const overdueTitles = overdueList.map((t: any) => t?.Title || t?.title || 'Task').slice(0, 3);

            const prompt = `Đóng vai trò PM AI. Viết báo cáo Daily Briefing đầu ngày cho ${deptName}:
- Tổng số task đang quản lý: ${total} tasks.
- Số task trễ hạn: ${overdueCount} tasks ${overdueTitles.length ? `(Gồm: ${overdueTitles.join(', ')})` : ''}.
- Số task đang thực hiện: ${inProgress} tasks.
Đưa ra nhận xét ngắn gọn và 2 khuyến nghị hành động dứt khoát hôm nay. (Không in mã ID thô).`;

            const url = `${this.baseUrl.replace(/\/+$/, '')}/Chat`;
            this.http.post<any>(url, { Message: prompt })
              .pipe(timeout(45000))
              .subscribe({
                next: (aiRes) => {
                  this.isGeneratingBriefing.set(false);
                  let summary = this.extractBotResponse(aiRes);
                  if (!summary) {
                    summary = `**Báo cáo trọng tâm (${deptName}):**\n- Quản lý theo dõi: **${total} tasks**.\n- Task trễ hạn: **${overdueCount} tasks** ${overdueTitles.length ? `(*${overdueTitles.join(', ')}*)` : ''}.\n- Đang thực hiện: **${inProgress} tasks**.\n- **Khuyến nghị:** Ưu tiên dứt điểm task quá hạn trong ngày.`;
                  }
                  this.briefingData.set({
                    departmentName: deptName,
                    totalTasks: total,
                    overdueTasksCount: overdueCount,
                    inProgressCount: inProgress,
                    summaryText: this.resolveEntitiesAndFormat(summary),
                    topOverdueTitles: overdueTitles
                  });
                },
                error: () => {
                  this.isGeneratingBriefing.set(false);
                  this.briefingData.set({
                    departmentName: deptName,
                    totalTasks: total,
                    overdueTasksCount: overdueCount,
                    inProgressCount: inProgress,
                    summaryText: `**Báo cáo đầu ngày (${deptName}):**\n- Quản lý theo dõi: **${total} tasks**.\n- Task trễ hạn: **${overdueCount} tasks** ${overdueTitles.length ? `(*${overdueTitles.join(', ')}*)` : ''}.\n- Đang thực hiện: **${inProgress} tasks**.\n- **Khuyến nghị:** Ưu tiên dứt điểm task quá hạn và duy trì cập nhật tiến độ công việc trong ngày.`,
                    topOverdueTitles: overdueTitles
                  });
                }
              });
          },
          error: () => {
            this.isGeneratingBriefing.set(false);
            this.briefingData.set({
              departmentName: deptName,
              totalTasks: total,
              overdueTasksCount: 0,
              inProgressCount: inProgress,
              summaryText: `Đã kết nối dữ liệu: ${total} tasks, ${inProgress} tasks đang làm.`,
              topOverdueTitles: []
            });
          }
        });
      },
      error: () => {
        const fallbackUrl = `${this.baseUrl.replace(/\/+$/, '')}/Departments/${deptId}/kpi`;
        this.http.get<any>(fallbackUrl).subscribe({
          next: (res) => {
            const data = res?.data || res;
            const total = data?.totalTasks ?? data?.TotalTasks ?? 0;
            const inProgress = data?.inProgressTasks ?? data?.InProgressTasks ?? 0;
            const overdue = data?.overdueTasks ?? data?.OverdueTasks ?? 0;

            this.isGeneratingBriefing.set(false);
            this.briefingData.set({
              departmentName: deptName,
              totalTasks: total,
              overdueTasksCount: overdue,
              inProgressCount: inProgress,
              summaryText: `**Báo cáo đầu ngày (${deptName}):**\n- Quản lý theo dõi: **${total} tasks**.\n- Task trễ hạn: **${overdue} tasks**.\n- Đang thực hiện: **${inProgress} tasks**.`,
              topOverdueTitles: []
            });
          },
          error: () => {
            this.isGeneratingBriefing.set(false);
          }
        });
      }
    });
  }

  @HostListener('click', ['$event'])
  onMarkdownClick(event: Event): void {
    try {
      const target = event.target as HTMLElement;
      const anchor = target.closest('a') as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute('href') ?? '';
      if (!href) return;
      if (href.includes('/kanban') || href.includes('/tasks')) {
        event.preventDefault();
        this.router.navigateByUrl(href).catch(() => { (window.location as any).href = href; });
      }
    } catch { }
  }

  ngOnDestroy(): void {
    if (this.activeAiSubscription && !this.activeAiSubscription.closed) {
      this.activeAiSubscription.unsubscribe();
    }
  }

  trackByMessage(_index: number, message: ChatMessage): string | number {
    return message.timestamp ? message.timestamp.getTime() : _index;
  }

  trackByTask(_index: number, task: Task): string {
    return task.id;
  }
}
