import { Component, OnInit, OnDestroy, inject, signal, HostListener, ChangeDetectorRef, ViewChild, ElementRef } from '@angular/core';
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
import { ChatService } from '../chat.service';
import { environment } from '../../environments/environment';
import { TaskRpcService } from '../services/task-rpc.service';

import { MarkdownRendererComponent } from '../shared/markdown/markdown-renderer.component';
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
  private chatService = inject(ChatService);
  private taskRpc = inject(TaskRpcService);
  private router = inject(Router) as Router;
  private cdr = inject(ChangeDetectorRef);

  @ViewChild('chatContainer') private chatContainer!: ElementRef;

  tasks: Task[] = [];
  messages = signal<ChatMessage[]>([]);
  aiChatHistory = signal<any[]>([]);
  selectedTask: Task | null = null;
  newMessage = '';

  // Quản lý trạng thái bot đang suy nghĩ riêng theo từng Task ID
  typingTaskIds = signal<Set<string>>(new Set<string>());

  showKpiModal = signal(false);
  kpiData = signal<{ departmentName?: string; totalTasks?: number; completedTasks?: number; inProgressTasks?: number; completionRate?: number } | null>(null);

  private chatCache = new Map<string, ChatMessage[]>();

  getStatusLabel(status: any): string {
    const s = String(status ?? '').toLowerCase();
    if (s === 'inprogress' || s === '1') return 'Đang làm';
    if (s === 'completed' || s === 'done' || s === '2') return 'Đã hoàn thành';
    return 'Cần làm';
  }

  isBotTyping(): boolean {
    if (!this.selectedTask) return false;
    return this.typingTaskIds().has(this.selectedTask.id);
  }

  private setTyping(taskId: string, typing: boolean): void {
    this.typingTaskIds.update(set => {
      const next = new Set(set);
      if (typing) next.add(taskId);
      else next.delete(taskId);
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
      } catch (err) { }
    }, 60);
  }

  private loadChatCacheFromLocal(): void {
    const saved = localStorage.getItem('home_ai_chat_cache');
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Record<string, ChatMessage[]>;
        this.chatCache.clear();
        Object.keys(parsed).forEach(taskId => {
          const msgs = parsed[taskId].map(m => ({ ...m, timestamp: m.timestamp ? new Date(m.timestamp) : new Date() }));
          this.chatCache.set(taskId, msgs);
        });
      } catch (e) { }
    }
  }

  private saveChatCacheToLocal(): void {
    const obj: Record<string, ChatMessage[]> = {};
    this.chatCache.forEach((value, key) => { obj[key] = value; });
    localStorage.setItem('home_ai_chat_cache', JSON.stringify(obj));
  }

  ngOnInit(): void {
    this.loadChatCacheFromLocal();
    this.loadUserTasks();
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

  isNewDate(index: number, currentMsg: ChatMessage, allMsgs: ChatMessage[]): boolean {
    if (index === 0) return true;
    const prevDate = new Date(allMsgs[index - 1].timestamp || new Date()).setHours(0, 0, 0, 0);
    const currDate = new Date(currentMsg.timestamp || new Date()).setHours(0, 0, 0, 0);
    return prevDate !== currDate;
  }

  summarizeTask(): void {
    if (!this.selectedTask) return;

    const currentTaskId = this.selectedTask.id;
    const prompt = 'Hãy tóm tắt ngắn gọn tiến độ hiện tại, nội dung chính và các vướng mắc (nếu có) của công việc này.';

    const userMsg: ChatMessage = {
      sender: 'user',
      text: 'Yêu cầu AI tóm tắt tiến độ công việc',
      processedText: 'Yêu cầu AI tóm tắt tiến độ công việc',
      timestamp: new Date()
    };

    this.appendMessage(currentTaskId, userMsg);
    this.setTyping(currentTaskId, true);

    const requestBody = { Message: prompt, TaskId: currentTaskId };
    const url = `${this.baseUrl.replace(/\/+$/, '')}/chat`;

    this.http.post<any>(url, requestBody).subscribe({
      next: (res) => {
        this.setTyping(currentTaskId, false);
        const botText = res?.data?.answer || res?.data?.Answer || res?.Answer || res?.answer || res?.result || (typeof res === 'string' ? res : '') || 'Không có câu trả lời.';
        const botMsg: ChatMessage = {
          sender: 'bot',
          text: botText,
          processedText: this.linkifyTaskCodes(botText),
          timestamp: new Date()
        };
        this.appendMessage(currentTaskId, botMsg);
      },
      error: (err) => {
        console.error('Lỗi tóm tắt task:', err);
        this.setTyping(currentTaskId, false);
        const botMsg: ChatMessage = {
          sender: 'bot',
          text: 'Đã xảy ra lỗi khi lấy dữ liệu tóm tắt từ hệ thống.',
          processedText: 'Đã xảy ra lỗi khi lấy dữ liệu tóm tắt từ hệ thống.',
          timestamp: new Date()
        };
        this.appendMessage(currentTaskId, botMsg);
      }
    });
  }

  sendMessage(): void {
    const content = (this.newMessage || '').trim();
    if (!content || !this.selectedTask) return;

    const currentTaskId = this.selectedTask.id;
    const userMsg: ChatMessage = { sender: 'user', text: content, processedText: this.linkifyTaskCodes(content), timestamp: new Date() };

    this.appendMessage(currentTaskId, userMsg);
    this.newMessage = '';
    this.setTyping(currentTaskId, true);

    const requestBody = { Message: content, TaskId: currentTaskId };
    const url = `${this.baseUrl.replace(/\/+$/, '')}/chat`;

    this.http.post<any>(url, requestBody).subscribe({
      next: (res) => {
        this.setTyping(currentTaskId, false);
        const botText = res?.data?.answer || res?.data?.Answer || res?.Answer || res?.answer || res?.result || (typeof res === 'string' ? res : '') || 'Không có câu trả lời.';
        const botMsg: ChatMessage = {
          sender: 'bot',
          text: botText,
          processedText: this.linkifyTaskCodes(botText),
          timestamp: new Date()
        };
        this.appendMessage(currentTaskId, botMsg);
      },
      error: (err) => {
        console.error('Lỗi gửi tin nhắn:', err);
        this.setTyping(currentTaskId, false);
        const botMsg: ChatMessage = {
          sender: 'bot',
          text: 'Không thể kết nối đến máy chủ AI.',
          processedText: 'Không thể kết nối đến máy chủ AI.',
          timestamp: new Date()
        };
        this.appendMessage(currentTaskId, botMsg);
      }
    });
  }

  private appendMessage(taskId: string, msg: ChatMessage): void {
    const list = [...(this.chatCache.get(taskId) || []), msg];
    this.chatCache.set(taskId, list);
    this.saveChatCacheToLocal();

    if (this.selectedTask?.id === taskId) {
      this.messages.set(list);
      this.scrollToBottom();
    }
  }

  selectTask(task: Task): void {
    this.selectedTask = task;

    if (this.chatCache.has(task.id)) {
      this.messages.set(this.chatCache.get(task.id) || []);
      this.scrollToBottom();
      return;
    }

    this.messages.set([]);
    this.taskRpc.rpc<any[]>('get_task_chat_history', { TaskId: task.id }).subscribe({
      next: (rawMessages) => {
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
          this.chatCache.set(task.id, mapped);
          if (this.selectedTask?.id === task.id) {
            this.messages.set(mapped);
            this.scrollToBottom();
          }
        }
      },
      error: (err) => console.error('Lỗi khi lấy lịch sử chat:', err)
    });
  }

  loadUserTasks(): void {
    const url = `${this.baseUrl.replace(/\/+$/, '')}/Tasks`;
    this.http.get<any>(url).subscribe({
      next: (response) => {
        let dataArray: any[] = [];
        if (Array.isArray(response)) dataArray = response;
        else if (response && Array.isArray(response.tasks)) dataArray = response.tasks;
        else if (response && Array.isArray(response.Tasks)) dataArray = response.Tasks;
        else if (response && response.data && Array.isArray(response.data.tasks)) dataArray = response.data.tasks;
        else if (response && response.data && Array.isArray(response.data)) dataArray = response.data;

        this.tasks = (dataArray || []).map((t: any) => ({
          id: t.id || t.Id || t._id || '',
          title: t.title || t.Title || t.name || t.Name || '',
          status: t.status || t.Status || 'Todo'
        } as Task)).filter(x => x.id);

        if (this.tasks.length > 0 && !this.selectedTask) {
          this.selectTask(this.tasks[0]);
        }

        try { this.cdr.detectChanges(); } catch { }
      },
      error: (err) => console.error('Lỗi tải danh sách công việc:', err),
    });
  }

  testKpiApi(): void {
    const url = `${this.baseUrl.replace(/\/+$/, '')}/Departments/kpi`;
    this.http.get<any>(url).subscribe({
      next: response => {
        this.kpiData.set({
          departmentName: response?.departmentName ?? response?.DepartmentName,
          totalTasks: response?.totalTasks ?? response?.TotalTasks,
          completedTasks: response?.completedTasks ?? response?.CompletedTasks,
          inProgressTasks: response?.inProgressTasks ?? response?.InProgressTasks,
          completionRate: response?.completionRate ?? response?.CompletionRate,
        });
        this.showKpiModal.set(true);
        try { this.cdr.detectChanges(); } catch { }
      },
      error: err => console.error('Lỗi lấy KPI:', err)
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
      const insideMessage = !!anchor.closest('.message-content');
      const match = insideMessage ? href.match(/\/?tasks\/?([A-Za-z0-9-_%]+)/i) : null;
      if (match && insideMessage) {
        event.preventDefault();
        const id = decodeURIComponent(match[1]);
        const path = `/tasks/${id}`;
        this.router.navigateByUrl(path).catch(() => { (window.location as any).href = path; });
      }
    } catch { }
  }

  ngOnDestroy(): void { }

  trackByMessage(_index: number, message: ChatMessage): string | number {
    return message.timestamp ? message.timestamp.getTime() : _index;
  }

  trackByTask(_index: number, task: Task): string {
    return task.id;
  }
}
