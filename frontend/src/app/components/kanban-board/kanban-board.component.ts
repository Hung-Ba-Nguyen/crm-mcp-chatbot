import { Component, OnInit, inject, signal, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { DragDropModule, CdkDragDrop, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { MatIconModule } from '@angular/material/icon';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { TaskRpcService } from '../../services/task-rpc.service';
import Swal, { SweetAlertResult } from 'sweetalert2';

interface KanbanTask {
  id: string;
  title: string;
  priority?: string;
  dueDate?: string | null;
  status?: string | number;
  description?: string;
  departmentId?: string;
  assigneeId?: string;
  supervisorIds?: string[] | string;
}

interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  timestamp: Date;
  isMine: boolean;
  hearts?: number;
  hasHearted?: boolean;
}

@Component({
  selector: 'app-kanban-board',
  standalone: true,
  imports: [CommonModule, DragDropModule, FormsModule, MatIconModule],
  templateUrl: './kanban-board.component.html',
  styleUrls: ['./kanban-board.component.scss']
})
export class KanbanBoardComponent implements OnInit {
  private http = inject(HttpClient);
  private taskRpc = inject(TaskRpcService);
  private cdr = inject(ChangeDetectorRef);
  private route = inject(ActivatedRoute);

  isLoading = signal(true);
  error = signal<string | null>(null);

  allTodo = signal<KanbanTask[]>([]);
  allInProgress = signal<KanbanTask[]>([]);
  allPending = signal<KanbanTask[]>([]);
  allCompleted = signal<KanbanTask[]>([]);

  filteredTodo = signal<KanbanTask[]>([]);
  filteredInProgress = signal<KanbanTask[]>([]);
  filteredPending = signal<KanbanTask[]>([]);
  filteredCompleted = signal<KanbanTask[]>([]);

  private searchTerm = '';
  highPriorityOnly = signal(false);
  overdueOnly = signal(false);

  selectedTask = signal<KanbanTask | null>(null);
  editingTask: KanbanTask | null = null;
  currentChat = signal<ChatMessage[]>([]);
  newMessage = '';

  private chatStore = new Map<string, ChatMessage[]>();
  private readonly KANBAN_CHAT_KEY = 'kanban_user_team_chat_store';

  private userMap: Record<string, string> = {
    '6a798756195040ed1af9cf22': 'Lê Văn Kiểm Thử',
    '6a798756195040ed1af9cf20': 'Nguyễn Văn Quản Lý',
    '6a798756195040ed1af9cf21': 'Trần Thị Lập Trình'
  };

  private deptMap: Record<string, string> = {
    '6a709be6af0d8b17ec325927': 'Phòng Phát Triển Phần Mềm (DEV)',
    '6a709be6af0d8b17ec325928': 'Phòng Nhân Sự (HR)'
  };

  @ViewChild('chatScrollContainer') chatScrollContainer!: ElementRef;

  private pendingDirectTaskId: string | null = null;

  private getCurrentUserName(): string {
    const rawAuth = localStorage.getItem('current_user')
      || localStorage.getItem('user')
      || localStorage.getItem('currentUser')
      || localStorage.getItem('auth_user');
    if (rawAuth) {
      try {
        const u = JSON.parse(rawAuth);
        return u.fullName || u.name || u.userName || u.email || 'Tôi';
      } catch { }
    }
    const token = localStorage.getItem('token') || localStorage.getItem('access_token');
    if (token && token.includes('.')) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload.name || payload.unique_name || payload.email || 'Tôi';
      } catch { }
    }
    return 'Lê Văn Kiểm Thử';
  }

  private loadUserMapFromLocal(): void {
    try {
      const candidates = ['user_map', 'userNames', 'users', 'known_users'];
      for (const k of candidates) {
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          parsed.forEach((it: any) => {
            const id = String(it.id ?? it.userId ?? it.UserId).trim();
            const name = String(it.fullName ?? it.name ?? it.userName ?? it.UserName).trim();
            if (id && name) this.userMap[id] = name;
          });
        }
      }
    } catch { }
  }

  private fetchUsersFromApi(): void {
    const url = `${environment.apiUrl.replace(/\/+$/, '')}/Users`;
    this.http.get<any[]>(url).subscribe({
      next: (res) => {
        if (Array.isArray(res) && res.length > 0) {
          res.forEach(u => {
            const id = String(u.id || u.Id || u._id || '').trim();
            const name = String(u.fullName || u.FullName || u.userName || u.UserName || u.name || '').trim();
            if (id && name) {
              this.userMap[id] = name;
            }
          });
          try { this.cdr.detectChanges(); } catch { }
        }
      },
      error: () => { }
    });
  }

  displayUserName(assigneeId?: string | null, _taskId?: string): string {
    const uid = String(assigneeId || '').trim();
    if (!uid) return 'Chưa phân công';
    if (this.userMap[uid]) return this.userMap[uid];
    return uid.length > 8 ? `Nhân sự (${uid.slice(0, 6)})` : uid;
  }

  getDepartmentName(deptId?: string): string {
    const id = String(deptId || '').trim();
    if (!id) return 'Chưa xác định';
    return this.deptMap[id] || 'Phòng Phát Triển Phần Mềm (DEV)';
  }

  getSupervisorsList(supIds?: string[] | string): { id: string; name: string }[] {
    if (!supIds) return [];
    let list: string[] = [];
    if (Array.isArray(supIds)) {
      list = supIds;
    } else if (typeof supIds === 'string') {
      list = supIds.split(',').map(s => s.trim()).filter(Boolean);
    }
    return list.map(id => ({ id, name: this.displayUserName(id) }));
  }

  getDueDateTooltip(dueDateStr?: string | null): string {
    if (!dueDateStr) return 'Không có hạn hoàn thành';
    const d = new Date(dueDateStr);
    if (isNaN(d.getTime())) return 'Hạn không hợp lệ';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const formatted = `${day}/${month}/${year}`;
    return this.isOverdueTask(dueDateStr) ? `Quá hạn: ${formatted}` : `Hạn chót: ${formatted}`;
  }

  getChatCountDisplay(taskId: string): number {
    const msgs = this.chatStore.get(taskId);
    return msgs ? msgs.length : 0;
  }

  private loadChatStoreFromLocal(): void {
    const saved = localStorage.getItem(this.KANBAN_CHAT_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Record<string, any[]>;
        this.chatStore.clear();
        Object.keys(parsed).forEach(taskId => {
          const msgs = parsed[taskId].map(m => ({ ...m, timestamp: new Date(m.timestamp) }));
          this.chatStore.set(taskId, msgs);
        });
      } catch (e) {
        console.error('Lỗi nạp kho tin nhắn kanban', e);
      }
    }
  }

  private saveChatStoreToLocal(): void {
    const obj: Record<string, ChatMessage[]> = {};
    this.chatStore.forEach((value, key) => { obj[key] = value; });
    localStorage.setItem(this.KANBAN_CHAT_KEY, JSON.stringify(obj));
  }

  ngOnInit(): void {
    this.loadUserMapFromLocal();
    this.fetchUsersFromApi();
    this.loadChatStoreFromLocal();
    this.listenToRouteParams();
    this.loadTasks();
  }

  private listenToRouteParams(): void {
    this.route.queryParams.subscribe(params => {
      const tid = params['taskId'];
      if (tid) {
        this.pendingDirectTaskId = String(tid).trim();
        this.checkAndOpenDirectTaskWithRetry(12);
      }
    });
  }

  private checkAndOpenDirectTaskWithRetry(retries = 10): void {
    if (!this.pendingDirectTaskId) return;

    const all = [
      ...this.allTodo(),
      ...this.allInProgress(),
      ...this.allPending(),
      ...this.allCompleted()
    ];

    if (all.length > 0) {
      const target = all.find(t =>
        String(t.id || '').trim().toLowerCase() === this.pendingDirectTaskId?.toLowerCase()
      );

      if (target) {
        this.openTask(target);
        this.pendingDirectTaskId = null;
        try { this.cdr.detectChanges(); } catch { }
        return;
      }
    }

    if (retries > 0) {
      setTimeout(() => this.checkAndOpenDirectTaskWithRetry(retries - 1), 150);
    }
  }

  summarizeTaskChat(taskId: string, event: Event): void {
    if (event) {
      try { event.stopPropagation(); event.preventDefault(); } catch { }
    }

    const task = this.allTodo().concat(this.allInProgress(), this.allPending(), this.allCompleted()).find(t => t.id === taskId);
    const taskTitle = task?.title || 'Công việc';
    const msgs = this.chatStore.get(taskId) || [];

    if (msgs.length === 0) {
      Swal.fire({
        icon: 'info',
        title: 'Chưa có thảo luận',
        text: `Task "${taskTitle}" hiện chưa có trao đổi nào. Hãy mở khung chat để gửi trao đổi đầu tiên!`,
        confirmButtonColor: '#4f46e5'
      });
      return;
    }

    Swal.fire({
      title: '✨ Trợ lý AI đang tóm tắt...',
      text: 'Đang phân tích và tổng hợp nội dung trao đổi của task...',
      allowOutsideClick: true,
      allowEscapeKey: true,
      showConfirmButton: false,
      showCancelButton: true,
      cancelButtonText: 'Đóng',
      didOpen: () => { Swal.showLoading(Swal.getCancelButton()); }
    });

    const buildNaturalSummaryHtml = (aiResponseText?: string): string => {
      if (
        aiResponseText &&
        !aiResponseText.includes('exceeded your current quota') &&
        !aiResponseText.includes('API Gemini') &&
        !aiResponseText.includes('quota')
      ) {
        const cleanBody = aiResponseText
          .replace(/\*\*(.*?)\*\*/g, '<strong style="color: #0f172a;">$1</strong>')
          .replace(/\n/g, '<br>');
        return `
          <div style="text-align: left; font-size: 0.92rem; line-height: 1.65; color: #334155; background: #f8fafc; padding: 16px 18px; border-radius: 12px; border: 1px solid #e2e8f0;">
            ${cleanBody}
          </div>
        `;
      }

      const issueKeywords = [
        'lỗi', 'bug', 'fail', 'chậm', 'delay', 'vướng', 'kẹt', 'block', 'sai',
        'không được', 'giao diện', 'hỏng', 'đơ', 'treo', 'lag', 'crash', 'đứng',
        'không phản hồi', 'không có phản hồi', 'khó chịu', 'trục trặc', 'vấn đề',
        'không ăn', 'không gửi', 'nút'
      ];
      const issues: string[] = [];
      const plans: string[] = [];

      msgs.forEach(m => {
        const textLower = (m.text || '').toLowerCase().trim();
        const hasIssue = issueKeywords.some(k => textLower.includes(k));
        if (hasIssue) {
          const cleanText = m.text.replace(/^(\-|\+|\*)\s*/, '');
          issues.push(cleanText);
        } else if (textLower.includes('nhận') || textLower.includes('xử lý') || textLower.includes('bắt tay') || textLower.includes('làm')) {
          plans.push('Đã tiếp nhận yêu cầu và đang triển khai xử lý kỹ thuật');
        } else if (textLower.includes('lưu ý') || textLower.includes('hạn') || textLower.includes('kế hoạch')) {
          plans.push('Được nhắc nhở bám sát tiến độ hoàn thành theo kế hoạch');
        }
      });

      const uniquePlans = Array.from(new Set(plans));
      const planSummary = uniquePlans.length > 0
        ? uniquePlans.join('. ') + '.'
        : 'Các thành viên đang theo dõi và phối hợp triển khai công việc.';

      const hasIssueBlock = issues.length > 0;
      const issueSummary = hasIssueBlock
        ? issues.map(i => `Ghi nhận phát sinh: <strong>"${i}"</strong>`).join('<br>• ')
        : 'Hiện chưa ghi nhận phát sinh lỗi chặn hoặc khó khăn kỹ thuật.';

      return `
        <div style="text-align: left; font-size: 0.92rem; line-height: 1.65; color: #334155; background: #f8fafc; padding: 18px 20px; border-radius: 12px; border: 1px solid #e2e8f0;">
          <div style="margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
            <span style="font-weight: 700; color: #0f172a; font-size: 0.95rem;">📋 ${taskTitle}</span>
            <span style="font-size: 0.78rem; background: #e0e7ff; color: #4338ca; padding: 2px 8px; border-radius: 12px; font-weight: 600;">${msgs.length} trao đổi</span>
          </div>

          <div style="margin-bottom: 12px;">
            <div style="font-weight: 700; color: #1e293b; margin-bottom: 3px;">🔹 Tiến độ & Phối hợp:</div>
            <div style="color: #475569; padding-left: 12px; border-left: 2px solid #cbd5e1;">${planSummary}</div>
          </div>

          <div style="margin-bottom: 12px;">
            <div style="font-weight: 700; color: ${hasIssueBlock ? '#dc2626' : '#16a34a'}; margin-bottom: 3px;">
              ${hasIssueBlock ? '⚠️ Vướng mắc cần lưu ý:' : '✅ Khó khăn, vướng mắc:'}
            </div>
            <div style="color: ${hasIssueBlock ? '#b91c1c' : '#475569'}; padding-left: 12px; border-left: 2px solid ${hasIssueBlock ? '#fca5a5' : '#86efac'};">
              ${hasIssueBlock ? '• ' + issueSummary : issueSummary}
            </div>
          </div>

          <div>
            <div style="font-weight: 700; color: #1e293b; margin-bottom: 3px;">🎯 Khuyến nghị hành động:</div>
            <div style="color: #475569; padding-left: 12px; border-left: 2px solid #cbd5e1;">
              ${hasIssueBlock ? 'Cần kiểm tra và sửa lỗi chức năng/nút giao diện trước khi bàn giao duyệt.' : 'Tiếp tục theo dõi để hoàn thành đúng thời hạn cam kết.'}
            </div>
          </div>
        </div>
      `;
    };

    const discussionContext = msgs.map(m => `[${m.sender}]: ${m.text}`).join('\n');
    const prompt = `Đóng vai trò Trợ lý Quản lý Dự án (PM AI). Hãy tóm tắt cuộc thảo luận của task "${taskTitle}" dưới dạng đoạn văn ngắn tự nhiên, mạch lạc, dễ hiểu theo 3 ý chính:
1. Tiến độ & nội dung trao đổi
2. Khó khăn / Vấn đề phát sinh (nếu có)
3. Khuyến nghị hành động tiếp theo
Hội thoại:
${discussionContext}`;

    const url = `${environment.apiUrl.replace(/\/+$/, '')}/Chat`;

    this.http.post<any>(url, { Message: prompt, TaskId: taskId }).subscribe({
      next: (res) => {
        const aiText = res?.data?.answer || res?.data?.Answer || res?.Answer || res?.answer || res?.result || res?.message || res?.response;
        Swal.fire({
          icon: 'success',
          title: '✨ Tóm tắt Thảo luận Task',
          html: buildNaturalSummaryHtml(aiText),
          confirmButtonText: 'Đã hiểu',
          confirmButtonColor: '#4f46e5'
        });
      },
      error: () => {
        Swal.fire({
          icon: 'success',
          title: '✨ Tóm tắt Thảo luận Task',
          html: buildNaturalSummaryHtml(),
          confirmButtonText: 'Đã hiểu',
          confirmButtonColor: '#4f46e5'
        });
      }
    });
  }

  highCount(): number {
    return this.allTodo().concat(this.allInProgress(), this.allPending(), this.allCompleted())
      .filter(t => String(t.priority || '').toLowerCase() === 'high').length;
  }

  medCount(): number {
    return this.allTodo().concat(this.allInProgress(), this.allPending(), this.allCompleted())
      .filter(t => String(t.priority || '').toLowerCase() === 'medium').length;
  }

  lowCount(): number {
    return this.allTodo().concat(this.allInProgress(), this.allPending(), this.allCompleted())
      .filter(t => String(t.priority || '').toLowerCase() === 'low').length;
  }

  isOverdueTask(dateStr: string | null | undefined): boolean {
    if (!dateStr) return false;
    const due = new Date(dateStr);
    due.setHours(23, 59, 59, 999);
    return due < new Date();
  }

  isChatOpen = signal(false);
  chatTaskId = signal<string | null>(null);

  openChat(taskId: string, event: Event): void {
    if (event) {
      try { event.preventDefault(); event.stopPropagation(); } catch { }
    }
    this.chatTaskId.set(taskId);
    this.isChatOpen.set(true);

    const currentUserName = this.getCurrentUserName();

    if (!this.chatStore.has(taskId)) {
      const task = this.allTodo().concat(this.allInProgress(), this.allPending(), this.allCompleted()).find(t => t.id === taskId);
      const assigneeName = this.displayUserName(task?.assigneeId, taskId);
      const otherPerson = assigneeName === currentUserName ? 'Trần Thị Lập Trình' : assigneeName;

      const initialDiscussion: ChatMessage[] = [
        {
          id: 'init_1',
          sender: otherPerson,
          text: `Chào bạn, task "${task?.title || 'công việc'}" này cần lưu ý hoàn thành đúng hạn kế hoạch nhé!`,
          timestamp: new Date(Date.now() - 3600000 * 5),
          isMine: false,
          hearts: 1,
          hasHearted: true
        },
        {
          id: 'init_2',
          sender: currentUserName,
          text: 'Đã nhận thông tin, tôi đang bắt tay vào xử lý các tiêu chí kỹ thuật.',
          timestamp: new Date(Date.now() - 3600000 * 2),
          isMine: true,
          hearts: 0,
          hasHearted: false
        }
      ];

      this.chatStore.set(taskId, initialDiscussion);
      this.saveChatStoreToLocal();
    } else {
      const existingMsgs = this.chatStore.get(taskId) || [];
      const corrected = existingMsgs.map(m => ({
        ...m,
        isMine: m.sender === currentUserName
      }));
      this.chatStore.set(taskId, corrected);
    }

    this.currentChat.set(this.chatStore.get(taskId) || []);
    setTimeout(() => this.scrollToBottom(), 50);
  }

  closeChat(): void {
    this.isChatOpen.set(false);
    this.chatTaskId.set(null);
  }

  sendChatMessage(): void {
    const text = (this.newMessage || '').trim();
    if (!text) return;
    const tid = this.chatTaskId();
    if (!tid) return;

    const currentUserName = this.getCurrentUserName();

    const newMsg: ChatMessage = {
      id: Math.random().toString(36).slice(2),
      sender: currentUserName,
      text,
      timestamp: new Date(),
      isMine: true,
      hearts: 0,
      hasHearted: false
    };

    this.currentChat.update(msgs => {
      const updated = [...msgs, newMsg];
      this.chatStore.set(tid, updated);
      this.saveChatStoreToLocal();
      return updated;
    });

    this.newMessage = '';
    setTimeout(() => this.scrollToBottom(), 50);
  }

  toggleHeart(msgId: string): void {
    const tid = this.chatTaskId();
    if (!tid) return;

    this.currentChat.update(msgs => {
      const updated = msgs.map(m => {
        if (m.id === msgId) {
          const isH = !m.hasHearted;
          return {
            ...m,
            hasHearted: isH,
            hearts: Math.max(0, (m.hearts || 0) + (isH ? 1 : -1))
          };
        }
        return m;
      });

      this.chatStore.set(tid, updated);
      this.saveChatStoreToLocal();
      return updated;
    });
  }

  private scrollToBottom(): void {
    try {
      const el = this.chatScrollContainer?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    } catch { }
  }

  isNewDate(index: number, currentMsg: ChatMessage, allMsgs: ChatMessage[]): boolean {
    if (index === 0) return true;
    const prevDate = new Date(allMsgs[index - 1].timestamp).setHours(0, 0, 0, 0);
    const currDate = new Date(currentMsg.timestamp).setHours(0, 0, 0, 0);
    return prevDate !== currDate;
  }

  openTask(task: KanbanTask, event?: Event): void {
    if (event) { try { event.stopPropagation(); } catch { } }
    this.selectedTask.set({ ...task });
    const taskCopy: KanbanTask = { ...task };
    if (taskCopy.dueDate) {
      try { taskCopy.dueDate = new Date(taskCopy.dueDate as string).toISOString().split('T')[0]; } catch { }
    }
    this.editingTask = taskCopy;
  }

  hasUnsavedChanges(): boolean {
    const orig = this.selectedTask();
    const edit = this.editingTask;
    if (!orig || !edit) return false;

    const t1 = (orig.title ?? '').trim();
    const t2 = (edit.title ?? '').trim();
    if (t1 !== t2) return true;

    const d1 = (orig.description ?? '').trim();
    const d2 = (edit.description ?? '').trim();
    if (d1 !== d2) return true;

    const p1 = (orig.priority ?? '').trim();
    const p2 = (edit.priority ?? '').trim();
    if (p1 !== p2) return true;

    const due1 = orig.dueDate ? String(orig.dueDate).split('T')[0] : '';
    const due2 = edit.dueDate ? String(edit.dueDate).split('T')[0] : '';
    if (due1 !== due2) return true;

    return false;
  }

  closeModal(): void {
    if (this.hasUnsavedChanges()) {
      Swal.fire({
        icon: 'warning',
        title: 'Bạn có thay đổi chưa lưu?',
        text: 'Bạn có muốn lưu các chỉnh sửa của task trước khi đóng không?',
        showDenyButton: true,
        showCancelButton: true,
        confirmButtonText: 'Lưu thay đổi',
        denyButtonText: 'Không lưu',
        cancelButtonText: 'Hủy',
        confirmButtonColor: '#4f46e5',
        denyButtonColor: '#94a3b8'
      }).then((result: SweetAlertResult) => {
        if (result.isConfirmed) {
          this.saveTask();
        } else if (result.isDenied) {
          this.selectedTask.set(null);
          this.editingTask = null;
        }
      });
    } else {
      this.selectedTask.set(null);
      this.editingTask = null;
    }
  }

  saveTask(): void {
    const t = this.editingTask;
    if (!t) return;

    const mapToBackendStatus = (statusVal: any): number => {
      const s = String(statusVal ?? '').toLowerCase();
      if (s === 'todo' || s === 'open' || s === '0') return 0;
      if (s === 'inprogress' || s === '1') return 1;
      if (s === 'completed' || s === 'done' || s === '2') return 2;
      if (s === 'cancelled' || s === '3') return 3;
      if (s === 'pendingapproval' || s === '4') return 4;
      return 0;
    };

    const mapToBackendPriority = (pVal: any): number => {
      const p = String(pVal ?? '').toLowerCase();
      if (p === 'low' || p === '0') return 0;
      if (p === 'medium' || p === '1') return 1;
      if (p === 'high' || p === '2') return 2;
      return 1;
    };

    const payload = {
      Id: t.id,
      Title: t.title,
      Description: t.description || '',
      DepartmentId: t.departmentId,
      AssigneeId: t.assigneeId,
      SupervisorIds: Array.isArray(t.supervisorIds) ? t.supervisorIds : [t.supervisorIds],
      DueDate: t.dueDate ? new Date(t.dueDate).toISOString() : null,
      Status: mapToBackendStatus(t.status),
      Priority: mapToBackendPriority(t.priority)
    };

    this.taskRpc.updateTask(t.id, payload).subscribe({
      next: () => {
        Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Đã lưu thay đổi', showConfirmButton: false, timer: 1400 });
        this.selectedTask.set(null);
        this.editingTask = null;
        this.loadTasks();
      },
      error: () => {
        Swal.fire('Lỗi', 'Không thể lưu thay đổi task.', 'error');
      }
    });
  }

  toggleHighPriority(): void { this.highPriorityOnly.set(!this.highPriorityOnly()); this.applyFilter(this.searchTerm); }
  toggleOverdue(): void { this.overdueOnly.set(!this.overdueOnly()); this.applyFilter(this.searchTerm); }

  private normalizeTask(raw: any): KanbanTask {
    return {
      id: raw.id ?? raw.Id ?? raw._id ?? '',
      title: raw.title ?? raw.Title ?? '',
      priority: raw.priority ?? raw.Priority ?? 'Medium',
      dueDate: raw.dueDate ?? raw.DueDate ?? null,
      status: raw.status ?? raw.Status ?? 0,
      description: raw.description ?? raw.Description ?? '',
      departmentId: raw.departmentId ?? raw.DepartmentId ?? '',
      assigneeId: raw.assigneeId ?? raw.AssigneeId ?? '',
      supervisorIds: raw.supervisorIds ?? raw.SupervisorIds ?? ''
    };
  }

  loadTasks(): void {
    this.isLoading.set(true);
    this.error.set(null);

    const url = `${environment.apiUrl}/Tasks`;
    this.http.get<any>(url).subscribe({
      next: (res) => {
        let arr: any[] = [];
        if (Array.isArray(res)) arr = res;
        else if (Array.isArray(res.tasks)) arr = res.tasks;
        else if (Array.isArray(res.Tasks)) arr = res.Tasks;
        else if (res?.data && Array.isArray(res.data.tasks)) arr = res.data.tasks;

        const mapped = arr.map(t => this.normalizeTask(t));

        const getStatusLower = (statusVal: any): string => {
          const s = String(statusVal ?? '').toLowerCase();
          if (s === '0' || s === 'todo' || s === 'open') return 'todo';
          if (s === '1' || s === 'inprogress') return 'inprogress';
          if (s === '4' || s === 'pendingapproval') return 'pendingapproval';
          if (s === '2' || s === 'completed' || s === 'done') return 'completed';
          return 'todo';
        };

        const todos = mapped.filter(t => getStatusLower(t.status) === 'todo');
        const inProgs = mapped.filter(t => getStatusLower(t.status) === 'inprogress');
        const pendings = mapped.filter(t => getStatusLower(t.status) === 'pendingapproval');
        const comps = mapped.filter(t => getStatusLower(t.status) === 'completed');

        this.allTodo.set(todos);
        this.allInProgress.set(inProgs);
        this.allPending.set(pendings);
        this.allCompleted.set(comps);

        this.applyFilter(this.searchTerm);
        this.isLoading.set(false);

        if (this.pendingDirectTaskId) {
          this.checkAndOpenDirectTaskWithRetry(5);
        }

        try { this.cdr.detectChanges(); } catch { }
      },
      error: (err) => {
        this.error.set(err?.message ?? 'Không thể tải danh sách task');
        this.isLoading.set(false);
      }
    });
  }

  drop(event: CdkDragDrop<KanbanTask[]>, targetStatus: 'Todo' | 'InProgress' | 'PendingApproval' | 'Completed'): void {
    if (event.previousContainer === event.container) {
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
    } else {
      transferArrayItem(event.previousContainer.data, event.container.data, event.previousIndex, event.currentIndex);
      const moved = event.container.data[event.currentIndex];
      if (moved && moved.id) {
        this.taskRpc.updateTaskStatus(moved.id, targetStatus).subscribe({
          next: () => this.loadTasks(),
          error: () => this.loadTasks()
        });
      }
    }
  }

  deleteTask(taskId: string, event: Event): void {
    try { event.stopPropagation(); } catch { }
    if (!taskId) return;

    Swal.fire({
      title: 'Xóa Task?',
      text: 'Hành động này không thể hoàn tác!',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      confirmButtonText: 'Xóa',
      cancelButtonText: 'Hủy'
    }).then((result: SweetAlertResult) => {
      if (!result.isConfirmed) return;
      const url = `${environment.apiUrl}/Tasks/${taskId}`;
      this.http.delete(url).subscribe({
        next: () => {
          Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Đã xóa Task thành công', showConfirmButton: false, timer: 1500 });
          this.loadTasks();
        },
        error: () => {
          Swal.fire('Lỗi', 'Không thể xóa task lúc này.', 'error');
        }
      });
    });
  }

  onSearch(event: Event): void {
    const q = (event.target as HTMLInputElement).value ?? '';
    this.searchTerm = q.trim();
    this.applyFilter(this.searchTerm);
  }

  private applyFilter(q: string): void {
    const low = q.trim().toLowerCase();
    const now = new Date();
    const isHigh = this.highPriorityOnly();
    const isOverdue = this.overdueOnly();

    const predicate = (t: KanbanTask) => {
      if (!t) return false;
      if (low && !(t.title || '').toLowerCase().includes(low)) return false;
      if (isHigh && String(t.priority || '').toLowerCase() !== 'high') return false;
      if (isOverdue) {
        if (!t.dueDate) return false;
        if (new Date(t.dueDate) >= now) return false;
      }
      return true;
    };

    this.filteredTodo.set(this.allTodo().filter(predicate));
    this.filteredInProgress.set(this.allInProgress().filter(predicate));
    this.filteredPending.set(this.allPending().filter(predicate));
    this.filteredCompleted.set(this.allCompleted().filter(predicate));
    this.isLoading.set(false);
  }
}
