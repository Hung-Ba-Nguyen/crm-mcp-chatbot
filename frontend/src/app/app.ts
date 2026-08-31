import { RouterModule, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal, HostListener, Injector, runInInjectionContext, afterNextRender } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { SignalRService } from './services/signalr.service';
import { TaskChatComponent } from './task-chat/task-chat.component';
import { AuthService } from './auth.service';
import { ToastComponent } from './toast/toast.component';
import { DailyBriefingComponent } from './daily-briefing/daily-briefing.component';
import { environment } from '../environments/environment';

export interface NotifItem {
  id: string;
  title: string;
  time: string;
  taskId?: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, TaskChatComponent, RouterModule, ToastComponent, DailyBriefingComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  private readonly baseUrl = environment.apiUrl;
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private signalR = inject(SignalRService);
  private injector = inject(Injector);
  private router = inject(Router);

  isReady = true;
  showDaily = signal(false);

  // Dropdown đang active
  activeDropdown = signal<string | null>(null);

  // Danh sách thông báo
  newTasksNotifs = signal<NotifItem[]>([]);
  updatedTasksNotifs = signal<NotifItem[]>([]);
  pendingApprovalNotifs = signal<NotifItem[]>([]);

  get isLoginPage(): boolean {
    try {
      const url = String(this.router.url || '');
      return url === '/login' || url.includes('/login');
    } catch {
      return false;
    }
  }

  toggleNotifDropdown(type: string): void {
    this.activeDropdown.update(current => (current === type ? null : type));
  }

  // Đánh dấu đã đọc toàn bộ một nhóm chuông
  markAllAsRead(type: string): void {
    if (type === 'new') this.newTasksNotifs.set([]);
    if (type === 'update') this.updatedTasksNotifs.set([]);
    if (type === 'approval') this.pendingApprovalNotifs.set([]);
  }

  // Đánh dấu đã đọc 1 item đơn lẻ
  readSingleItem(type: string, id: string): void {
    if (type === 'new') {
      this.newTasksNotifs.update(list => list.filter(item => item.id !== id));
    } else if (type === 'update') {
      this.updatedTasksNotifs.update(list => list.filter(item => item.id !== id));
    } else if (type === 'approval') {
      this.pendingApprovalNotifs.update(list => list.filter(item => item.id !== id));
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.notif-wrapper')) {
      this.activeDropdown.set(null);
    }
  }

  ngOnInit(): void {
    try {
      if (this.auth.isLoggedIn()) {
        this.signalR.startConnection();
        this.loadRealNotifications();

        const now = new Date();
        const hour = now.getHours();
        if (hour >= 8 && hour < 9) {
          const key = 'daily_briefing_date';
          const last = localStorage.getItem(key);
          const today = now.toISOString().slice(0, 10);
          if (last !== today) {
            try {
              runInInjectionContext(this.injector, () => {
                afterNextRender(() => {
                  this.showDaily.set(true);
                  try { localStorage.setItem(key, today); } catch { }
                });
              });
            } catch (e) {
              try {
                afterNextRender(() => {
                  this.showDaily.set(true);
                  try { localStorage.setItem(key, today); } catch { }
                });
              } catch (err) {
                console.warn('Could not schedule daily briefing', err || e);
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn('App init error', e);
    }
  }

  loadRealNotifications(): void {
    const url = `${this.baseUrl.replace(/\/+$/, '')}/Tasks`;
    this.http.get<any>(url).subscribe({
      next: (res) => {
        let tasks: any[] = [];
        if (Array.isArray(res)) tasks = res;
        else if (Array.isArray(res?.tasks)) tasks = res.tasks;
        else if (Array.isArray(res?.Tasks)) tasks = res.Tasks;
        else if (Array.isArray(res?.data)) tasks = res.data;

        const pending = tasks.filter(t => String(t.status || t.Status || '').toLowerCase() === 'pendingapproval' || String(t.status || t.Status) === '4');
        const inProgress = tasks.filter(t => String(t.status || t.Status || '').toLowerCase() === 'inprogress' || String(t.status || t.Status) === '1');
        const recent = tasks.slice(0, 3);

        this.newTasksNotifs.set(recent.map(t => ({
          id: t.id || t.Id || '',
          title: `Công việc: ${t.title || t.Title || 'Không có tiêu đề'}`,
          time: 'Gần đây'
        })));

        this.updatedTasksNotifs.set(inProgress.map(t => ({
          id: t.id || t.Id || '',
          title: `Đang xử lý: ${t.title || t.Title || ''}`,
          time: 'Đang thực hiện'
        })));

        this.pendingApprovalNotifs.set(pending.map(t => ({
          id: t.id || t.Id || '',
          title: `Chờ duyệt: ${t.title || t.Title || ''}`,
          time: 'Chờ phê duyệt'
        })));
      },
      error: (err) => console.warn('Không thể tải thông báo:', err)
    });
  }

  openDailyDebug(): void {
    this.showDaily.set(true);
  }
}
