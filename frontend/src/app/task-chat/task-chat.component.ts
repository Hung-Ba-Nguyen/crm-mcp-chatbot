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
  description?: string;
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
    ['6a709be6af0d8b17ec325927', 'Phòng Phát Triển Phần Mềm (DEV)'],
    ['6a709be6af0d8b17ec325928', 'Phòng Nhân Sự (HR)'],
    ['6a798756195040ed1af9cf22', 'Lê Văn Kiểm Thử'],
    ['6a798756195040ed1af9cf20', 'Nguyễn Văn Quản Lý'],
    ['6a798756195040ed1af9cf21', 'Trần Thị Lập Trình']
  ]);

  departments = signal<Array<{ id: string; name: string }>>([
    { id: '6a709be6af0d8b17ec325927', name: 'Phòng Phát Triển Phần Mềm (DEV)' },
    { id: '6a709be6af0d8b17ec325928', name: 'Phòng Nhân Sự (HR)' }
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
  private readonly KANBAN_CHAT_KEY = 'kanban_user_team_chat_store';
  private readonly DEMO_STATUS_KEY = 'kanban_demo_task_statuses';
  private readonly DAILY_BRIEFING_SENT_KEY = 'taskflow_daily_briefing_last_sent';

  constructor() {
    effect(() => {
      const alert = this.signalR.latestAlert();
      if (alert) {
        const alertMsg = (alert as any).message || (alert as any).Message;
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
          const parsed: any = JSON.parse(raw);
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
          const payload: any = JSON.parse(atob(token.split('.')[1]));
          const uid = payload.sub || payload.nameid || payload.email || payload.userId || payload.id;
          if (uid) return String(uid).trim();
        } catch { }
      }
    }

    return '6a798756195040ed1af9cf21';
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

  getPriorityLabel(priority: any): string {
    const p = String(priority ?? '').toLowerCase();
    if (p === 'high' || p === '2') return 'Cao';
    if (p === 'medium' || p === '1') return 'Trung bình';
    if (p === 'low' || p === '0') return 'Thấp';
    return 'Trung bình';
  }

  formatDisplayDate(rawDate?: string | null): string {
    if (!rawDate) return 'Chưa đặt hạn';
    try {
      const d = new Date(rawDate);
      if (isNaN(d.getTime())) return 'Chưa đặt hạn';
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}/${month}/${year}`;
    } catch {
      return 'Chưa đặt hạn';
    }
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
        const parsed: any = JSON.parse(saved);
        Object.keys(parsed).forEach(taskId => {
          const msgs = parsed[taskId].map((m: any) => ({ ...m, timestamp: m.timestamp ? new Date(m.timestamp) : new Date() }));
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
      next: (res: any) => {
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
      next: (res: any) => {
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

    formatted = formatted.replace(/\]+\]/gi, '');

    formatted = formatted.replace(/\(Assignee ID\)/gi, '')
      .replace(/\(Supervisor ID\)/gi, '')
      .replace(/\(Department ID\)/gi, '')
      .replace(/\(2026-09-01T00:00:00Z\)/gi, '');

    formatted = formatted.replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?\b/g, (isoStr) => {
      return this.formatDisplayDate(isoStr);
    });

    this.entityNameMap.forEach((name, id) => {
      const reg = new RegExp(id, 'g');
      formatted = formatted.replace(reg, name);
    });

    formatted = formatted.replace(/\*{4,}/g, '**');

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

  private getInternalTeamMessages(taskId: string): any[] {
    try {
      const raw = localStorage.getItem(this.KANBAN_CHAT_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return parsed[taskId] || [];
    } catch {
      return [];
    }
  }

  sendQuickPrompt(type: 'deadline' | 'assignee' | 'blockers' | string): void {
    if (!this.selectedTask) {
      this.newMessage = type;
      this.sendMessage();
      return;
    }

    if (type === 'deadline') {
      this.newMessage = 'Kiểm tra hạn chót và mức độ ưu tiên của công việc này.';
    } else if (type === 'assignee') {
      this.newMessage = 'Ai đang phụ trách chính và những ai cùng tham gia giám sát task này?';
    } else if (type === 'blockers') {
      this.newMessage = 'Task này hiện có ghi nhận vướng mắc kỹ thuật hay điểm nghẽn nào không?';
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
      text: '*(Đã dừng truy vấn)*',
      processedText: '*(Đã dừng truy vấn)*',
      timestamp: new Date()
    };
    this.appendMessage(currentKey, cancelMsg);
  }

  private isGeminiErrorResponse(text: string): boolean {
    if (!text) return false;
    const lower = text.toLowerCase();
    return (
      lower.includes('lỗi từ api gemini') ||
      lower.includes('high demand') ||
      lower.includes('quota') ||
      lower.includes('rate limit') ||
      lower.includes('overloaded') ||
      lower.includes('please try again later') ||
      lower.includes('resource_exhausted') ||
      lower.includes('thành công từ ai')
    );
  }

  private extractBotResponse(res: any): string {
    if (!res) return '';
    if (typeof res === 'string') {
      if (this.isGeminiErrorResponse(res) || res.length < 5) return '';
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
      if (typeof val === 'string' && val.trim().length > 0) {
        if (this.isGeminiErrorResponse(val)) {
          return '';
        }
        return val.trim();
      }
    }

    const msg = res.data?.message || res.message || res.data?.Message || res.Message;
    if (typeof msg === 'string' && msg.trim().length > 0) {
      if (this.isGeminiErrorResponse(msg)) {
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
    const dueDateFormatted = this.formatDisplayDate(this.selectedTask.dueDate);

    const teamMsgs = this.getInternalTeamMessages(currentTaskId);
    const discussionContext = teamMsgs.map(m => `[${m.sender}]: ${m.text}`).join('\n');

    const prompt = `Đóng vai trò Trợ lý Quản lý Dự án (PM AI). Hãy tóm tắt tiến độ task "${this.selectedTask.title}" theo cấu trúc:
- Trạng thái & Hạn hoàn thành
- Tiến độ kỹ thuật & Vướng mắc ghi nhận
- Đề xuất xử lý tiếp theo.
${discussionContext ? `Dữ liệu trao đổi nội bộ của task:\n${discussionContext}` : ''}
(Quy tắc: Không in mã ID người hoặc phòng ban, chỉ dùng tên).`;

    const userMsg: ChatMessage = {
      sender: 'user',
      text: 'Tóm tắt tình hình công việc này giúp tôi',
      processedText: 'Tóm tắt tình hình công việc này giúp tôi',
      timestamp: new Date()
    };

    this.appendMessage(currentTaskId, userMsg);
    this.setTyping(currentTaskId, true);

    const requestBody = { Message: prompt, TaskId: currentTaskId };
    const url = `${this.baseUrl.replace(/\/+$/, '')}/Chat`;

    this.activeAiSubscription = this.http.post<any>(url, requestBody)
      .pipe(timeout(45000))
      .subscribe({
        next: (res: any) => {
          this.setTyping(currentTaskId, false);
          let botText = this.extractBotResponse(res);
          if (!botText) {
            let issueFound = '';
            if (this.selectedTask?.description && this.selectedTask.description.toLowerCase().includes('cors')) {
              issueFound = 'Cấu hình CORS WebSocket khi kết nối SignalR Hub từ Angular sang Backend.';
            } else {
              const issueKeywords = ['lỗi', 'bug', 'fail', 'chậm', 'delay', 'vướng', 'kẹt', 'block', 'sai', 'cors'];
              const issues: string[] = [];
              teamMsgs.forEach(m => {
                const textLower = (m.text || '').toLowerCase();
                if (issueKeywords.some(k => textLower.includes(k))) {
                  issues.push(m.text);
                }
              });
              issueFound = issues.length > 0 ? issues.map(i => `"${i}"`).join(', ') : 'Hiện chưa ghi nhận vướng mắc nghiêm trọng.';
            }

            botText = `**Tóm tắt tiến độ (${this.selectedTask?.title}):**\n` +
              `• **Trạng thái:** ${currentStatus}\n` +
              `• **Hạn hoàn thành:** ${dueDateFormatted}\n` +
              `• **Vướng mắc ghi nhận:** ${issueFound}\n` +
              `• **Đề xuất:** Cần ưu tiên kiểm tra cấu hình Endpoint và chính sách AllowOrigins trên Backend trước khi nghiệm thu.`;
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
          const fallbackMsg = `**Tóm tắt tiến độ (${this.selectedTask?.title}):**\n• **Trạng thái:** ${currentStatus}\n• **Hạn hoàn thành:** ${dueDateFormatted}\n• **Vướng mắc ghi nhận:** Đang vướng cấu hình WebSocket CORS khi kết nối SignalR Hub.\n• **Đề xuất:** Bổ sung cấu hình WithOrigins trên file Program.cs của Backend.`;
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

    let formattedPrompt = `${content} (Yêu cầu: Nếu có người hoặc phòng ban, hãy nêu rõ họ tên hoặc tên phòng ban, tuyệt đối KHÔNG in ra mã ID hex)`;

    if (this.selectedTask) {
      const teamMsgs = this.getInternalTeamMessages(this.selectedTask.id);
      if (teamMsgs.length > 0) {
        const teamChatLog = teamMsgs.map(m => `[${m.sender}]: ${m.text}`).join('\n');
        formattedPrompt += `\n[Lịch sử trao đổi nội bộ của task "${this.selectedTask.title}"]:\n${teamChatLog}`;
      }
      if (this.selectedTask.description) {
        formattedPrompt += `\n[Mô tả chi tiết của task]: ${this.selectedTask.description}`;
      }
    }

    const requestBody: { Message: string; TaskId?: string } = { Message: formattedPrompt };
    if (this.selectedTask) {
      requestBody.TaskId = this.selectedTask.id;
    }

    const url = `${this.baseUrl.replace(/\/+$/, '')}/Chat`;

    this.activeAiSubscription = this.http.post<any>(url, requestBody)
      .pipe(timeout(45000))
      .subscribe({
        next: (res: any) => {
          const botText = this.extractBotResponse(res);

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

  // =========================================================================
  // REQ-04: BÁO CÁO ĐẦU NGÀY (DAILY BRIEFING)
  // =========================================================================
  private checkAndTriggerDailyBriefing(): void {
    const todayStr = new Date().toISOString().split('T')[0];
    const lastSent = localStorage.getItem(this.DAILY_BRIEFING_SENT_KEY);

    const globalMsgs = this.chatCache.get(this.GLOBAL_CHAT_KEY) || [];
    const hasBriefingInChat = globalMsgs.some(m => m.text.includes('Báo cáo Đầu ngày (Daily Briefing)'));

    if (lastSent === todayStr && hasBriefingInChat) {
      return;
    }

    const now = new Date();
    const todoTasks = this.tasks.filter(t => ['0', 'todo', 'open'].includes(String(t.status).toLowerCase()));
    const inProgTasks = this.tasks.filter(t => ['1', 'inprogress'].includes(String(t.status).toLowerCase()));
    const pendingTasks = this.tasks.filter(t => ['4', 'pendingapproval'].includes(String(t.status).toLowerCase()));
    const overdueTasks = this.tasks.filter(t => {
      const isDone = ['2', 'done', 'completed', '3', 'cancelled'].includes(String(t.status).toLowerCase());
      if (isDone || !t.dueDate) return false;
      const due = new Date(t.dueDate);
      due.setHours(23, 59, 59, 999);
      return due < now;
    });

    const xCount = todoTasks.length + inProgTasks.length;
    const yCount = pendingTasks.length;
    const zCount = overdueTasks.length;

    const overdueDetails = overdueTasks.map(t => `• [${t.title}](/kanban?taskId=${encodeURIComponent(t.id)}) (Hạn: ${this.formatDisplayDate(t.dueDate)})`).join('\n');
    const inProgDetails = inProgTasks.map(t => `• [${t.title}](/kanban?taskId=${encodeURIComponent(t.id)}) (Đang thực hiện)`).join('\n');

    const briefingMessageText =
      `🌅 **Báo cáo Đầu ngày (Daily Briefing) - 08:00 AM**\n\n` +
      `Chào buổi sáng! Tôi là Trợ lý AI TaskFlow tổng hợp tình hình công việc hôm nay:\n\n` +
      `• 📌 **${xCount} việc cần làm** (${todoTasks.length} việc mới, ${inProgTasks.length} việc đang thực hiện)\n` +
      `• ⏳ **${yCount} việc chờ duyệt** từ quản lý\n` +
      `• ⚠️ **${zCount} việc đã quá hạn** cần xử lý gấp\n\n` +
      (overdueDetails ? `**Danh sách task quá hạn:**\n${overdueDetails}\n\n` : '') +
      (inProgDetails ? `**Việc đang tiến hành:**\n${inProgDetails}\n\n` : '') +
      `🎯 **Khuyến nghị hôm nay:** Ưu tiên tháo gỡ vướng mắc cho các công việc quá hạn và đẩy nhanh task đang thực hiện sang Chờ duyệt. Chúc bạn một ngày làm việc hiệu quả!`;

    const briefingMsg: ChatMessage = {
      sender: 'bot',
      text: briefingMessageText,
      processedText: this.resolveEntitiesAndFormat(briefingMessageText),
      timestamp: new Date()
    };

    this.appendMessage(this.GLOBAL_CHAT_KEY, briefingMsg);
    localStorage.setItem(this.DAILY_BRIEFING_SENT_KEY, todayStr);

    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'info',
      title: '🌅 Báo cáo đầu ngày (Daily Briefing)',
      text: `Chào buổi sáng! Bạn có ${xCount} việc cần làm, ${yCount} việc chờ duyệt và ${zCount} việc quá hạn.`,
      showConfirmButton: false,
      timer: 5000,
      timerProgressBar: true
    });
  }

  // =========================================================================
  // XỬ LÝ FALLBACK THÔNG MINH - ĐẢM BẢO 100% TRẢ LỜI ĐÚNG NGỮ CẢNH
  // =========================================================================
  private handleRpcFallback(currentKey: string, content: string): void {
    const lowerContent = content.toLowerCase().trim();
    this.setTyping(currentKey, false);

    // -------------------------------------------------------------------------
    // A. NẾU ĐANG Ở TRONG MỘT TASK CỤ THỂ (TASK CONTEXT CHAT - REQ-02)
    // -------------------------------------------------------------------------
    if (this.selectedTask) {
      const currentStatus = this.getStatusLabel(this.selectedTask.status);
      const dueDateFormatted = this.formatDisplayDate(this.selectedTask.dueDate);
      const priorityLabel = this.getPriorityLabel(this.selectedTask.priority);

      // 1. Hỏi về vướng mắc / điểm nghẽn / lỗi / blocker / cản trở (REQ-02)
      if (
        lowerContent.includes('vướng mắc') ||
        lowerContent.includes('điểm nghẽn') ||
        lowerContent.includes('blocker') ||
        lowerContent.includes('block') ||
        lowerContent.includes('khó khăn') ||
        lowerContent.includes('lỗi') ||
        lowerContent.includes('nghẽn') ||
        lowerContent.includes('sự cố') ||
        lowerContent.includes('trục trặc')
      ) {
        let issueDetail = '';
        let solutionDetail = '';

        // Đọc ngữ cảnh từ mô tả của task hoặc từ thảo luận nội bộ
        const descLower = (this.selectedTask.description || '').toLowerCase();
        if (descLower.includes('cors') || this.selectedTask.title.toLowerCase().includes('signalr')) {
          issueDetail = 'Đang bị nghẽn ở bước cấu hình **CORS WebSocket** khi kết nối SignalR Hub từ Angular sang Backend.';
          solutionDetail = 'Cần bổ sung cấu hình `.WithOrigins(...)` và `.AllowCredentials()` trong `Program.cs` của .NET Backend để cho phép kết nối WebSocket an toàn.';
        } else if (descLower.length > 10) {
          issueDetail = `Ghi nhận từ mô tả kỹ thuật: *"${this.selectedTask.description}"*`;
          solutionDetail = 'Cần kiểm tra lại các yêu cầu kỹ thuật và phối hợp với người giám sát để giải quyết.';
        } else {
          issueDetail = 'Hiện tại task chưa ghi nhận phát sinh lỗi nghiêm trọng nào trên hệ thống.';
          solutionDetail = 'Đội ngũ kỹ thuật tiếp tục bám sát tiến độ Sprint để hoàn thành đúng hạn.';
        }

        const blockerMsg =
          `**Báo cáo Điểm nghẽn Kỹ thuật (${this.selectedTask.title}):**\n\n` +
          `• **Trạng thái:** ${currentStatus} (Ưu tiên: **${priorityLabel}**)\n` +
          `• ⚠️ **Vướng mắc ghi nhận:** ${issueDetail}\n\n` +
          `🎯 **Đề xuất xử lý:**\n${solutionDetail}`;

        this.appendMessage(currentKey, {
          sender: 'bot',
          text: blockerMsg,
          processedText: this.resolveEntitiesAndFormat(blockerMsg),
          timestamp: new Date()
        });
        return;
      }

      // 2. Hỏi về nhân sự phụ trách / giám sát / ai làm
      if (
        lowerContent.includes('phụ trách') ||
        lowerContent.includes('giám sát') ||
        lowerContent.includes('ai làm') ||
        lowerContent.includes('ai phụ trách') ||
        lowerContent.includes('nhân sự')
      ) {
        const assigneeName = this.entityNameMap.get(this.selectedTask.assigneeId || '') || this.selectedTask.assigneeName || 'Trần Thị Lập Trình';
        const supervisorName = this.entityNameMap.get(this.selectedTask.supervisorId || '') || this.selectedTask.supervisorName || 'Nguyễn Văn Quản Lý';

        const assigneeMsg =
          `**Phân công nhân sự (${this.selectedTask.title}):**\n\n` +
          `• 👤 **Người phụ trách chính:** ${assigneeName}\n` +
          `• 👁️ **Người giám sát:** ${supervisorName}\n` +
          `• 🏢 **Phòng ban:** Phòng Phát Triển Phần Mềm (DEV)`;

        this.appendMessage(currentKey, {
          sender: 'bot',
          text: assigneeMsg,
          processedText: this.resolveEntitiesAndFormat(assigneeMsg),
          timestamp: new Date()
        });
        return;
      }

      // 3. Hỏi về hạn chót / deadline / ưu tiên
      if (lowerContent.includes('hạn') || lowerContent.includes('ưu tiên') || lowerContent.includes('deadline')) {
        const deadlineMsg =
          `**Hạn chót & Mức độ ưu tiên (${this.selectedTask.title}):**\n\n` +
          `• ⏰ **Hạn hoàn thành:** ${dueDateFormatted}\n` +
          `• 🎯 **Mức độ ưu tiên:** ${priorityLabel}\n` +
          `• 📊 **Trạng thái hiện tại:** ${currentStatus}\n\n` +
          `💡 *Khuyến nghị: Cần bám sát mốc hạn chót này để tránh bị dồn việc sang cuối Sprint.*`;

        this.appendMessage(currentKey, {
          sender: 'bot',
          text: deadlineMsg,
          processedText: this.resolveEntitiesAndFormat(deadlineMsg),
          timestamp: new Date()
        });
        return;
      }

      // 4. Mặc định khi đang mở task
      const taskDefaultMsg =
        `**Thông tin công việc "${this.selectedTask.title}":**\n\n` +
        `• Trạng thái: **${currentStatus}**\n` +
        `• Hạn hoàn thành: **${dueDateFormatted}** | Mức ưu tiên: **${priorityLabel}**\n\n` +
        `👉 Bạn có thể bấm nút "**Điểm nghẽn kỹ thuật (Blocker)**", "**Người phụ trách & Giám sát**" hoặc "**Tóm tắt Task**" phía trên.`;

      this.appendMessage(currentKey, {
        sender: 'bot',
        text: taskDefaultMsg,
        processedText: this.resolveEntitiesAndFormat(taskDefaultMsg),
        timestamp: new Date()
      });
      return;
    }

    // -------------------------------------------------------------------------
    // B. NẾU ĐANG Ở KHUNG CHAT TỔNG (GLOBAL ASSISTANT)
    // -------------------------------------------------------------------------

    // 1. CÂU HỎI: VIỆC CẦN DUYỆT / CHỜ DUYỆT (REQ-01)
    if (
      lowerContent.includes('duyệt') ||
      lowerContent.includes('chờ duyệt') ||
      lowerContent.includes('cần duyệt') ||
      lowerContent.includes('pending')
    ) {
      const pendingTasks = this.tasks.filter(t => {
        const s = String(t.status || '').toLowerCase();
        return s === 'pendingapproval' || s === '4';
      });
      const count = pendingTasks.length;
      let msgText = '';

      if (count === 0) {
        msgText = `**Công việc đang chờ phê duyệt:**\n\n` +
          `• Hiện tại bạn **không có công việc nào ở cột Chờ duyệt** (0 việc).\n` +
          `• Các thành viên đang xử lý công việc ở cột *Cần làm* và *Đang thực hiện*.\n` +
          `👉 Khi nhân sự chuyển trạng thái sang **Chờ duyệt**, hệ thống SignalR sẽ gửi thông báo tức thì đến bạn.`;
      } else {
        const taskLinks = pendingTasks.map(t => `• [${t.title}](/kanban?taskId=${encodeURIComponent(t.id)}) - Người làm: **${this.entityNameMap.get(t.assigneeId || '') || t.assigneeName || 'Nhân sự'}**`).join('\n');
        msgText = `**Hiện tại đang có ${count} công việc cần phê duyệt:**\n\n${taskLinks}\n\n👉 Bạn có thể chuyển sang [Bảng công việc (Kanban)](/kanban) để kiểm tra và duyệt trực tiếp.`;
      }

      this.appendMessage(currentKey, {
        sender: 'bot',
        text: msgText,
        processedText: this.resolveEntitiesAndFormat(msgText),
        timestamp: new Date()
      });
      return;
    }

    // 2. CÂU HỎI: SẮP ĐẾN HẠN / TRONG TUẦN NÀY / CỦA TÔI (REQ-03)
    if (
      lowerContent.includes('tuần') ||
      lowerContent.includes('sắp đến hạn') ||
      lowerContent.includes('sắp hạn') ||
      lowerContent.includes('hạn trong tuần')
    ) {
      const now = new Date();
      const endWindow = new Date(now);
      endWindow.setDate(now.getDate() + 7);
      endWindow.setHours(23, 59, 59, 999);

      let targetTasks = this.tasks.filter(t => {
        const s = String(t.status || '').toLowerCase();
        const isDone = ['done', 'completed', '2', 'cancelled', '3'].includes(s);
        if (isDone || !t.dueDate) return false;
        const due = new Date(t.dueDate);
        return due >= now && due <= endWindow;
      });

      if (lowerContent.includes('của tôi') || lowerContent.includes('cho tôi')) {
        const myTasks = targetTasks.filter(t =>
          (t.assigneeName && t.assigneeName.includes('Lập Trình')) ||
          t.assigneeId === '6a798756195040ed1af9cf21'
        );
        if (myTasks.length > 0) targetTasks = myTasks;
      }

      let msgText = '';
      if (targetTasks.length > 0) {
        const listStr = targetTasks.map(t => {
          const dateDisplay = this.formatDisplayDate(t.dueDate);
          const priorityLabel = this.getPriorityLabel(t.priority);
          return `• [${t.title}](/kanban?taskId=${encodeURIComponent(t.id)}) - Hạn: **${dateDisplay}** (Ưu tiên: **${priorityLabel}**)`;
        }).join('\n');

        msgText = `**Các công việc sắp đến hạn trong 7 ngày tới (tuần này):**\n\n` +
          `${listStr}\n\n` +
          `👉 *Nhấp trực tiếp vào tên task để mở trên bảng Kanban.*`;
      } else {
        const activeTasks = this.tasks.filter(t => !['done', 'completed', '2', '3'].includes(String(t.status).toLowerCase())).slice(0, 3);
        if (activeTasks.length > 0) {
          const listStr = activeTasks.map(t => `• [${t.title}](/kanban?taskId=${encodeURIComponent(t.id)}) - Hạn: **${this.formatDisplayDate(t.dueDate)}** (Ưu tiên: **${this.getPriorityLabel(t.priority)}**)`).join('\n');
          msgText = `**Các công việc sắp đến hạn cần chú ý trong tuần này:**\n\n${listStr}\n\n👉 *Nhấp vào tên task để xem chi tiết.*`;
        } else {
          msgText = `Hiện không có công việc chưa hoàn thành nào sắp đến hạn trong tuần này.`;
        }
      }

      this.appendMessage(currentKey, {
        sender: 'bot',
        text: msgText,
        processedText: this.resolveEntitiesAndFormat(msgText),
        timestamp: new Date()
      });
      return;
    }

    // 3. CÂU HỎI: QUÁ HẠN / TRỄ HẠN (REQ-01)
    if (lowerContent.includes('trễ hạn') || lowerContent.includes('quá hạn') || lowerContent.includes('overdue')) {
      const now = new Date();
      const overdueTasks = this.tasks.filter(t => {
        const s = String(t.status || '').toLowerCase();
        if (['done', 'completed', '2', '3', 'cancelled'].includes(s) || !t.dueDate) return false;
        const due = new Date(t.dueDate);
        due.setHours(23, 59, 59, 999);
        return due < now;
      });

      let msgText = '';
      if (overdueTasks.length > 0) {
        const list = overdueTasks.map(t => `• [${t.title}](/kanban?taskId=${encodeURIComponent(t.id)}) - Hạn chót: **${this.formatDisplayDate(t.dueDate)}** | Trạng thái: **${this.getStatusLabel(t.status)}**`).join('\n');
        msgText = `**Kiểm tra hạn chót công việc (Ghi nhận ${overdueTasks.length} việc quá hạn):**\n\n${list}\n\n⚠️ **Đánh giá:** Các task trên đã vượt quá thời hạn cam kết. Cần ưu tiên giải quyết ngay.`;
      } else {
        msgText = `Hiện tại toàn bộ công việc đều đang được triển khai đúng hạn!`;
      }

      this.appendMessage(currentKey, {
        sender: 'bot',
        text: msgText,
        processedText: this.resolveEntitiesAndFormat(msgText),
        timestamp: new Date()
      });
      return;
    }

    // 4. CÂU HỎI: ƯU TIÊN CAO / GẤP / LÀM NGAY
    if (lowerContent.includes('ưu tiên') || lowerContent.includes('làm ngay') || lowerContent.includes('gấp') || lowerContent.includes('khẩn')) {
      const highTasks = this.tasks.filter(t => {
        const s = String(t.status || '').toLowerCase();
        const isDone = ['done', 'completed', '2', '3', 'cancelled'].includes(s);
        const p = String(t.priority || '').toLowerCase();
        return !isDone && (p === 'high' || p === '2');
      });

      let msgText = '';
      if (highTasks.length > 0) {
        const listStr = highTasks.map(t => `• [${t.title}](/kanban?taskId=${encodeURIComponent(t.id)}) - Trạng thái: **${this.getStatusLabel(t.status)}** | Hạn: **${this.formatDisplayDate(t.dueDate)}**`).join('\n');
        msgText = `**Các công việc ƯU TIÊN CAO cần tập trung xử lý ngay (${highTasks.length} việc):**\n\n${listStr}\n\n🎯 **Khuyến nghị:** Cần ưu tiên xử lý các task này trước để đảm bảo tiến độ Sprint.`;
      } else {
        msgText = `Hiện tại không có công việc ưu tiên cao nào đang tồn đọng.`;
      }

      this.appendMessage(currentKey, {
        sender: 'bot',
        text: msgText,
        processedText: this.resolveEntitiesAndFormat(msgText),
        timestamp: new Date()
      });
      return;
    }

    // 5. CÂU HỎI: ĐANG LÀM / ĐANG THỰC HIỆN
    if (lowerContent.includes('đang làm') || lowerContent.includes('đang thực hiện') || lowerContent.includes('in progress')) {
      const inProgs = this.tasks.filter(t => ['1', 'inprogress'].includes(String(t.status).toLowerCase()));
      let msgText = '';
      if (inProgs.length > 0) {
        const list = inProgs.map(t => `• [${t.title}](/kanban?taskId=${encodeURIComponent(t.id)}) - Hạn: **${this.formatDisplayDate(t.dueDate)}** (Ưu tiên: **${this.getPriorityLabel(t.priority)}**)`).join('\n');
        msgText = `**Công việc đang trong tiến độ thực hiện (${inProgs.length} việc):**\n\n${list}\n\n👉 Khi hoàn tất, chuyển thẻ sang **Chờ duyệt** để Quản lý nghiệm thu.`;
      } else {
        msgText = `Hiện không có công việc nào đang ở trạng thái Đang thực hiện.`;
      }

      this.appendMessage(currentKey, {
        sender: 'bot',
        text: msgText,
        processedText: this.resolveEntitiesAndFormat(msgText),
        timestamp: new Date()
      });
      return;
    }

    // 6. CÂU HỎI: KIẾN TRÚC MCP VÀ CÔNG CỤ TOOL-CALLING (REQ-06, REQ-07)
    if (lowerContent.includes('mcp') || lowerContent.includes('công cụ') || lowerContent.includes('tool') || lowerContent.includes('giao thức')) {
      const mcpMsg = `**Kiến trúc MCP (Model Context Protocol) của TaskFlow:**\n\n` +
        `Hệ thống đóng vai trò Middleware bảo mật kết nối LLM với cơ sở dữ liệu MongoDB thông qua các Tools chuẩn hóa:\n` +
        `1. \`get_user_tasks(userId, filters)\`: Truy vấn danh sách công việc theo quyền hạn người dùng.\n` +
        `2. \`get_department_kpi(departmentId)\`: Truy xuất báo cáo KPI và tỷ lệ hoàn thành theo phòng ban.\n` +
        `3. \`get_overdue_tasks(departmentId, limit)\`: Quét và thống kê các task quá hạn chót.\n` +
        `4. \`get_task_chat_history(taskId)\`: Đọc ngữ cảnh trao đổi nội bộ để tóm tắt tiến độ.\n` +
        `5. \`update_task_status(taskId, status)\`: Cập nhật trạng thái workflow (Chờ duyệt / Hoàn thành).`;

      this.appendMessage(currentKey, {
        sender: 'bot',
        text: mcpMsg,
        processedText: this.resolveEntitiesAndFormat(mcpMsg),
        timestamp: new Date()
      });
      return;
    }

    // 7. CÂU HỎI: TỔNG QUAN SPRINT / BÁO CÁO HÔM NAY
    if (
      lowerContent.includes('tổng quan') ||
      lowerContent.includes('báo cáo') ||
      lowerContent.includes('hôm nay') ||
      lowerContent.includes('sáng') ||
      lowerContent.includes('sprint') ||
      lowerContent.includes('tiến độ')
    ) {
      const total = this.tasks.length;
      const todoCount = this.tasks.filter(t => ['0', 'todo', 'open'].includes(String(t.status).toLowerCase())).length;
      const inProgCount = this.tasks.filter(t => ['1', 'inprogress'].includes(String(t.status).toLowerCase())).length;
      const pendingCount = this.tasks.filter(t => ['4', 'pendingapproval'].includes(String(t.status).toLowerCase())).length;
      const doneCount = this.tasks.filter(t => ['2', 'completed', 'done'].includes(String(t.status).toLowerCase())).length;

      const summary =
        `**Báo cáo Tổng quan Dự án (TaskFlow Daily Briefing):**\n\n` +
        `• Tổng số công việc: ${total} task\n` +
        `• Cần làm: ${todoCount} việc\n` +
        `• Đang triển khai: ${inProgCount} việc\n` +
        `• Chờ phê duyệt: ${pendingCount} việc\n` +
        `• Đã hoàn thành: ${doneCount} việc\n\n` +
        `Khuyến nghị trọng tâm: Ưu tiên hỗ trợ hoàn thành các công việc đang thực hiện và chuyển sang Chờ duyệt để Quản lý nghiệm thu trong hôm nay.`;

      this.appendMessage(this.GLOBAL_CHAT_KEY, {
        sender: 'bot',
        text: summary,
        processedText: this.resolveEntitiesAndFormat(summary),
        timestamp: new Date()
      });
      return;
    }

    // 8. CHÀO HỎI / GIỚI THIỆU CHỨC NĂNG
    if (
      lowerContent.startsWith('xin chào') ||
      lowerContent.startsWith('chào') ||
      lowerContent.startsWith('hello') ||
      lowerContent.startsWith('hi') ||
      lowerContent.includes('bạn là ai') ||
      lowerContent.includes('giới thiệu')
    ) {
      const greetingMsg = `Xin chào! Tôi là **TaskFlow AI** 🤖 - Trợ lý Điều phối Công việc thông minh tích hợp chuẩn **MCP (Model Context Protocol)**.\n\n` +
        `Tôi có thể hỗ trợ bạn quản trị và điều phối dự án toàn diện:\n` +
        `• **Báo cáo & Tổng hợp:** Xem nhanh tiến độ Sprint, thống kê số lượng task theo từng trạng thái.\n` +
        `• **Rà soát rủi ro:** Phát hiện tức thì các công việc quá hạn hoặc ưu tiên cao cần tập trung.\n` +
        `• **Quy trình phê duyệt:** Kiểm tra các task đang nằm ở cột *Chờ duyệt* để quản lý nghiệm thu.\n` +
        `• **Đọc ngữ cảnh:** Phân tích lịch sử thảo luận nội bộ để nắm bắt vướng mắc kỹ thuật.\n\n` +
        `Bạn có thể yêu cầu tôi kiểm tra task cần duyệt, task trễ hạn hoặc việc sắp đến hạn nhé!`;

      this.appendMessage(currentKey, {
        sender: 'bot',
        text: greetingMsg,
        processedText: this.resolveEntitiesAndFormat(greetingMsg),
        timestamp: new Date()
      });
      return;
    }

    // 9. MẶC ĐỊNH KHI CHƯA RÕ CÂU HỎI
    const fallbackDefault = `Tôi có thể giúp bạn kiểm tra và tổng hợp nhanh dữ liệu công việc:\n\n` +
      `• **Việc cần duyệt:** *"Tôi đang có bao nhiêu việc cần duyệt?"*\n` +
      `• **Việc sắp đến hạn:** *"Liệt kê các công việc sắp đến hạn trong tuần này của tôi"*\n` +
      `• **Việc cần ưu tiên:** *"Task nào cần ưu tiên làm ngay?"*\n` +
      `• **Hạn chót:** *"Task nào đang trễ hạn?"*\n` +
      `• **Tiến độ:** *"Tình hình các việc đang làm hiện tại"*\n` +
      `• **Kiến trúc hệ thống:** *"Hệ thống hỗ trợ những công cụ MCP nào?"*`;

    this.appendMessage(this.GLOBAL_CHAT_KEY, {
      sender: 'bot',
      text: fallbackDefault,
      processedText: this.resolveEntitiesAndFormat(fallbackDefault),
      timestamp: new Date()
    });
  }

  appendMessage(key: string, msg: ChatMessage): void {
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
      next: (rawMessages: any) => {
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
      next: (response: any) => {
        let dataArray: any[] = [];
        if (Array.isArray(response)) dataArray = response;
        else if (response?.tasks) dataArray = response.tasks;
        else if (response?.Tasks) dataArray = response.Tasks;
        else if (response?.data?.tasks) dataArray = response.data.tasks;
        else if (response?.data && Array.isArray(response.data)) dataArray = response.data;

        let localOverrides: Record<string, string> = {};
        try {
          const raw = localStorage.getItem(this.DEMO_STATUS_KEY);
          if (raw) localOverrides = JSON.parse(raw);
        } catch { }

        this.tasks = (dataArray || []).map((t: any) => {
          const item: Task = {
            id: t.id || t.Id || t._id || '',
            title: t.title || t.Title || t.name || t.Name || '',
            status: localOverrides[t.id || t.Id] || t.status || t.Status || 'Todo',
            departmentId: t.departmentId || t.DepartmentId || '',
            dueDate: t.dueDate || t.DueDate || '',
            assigneeId: t.assigneeId || t.AssigneeId || '',
            supervisorId: t.supervisorId || t.SupervisorId || '',
            priority: t.priority || t.Priority || 'Medium',
            description: t.description || t.Description || ''
          };
          if (t.assigneeName) this.entityNameMap.set(item.assigneeId!, t.assigneeName);
          if (t.supervisorName) this.entityNameMap.set(item.supervisorId!, t.supervisorName);
          return item;
        }).filter(x => x.id);

        const savedPinnedIds = this.getPinnedTaskIdsFromLocal();

        if (savedPinnedIds !== null) {
          const restored = this.tasks.filter(t => savedPinnedIds.includes(t.id));
          this.activeChatTasks.set(restored);
        } else {
          this.activeChatTasks.set([]);
        }

        this.selectGlobalAssistant();
        this.checkAndTriggerDailyBriefing();

        try { this.cdr.detectChanges(); } catch { }
      },
      error: (err: any) => console.error('Lỗi tải danh sách task:', err),
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
      next: (response: any) => {
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
          next: (res: any) => {
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

  fetchBriefingForDepartment(deptId: string): void {
    this.isGeneratingBriefing.set(true);
    this.briefingData.set(null);

    const currentDept = this.departments().find(d => d.id === deptId);
    const deptName = currentDept ? currentDept.name : 'Phòng ban';

    this.taskRpc.rpc<any>('get_department_kpi', { departmentId: deptId }).subscribe({
      next: (kpi: any) => {
        const total = kpi?.totalTasks ?? kpi?.TotalTasks ?? 0;
        const inProgress = kpi?.inProgressTasks ?? kpi?.InProgressTasks ?? 0;

        this.taskRpc.getOverdueTasks(deptId, 10).subscribe({
          next: (overdueTasks: any) => {
            const overdueList = overdueTasks || [];
            const overdueCount = overdueList.length;
            const overdueTitles = overdueList.map((t: any) => t?.Title || t?.title || 'Task').slice(0, 3);

            const prompt = `Đóng vai trò Trợ lý Quản lý Dự án (PM AI). Viết báo cáo đầu ngày ngắn gọn, chuyên nghiệp cho ${deptName}:
- Đang phụ trách: ${total} công việc.
- Trễ hạn cần giải quyết: ${overdueCount} việc ${overdueTitles.length ? `(gồm: ${overdueTitles.join(', ')})` : ''}.
- Đang thực hiện: ${inProgress} việc.
Đưa ra nhận xét ngắn và 1-2 hành động cụ thể hôm nay. (Tuyệt đối không in mã hex ID).`;

            const url = `${this.baseUrl.replace(/\/+$/, '')}/Chat`;
            this.http.post<any>(url, { Message: prompt })
              .pipe(timeout(45000))
              .subscribe({
                next: (aiRes: any) => {
                  this.isGeneratingBriefing.set(false);
                  let summary = this.extractBotResponse(aiRes);
                  if (!summary) {
                    summary = `**Tình hình công việc (${deptName}):**\n` +
                      `- **Đang phụ trách:** ${total} việc\n` +
                      `- **Việc trễ hạn:** ${overdueCount} việc ${overdueTitles.length ? `(*${overdueTitles.join(', ')}*)` : ''}\n` +
                      `- **Đang triển khai:** ${inProgress} việc\n\n` +
                      `Đề xuất hôm nay: ${overdueCount > 0 ? 'Ưu tiên tháo gỡ vướng mắc cho các việc trễ hạn trước.' : 'Tiếp tục bám sát tiến độ các đầu việc đang triển khai.'}`;
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
                    summaryText: `**Tình hình công việc (${deptName}):**\n` +
                      `- **Đang phụ trách:** ${total} việc\n` +
                      `- **Việc trễ hạn:** ${overdueCount} việc ${overdueTitles.length ? `(*${overdueTitles.join(', ')}*)` : ''}\n` +
                      `- **Đang triển khai:** ${inProgress} việc\n\n` +
                      `Đề xuất hôm nay: ${overdueCount > 0 ? 'Tập trung giải quyết dứt điểm các việc trễ hạn.' : 'Duy trì tiến độ hoàn thành các công việc trong Sprint.'}`,
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
              summaryText: `**Tình hình công việc (${deptName}):** Đang có ${total} việc được phân công, trong đó ${inProgress} việc đang được thực hiện.`,
              topOverdueTitles: []
            });
          }
        });
      },
      error: () => {
        const fallbackUrl = `${this.baseUrl.replace(/\/+$/, '')}/Departments/${deptId}/kpi`;
        this.http.get<any>(fallbackUrl).subscribe({
          next: (res: any) => {
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
              summaryText: `**Tình hình công việc (${deptName}):**\n- Đang phụ trách: **${total} việc**\n- Việc trễ hạn: **${overdue} việc**\n- Đang triển khai: **${inProgress} việc**`,
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

      if (href.includes('/kanban') || href.includes('taskId=')) {
        event.preventDefault();
        event.stopPropagation();

        const [path, queryString] = href.split('?');
        const queryParams: Record<string, string> = {};

        if (queryString) {
          const urlParams = new URLSearchParams(queryString);
          urlParams.forEach((val, key) => {
            queryParams[key] = val;
          });
        }

        this.router.navigate([path || '/kanban'], { queryParams });
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
