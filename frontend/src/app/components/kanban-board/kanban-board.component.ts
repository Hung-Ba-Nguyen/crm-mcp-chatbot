import { Component, OnInit, inject, signal, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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
  status?: string;
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

  isLoading = signal(true);
  error = signal<string | null>(null);

  allTodo = signal<KanbanTask[]>([]);
  allInProgress = signal<KanbanTask[]>([]);
  allCompleted = signal<KanbanTask[]>([]);

  filteredTodo = signal<KanbanTask[]>([]);
  filteredInProgress = signal<KanbanTask[]>([]);
  filteredCompleted = signal<KanbanTask[]>([]);

  private searchTerm = '';
  highPriorityOnly = signal(false);
  overdueOnly = signal(false);

  selectedTask = signal<KanbanTask | null>(null);
  editingTask: KanbanTask | null = null;
  currentChat = signal<ChatMessage[]>([]);
  newMessage = signal('');
  private chatStore = new Map<string, ChatMessage[]>();

  private userMap: Record<string, string> = {
    '64b8d5f1e1a3f5a0c2d9b7a1': 'Nguyễn Bá Hùng',
    '64b8d5f1e1a3f5a0c2d9b7a2': 'Duy Linh',
    '64b8d5f1e1a3f5a0c2d9b7a3': 'Trần Thị Lập Trình',
    '64b8d5f1e1a3f5a0c2d9b7a4': 'Lê Văn Kiểm Thử',
    '64b8d5f1e1a3f5a0c2d9b7a5': 'Nguyễn Văn Quản Lý'
  };

  private deptMap: Record<string, string> = {
    '6a709be6af0d8b17ec325927': 'Phòng Phát Triển Phần Mềm (DEV)',
    '6a709be6af0d8b17ec325928': 'Phòng Nhân Sự (HR)'
  };

  @ViewChild('chatScrollContainer') chatScrollContainer!: ElementRef;

  private loadUserMapFromLocal(): void {
    try {
      const candidates = ['user_map', 'userNames', 'users', 'known_users'];
      for (const k of candidates) {
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw);
          if (!parsed) continue;
          if (Array.isArray(parsed)) {
            parsed.forEach((it: any) => {
              if (it && (it.id || it.userId || it.UserId) && (it.name || it.userName || it.UserName)) {
                const id = String(it.id ?? it.userId ?? it.UserId).trim();
                const name = String(it.name ?? it.userName ?? it.UserName).trim();
                if (id && name) this.userMap[id] = name;
              }
            });
            return;
          }
          if (typeof parsed === 'object') {
            Object.keys(parsed).forEach(k2 => {
              const val = String((parsed as any)[k2]).trim();
              if (k2 && val) this.userMap[k2.trim()] = val;
            });
            return;
          }
        } catch { }
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
          try {
            this.cdr.markForCheck();
            this.cdr.detectChanges();
          } catch { }
        }
      },
      error: () => { }
    });
  }

  displayUserName(assigneeId?: string | null, taskId?: string): string {
    const uid = String(assigneeId || '').trim();
    if (!uid) return 'Chưa phân công';

    if (this.userMap[uid]) {
      return this.userMap[uid];
    }

    return uid.length > 8 ? `Nhân sự (${uid.slice(0, 6)})` : uid;
  }

  getDepartmentName(deptId?: string): string {
    const id = String(deptId || '').trim();
    if (!id) return 'Chưa xác định';
    return this.deptMap[id] || 'Phòng ban chuyên môn';
  }

  getSupervisorsList(supIds?: string[] | string): { id: string; name: string }[] {
    if (!supIds) return [];
    let list: string[] = [];
    if (Array.isArray(supIds)) {
      list = supIds;
    } else if (typeof supIds === 'string') {
      list = supIds.split(',').map(s => s.trim()).filter(Boolean);
    }
    return list.map(id => ({
      id,
      name: this.displayUserName(id)
    }));
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

  private loadChatStoreFromLocal(): void {
    const saved = localStorage.getItem('kanban_chat_store');
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Record<string, any[]>;
        this.chatStore.clear();
        Object.keys(parsed).forEach(taskId => {
          const msgs = parsed[taskId].map(m => ({ ...m, timestamp: new Date(m.timestamp) }));
          this.chatStore.set(taskId, msgs);
        });
      } catch (e) { console.error('Lỗi parse chat store', e); }
    }
  }

  private saveChatStoreToLocal(): void {
    const obj: Record<string, ChatMessage[]> = {};
    this.chatStore.forEach((value, key) => { obj[key] = value; });
    localStorage.setItem('kanban_chat_store', JSON.stringify(obj));
  }

  getChatCountDisplay(taskId: string): string {
    const msgs = this.chatStore.get(taskId);
    const count = msgs ? msgs.length : 0;
    if (count > 20) return '20+';
    if (count > 10) return '10+';
    return count.toString();
  }

  ngOnInit(): void {
    this.loadUserMapFromLocal();
    this.fetchUsersFromApi();
    this.loadChatStoreFromLocal();
    this.loadTasks();
  }

  summarizeTaskChat(taskId: string, event: Event) {
    if (event) { try { event.stopPropagation(); event.preventDefault(); } catch { } }

    const msgs = this.chatStore.get(taskId) || [];
    if (msgs.length === 0) {
      Swal.fire({ icon: 'info', title: 'Thông báo', text: 'Chưa có dữ liệu thảo luận để tóm tắt!' });
      return;
    }

    const chatContext = msgs.map(m => `[${m.sender}]: ${m.text}`).join('\n');
    const prompt = `Hãy đọc đoạn hội thoại sau của nhóm làm việc và tóm tắt lại ngắn gọn theo 3 ý: Tiến độ, Nội dung chính, và Vướng mắc (nếu có):\n\n${chatContext}`;

    const url = `${environment.apiUrl.replace(/\/+$/, '')}/chat`;
    const requestBody = { Message: prompt, TaskId: taskId };

    // Khởi tạo request và lưu subscription
    const sub = this.http.post<any>(url, requestBody).subscribe({
      next: (res) => {
        let aiText = res?.data?.answer || res?.data?.Answer
          || res?.Answer || res?.answer
          || res?.result || res?.message || res?.content;

        if (!aiText) {
          aiText = typeof res === 'string' ? res : JSON.stringify(res, null, 2);
        }

        if (aiText === '{}') aiText = 'API Backend đang trả về dữ liệu rỗng!';

        const cleanHtml = aiText
          .replace(/\*\*(.*?)\*\*/g, '<strong style="color: #0f172a;">$1</strong>')
          .replace(/\n/g, '<br>');

        const formattedHtml = `<div style="text-align: left; font-size: 0.95rem; line-height: 1.6; color: #475569; background: #f8fafc; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0;">${cleanHtml}</div>`;

        Swal.fire({
          icon: 'success',
          title: '✨ Tóm tắt Ngữ cảnh Task',
          html: formattedHtml,
          showCloseButton: true,
          confirmButtonText: 'Đã hiểu',
          confirmButtonColor: '#6366f1'
        });
      },
      error: (err) => {
        if (!sub.closed) {
          console.error('Lỗi API Chat:', err);
          Swal.fire({ icon: 'error', title: 'Lỗi', text: 'Không thể kết nối đến AI Server để tóm tắt.' });
        }
      }
    });

    // Modal hiển thị loading với Dấu X và Nút Hủy
    Swal.fire({
      title: '✨ AI đang phân tích...',
      text: `Đang tổng hợp ${msgs.length} tin nhắn trao đổi...`,
      allowOutsideClick: true,
      allowEscapeKey: true,
      showCloseButton: true,
      showConfirmButton: false,
      showCancelButton: true,
      cancelButtonText: 'Hủy thao tác',
      cancelButtonColor: '#94a3b8',
      didOpen: () => {
        Swal.showLoading(Swal.getCancelButton());
      }
    }).then((result) => {
      if (result.dismiss) {
        sub.unsubscribe();
      }
    });
  }

  highCount(): number {
    return this.allTodo().concat(this.allInProgress(), this.allCompleted())
      .filter(t => ((t.priority || '') as string).toLowerCase() === 'high').length;
  }

  medCount(): number {
    return this.allTodo().concat(this.allInProgress(), this.allCompleted())
      .filter(t => ((t.priority || '') as string).toLowerCase() === 'medium').length;
  }

  lowCount(): number {
    return this.allTodo().concat(this.allInProgress(), this.allCompleted())
      .filter(t => ((t.priority || '') as string).toLowerCase() === 'low').length;
  }

  isOverdueTask(dateStr: string | null | undefined): boolean {
    if (!dateStr) return false;
    const due = new Date(dateStr);
    due.setHours(23, 59, 59, 999);
    return due < new Date();
  }

  isChatOpen = signal(false);
  chatTaskId = signal<string | null>(null);

  openChat(taskId: string, event: Event) {
    if (event) {
      try { event.preventDefault(); } catch { }
      try { event.stopPropagation(); } catch { }
    }
    this.chatTaskId.set(taskId);
    this.isChatOpen.set(true);

    if (this.chatStore.has(taskId)) {
      this.currentChat.set(this.chatStore.get(taskId)!);
    } else {
      const currentTask = this.allTodo().concat(this.allInProgress(), this.allCompleted()).find(t => t.id === taskId);
      const assignedPerson = this.displayUserName(currentTask?.assigneeId, taskId);
      const otherPerson = assignedPerson === 'Nguyễn Bá Hùng' ? 'Duy Linh' : 'Nguyễn Bá Hùng';

      const mockChat: ChatMessage[] = [
        { id: '1', sender: 'Hệ thống', text: 'Đã tạo task mới', timestamp: new Date(Date.now() - 86400000 * 2), isMine: false },
        { id: '2', sender: otherPerson, text: 'Task này cần ưu tiên hoàn thành sớm nhé!', timestamp: new Date(Date.now() - 86400000), isMine: false, hearts: 1, hasHearted: true },
        { id: '3', sender: assignedPerson, text: 'Đã nhận task và đang triển khai.', timestamp: new Date(Date.now() - 10000), isMine: true }
      ];
      this.chatStore.set(taskId, mockChat);
      this.currentChat.set(mockChat);
      this.saveChatStoreToLocal();
    }

    setTimeout(() => this.scrollToBottom(), 50);
  }

  closeChat() {
    this.isChatOpen.set(false);
    this.chatTaskId.set(null);
  }

  sendChatMessage() {
    const text = String(this.newMessage()).trim();
    if (!text) return;
    const newMsg: ChatMessage = {
      id: Math.random().toString(36).slice(2),
      sender: 'Nguyễn Bá Hùng',
      text,
      timestamp: new Date(),
      isMine: true
    };
    this.currentChat.update(msgs => {
      const updated = [...msgs, newMsg];
      const tid = this.chatTaskId();
      if (tid) {
        this.chatStore.set(tid, updated);
        this.saveChatStoreToLocal();
      }
      return updated;
    });
    this.newMessage.set('');
    setTimeout(() => this.scrollToBottom(), 50);
  }

  private scrollToBottom(): void {
    try {
      const el = this.chatScrollContainer?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    } catch (err) { }
  }

  toggleHeart(msgId: string) {
    this.currentChat.update(msgs => {
      const updated = msgs.map(m => {
        if (m.id === msgId) {
          const isH = !m.hasHearted;
          return { ...m, hasHearted: isH, hearts: (m.hearts || 0) + (isH ? 1 : -1) };
        }
        return m;
      });
      const tid = this.chatTaskId();
      if (tid) {
        this.chatStore.set(tid, updated);
        this.saveChatStoreToLocal();
      }
      return updated;
    });
  }

  isNewDate(index: number, currentMsg: ChatMessage, allMsgs: ChatMessage[]): boolean {
    if (index === 0) return true;
    const prevDate = new Date(allMsgs[index - 1].timestamp);
    prevDate.setHours(0, 0, 0, 0);
    const currDate = new Date(currentMsg.timestamp);
    currDate.setHours(0, 0, 0, 0);
    return prevDate.getTime() !== currDate.getTime();
  }

  openTask(task: KanbanTask, event?: Event): void {
    if (event) {
      try { event.stopPropagation(); } catch { }
    }
    this.selectedTask.set({ ...task });

    const taskCopy: KanbanTask = { ...task };
    if (taskCopy.dueDate) {
      try {
        taskCopy.dueDate = new Date(taskCopy.dueDate as string).toISOString().split('T')[0];
      } catch (e) { }
    }
    this.editingTask = taskCopy;
  }

  hasUnsavedChanges(): boolean {
    const orig = this.selectedTask();
    const edit = this.editingTask;
    if (!orig || !edit) return false;

    const t1 = orig.title ?? '';
    const t2 = edit.title ?? '';
    if (t1 !== t2) return true;

    const d1 = orig.description ?? '';
    const d2 = edit.description ?? '';
    if (d1 !== d2) return true;

    const p1 = orig.priority ?? '';
    const p2 = edit.priority ?? '';
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
        showDenyButton: true,
        showCancelButton: true,
        confirmButtonText: 'Lưu thay đổi',
        denyButtonText: 'Không lưu',
        cancelButtonText: 'Hủy'
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

    const url = `${environment.apiUrl.replace(/\/+$/, '')}/Tasks/${t.id}`;
    this.http.get<any>(url).subscribe({
      next: (orig) => {
        const normalizeSupervisor = (val: any): string[] => {
          if (!val) return [];
          if (Array.isArray(val)) return val.filter((s: any) => typeof s === 'string');
          if (typeof val === 'string') return val.split(',').map(s => s.trim()).filter(s => s.length > 0);
          return [];
        };

        const normalizeId = (val: any, fallback: any): string | null => {
          const v = val ?? fallback ?? null;
          if (v == null) return null;
          if (typeof v === 'string') {
            const trimmed = v.trim();
            return trimmed === '' ? null : trimmed;
          }
          return v;
        };

        const supervisorIds = normalizeSupervisor(t.supervisorIds ?? orig.supervisorIds ?? orig.SupervisorIds);
        const assigneeId = normalizeId(t.assigneeId, orig.assigneeId ?? orig.AssigneeId);
        const departmentId = normalizeId(t.departmentId, orig.departmentId ?? orig.DepartmentId);

        const mapToBackendStatus = (statusVal: any): number => {
          const s = String(statusVal ?? '').toLowerCase();
          if (statusVal === 0 || s === '0' || s === 'todo' || s === 'open') return 0;
          if (statusVal === 1 || s === '1' || s === 'inprogress') return 1;
          if (statusVal === 2 || s === '2' || s === 'completed' || s === 'done') return 2;
          if (statusVal === 3 || s === '3' || s === 'cancelled') return 3;
          return 0;
        };

        const statusToSend = mapToBackendStatus(t.status ?? orig.status ?? orig.Status);

        const mapToBackendPriority = (pVal: any): number => {
          const p = String(pVal ?? '').toLowerCase();
          if (pVal === 0 || p === '0' || p === 'low') return 0;
          if (pVal === 1 || p === '1' || p === 'medium') return 1;
          if (pVal === 2 || p === '2' || p === 'high') return 2;
          return 1;
        };

        const priorityToSend = mapToBackendPriority(t.priority ?? orig.priority ?? orig.Priority);
        const dueDateIso = t.dueDate ? new Date(t.dueDate).toISOString() : (orig.dueDate ?? orig.DueDate ?? null);
        const payload = {
          Id: t.id,
          Title: t.title ?? orig.title ?? orig.Title,
          Description: t.description ?? orig.description ?? orig.Description ?? '',
          DepartmentId: departmentId,
          AssigneeId: assigneeId,
          SupervisorIds: supervisorIds,
          DueDate: dueDateIso,
          Status: statusToSend,
          Priority: priorityToSend
        };

        this.taskRpc.updateTask(t.id, payload).subscribe({
          next: () => {
            Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Đã lưu thay đổi', showConfirmButton: false, timer: 1400 });
            this.selectedTask.set({ ...this.editingTask } as KanbanTask);
            this.closeModal();
            this.loadTasks();
          },
          error: (err: any) => {
            console.error('Lỗi khi lưu task:', err);
            let errorMsg = err?.error?.title || err?.message || 'Không thể lưu task.';
            if (err?.error?.errors) {
              const detailedErrors = Object.entries(err.error.errors)
                .map(([field, msgs]: [string, any]) => {
                  const list = Array.isArray(msgs) ? msgs.join(', ') : String(msgs);
                  return `- ${field}: ${list}`;
                })
                .join('\n');
              errorMsg += '\n\nChi tiết:\n' + detailedErrors;
            }
            Swal.fire({
              title: 'Lỗi Dữ Liệu',
              text: errorMsg,
              icon: 'error',
              customClass: { popup: 'swal-wide' }
            });
          }
        });
      },
      error: () => {
        Swal.fire('Lỗi', 'Không thể nạp dữ liệu task gốc.', 'error');
      }
    });
  }

  toggleHighPriority(): void { this.highPriorityOnly.set(!this.highPriorityOnly()); this.applyFilter(this.searchTerm); }
  toggleOverdue(): void { this.overdueOnly.set(!this.overdueOnly()); this.applyFilter(this.searchTerm); }

  private normalizeTask(raw: any): KanbanTask {
    return {
      id: raw.id ?? raw.Id ?? raw._id ?? '',
      title: raw.title ?? raw.Title ?? '',
      priority: raw.priority ?? raw.Priority ?? '',
      dueDate: raw.dueDate ?? raw.DueDate ?? null,
      status: raw.status ?? raw.Status ?? 0,
      description: raw.description ?? raw.Description ?? '',
      departmentId: raw.departmentId ?? raw.DepartmentId ?? '',
      assigneeId: raw.assigneeId ?? raw.AssigneeId ?? raw.assignee ?? '',
      supervisorIds: raw.supervisorIds ?? raw.SupervisorIds ?? raw.supervisors ?? ''
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
        else if (res && res.data && Array.isArray(res.data.tasks)) arr = res.data.tasks;

        const mapped = arr.map(t => this.normalizeTask(t));

        let storeChanged = false;
        mapped.forEach(t => {
          if (!this.chatStore.has(t.id)) {
            const assignedPerson = this.displayUserName(t.assigneeId, t.id);
            const otherPerson = assignedPerson === 'Nguyễn Bá Hùng' ? 'Duy Linh' : 'Nguyễn Bá Hùng';
            const mockChat: ChatMessage[] = [
              { id: '1', sender: 'Hệ thống', text: 'Đã tạo task mới', timestamp: new Date(Date.now() - 86400000 * 2), isMine: false },
              { id: '2', sender: otherPerson, text: 'Task này cần ưu tiên hoàn thành sớm nhé!', timestamp: new Date(Date.now() - 86400000), isMine: false, hearts: 1, hasHearted: true },
              { id: '3', sender: assignedPerson, text: 'Đã nhận task và đang xử lý.', timestamp: new Date(Date.now() - 10000), isMine: true }
            ];
            this.chatStore.set(t.id, mockChat);
            storeChanged = true;
          }
        });
        if (storeChanged) this.saveChatStoreToLocal();

        const getStatusLower = (statusVal: any): string => {
          if (statusVal === 0 || statusVal === '0' || String(statusVal).toLowerCase() === 'todo' || String(statusVal).toLowerCase() === 'open') return 'todo';
          if (statusVal === 1 || statusVal === '1' || String(statusVal).toLowerCase() === 'inprogress') return 'inprogress';
          if (statusVal === 2 || statusVal === '2' || String(statusVal).toLowerCase() === 'completed' || String(statusVal).toLowerCase() === 'done') return 'completed';
          return 'todo';
        };

        const todos = mapped.filter(t => getStatusLower(t.status) === 'todo');
        const inProgs = mapped.filter(t => getStatusLower(t.status) === 'inprogress');
        const comps = mapped.filter(t => getStatusLower(t.status) === 'completed');

        this.allTodo.set(todos);
        this.allInProgress.set(inProgs);
        this.allCompleted.set(comps);

        this.applyFilter(this.searchTerm);
        this.isLoading.set(false);
        try { this.cdr.detectChanges(); } catch { }
      },
      error: (err) => {
        this.error.set(err?.message ?? 'Không thể tải danh sách task');
        this.isLoading.set(false);
      }
    });
  }

  drop(event: CdkDragDrop<KanbanTask[]>, targetStatus: 'Todo' | 'InProgress' | 'Completed') {
    if (event.previousContainer === event.container) {
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
    } else {
      transferArrayItem(event.previousContainer.data, event.container.data, event.previousIndex, event.currentIndex);

      const moved = event.container.data[event.currentIndex];
      if (moved && moved.id) {
        this.taskRpc.updateTaskStatus(moved.id, targetStatus).subscribe({
          next: () => {
            this.loadTasks();
          },
          error: () => {
            this.loadTasks();
          }
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
          Swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'success',
            title: 'Đã xóa Task thành công',
            showConfirmButton: false,
            timer: 1800,
            timerProgressBar: true
          });
          this.loadTasks();
        },
        error: () => {
          Swal.fire('Xóa thất bại', 'Xảy ra lỗi khi xóa task, vui lòng thử lại.', 'error');
          this.loadTasks();
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
      if (isHigh) {
        const p = (t.priority || '').toLowerCase();
        if (!(p === 'high')) return false;
      }
      if (isOverdue) {
        if (!t.dueDate) return false;
        const d = new Date(t.dueDate);
        if (!(d < now)) return false;
      }
      return true;
    };

    this.filteredTodo.set(this.allTodo().filter(predicate));
    this.filteredInProgress.set(this.allInProgress().filter(predicate));
    this.filteredCompleted.set(this.allCompleted().filter(predicate));
    this.isLoading.set(false);
  }
}
