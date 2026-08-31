import { Component, EventEmitter, Output, signal, OnInit, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { TaskRpcService } from '../services/task-rpc.service';

export interface BriefItem {
  id: string;
  title: string;
  value?: string;
}

@Component({
  selector: 'app-daily-briefing',
  standalone: true,
  imports: [],
  template: `
    <div class="db-backdrop">
      <div class="db-modal">
        <div class="db-header">
          <h2>Daily Briefing</h2>
          <button class="db-close" (click)="close.emit()">✕</button>
        </div>
        <div class="db-body">
          <p>Here is your morning briefing summary:</p>

          @if (isLoading()) {
            <div style="padding: 12px; color: #6b7280;">Loading briefing...</div>
          } @else {
            @for (item of items(); track item.id) {
              <div class="db-item">
                <div class="db-item-title">{{ item.title }}</div>
                <div class="db-item-value">{{ item.value }}</div>
              </div>
            }
          }

        </div>
        <div class="db-actions">
          <button (click)="close.emit()">Close</button>
        </div>
      </div>
    </div>
  `,
  styles: [
    `:host { position: fixed; inset: 0; display: block; z-index: 10000; }
     .db-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; }
     .db-modal { width: 720px; max-width: calc(100% - 32px); background: #fff; border-radius: 10px; padding: 18px; box-shadow: 0 10px 30px rgba(0,0,0,0.2); }
     .db-header { display:flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
     .db-close { background: transparent; border: none; font-size: 18px; cursor: pointer; }
     .db-body { max-height: 60vh; overflow: auto; }
     .db-item { padding: 8px 0; border-bottom: 1px solid #f1f1f1; }
     .db-item-title { font-weight: 600; }
     .db-item-value { color: #374151; }
     .db-actions { margin-top: 12px; display:flex; justify-content: flex-end; }
    `
  ]
})
export class DailyBriefingComponent implements OnInit {
  @Output() close = new EventEmitter<void>();

  // runtime state
  items = signal<BriefItem[]>([]);
  isLoading = signal(true);

  private http = inject(HttpClient);
  private taskRpc = inject(TaskRpcService);

  ngOnInit(): void {
    this.loadBriefing();
  }

  private decodeDepartmentIdFromToken(token?: string | null): string | null {
    try {
      if (!token) return null;
      const parts = token.split('.');
      if (parts.length < 2) return null;
      const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const json = decodeURIComponent(atob(payload).split('').map(function (c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      const obj = JSON.parse(json);
      return obj.departmentId || obj.department || obj.dept || obj.DepartmentId || null;
    } catch {
      return null;
    }
  }

  private loadBriefing(): void {
    this.isLoading.set(true);
    const token = localStorage.getItem('access_token');
    const deptFromToken = this.decodeDepartmentIdFromToken(token);
    const deptId = deptFromToken ?? '6a709be6af0d8b17ec325927';

    this.taskRpc.rpc<any>('get_department_kpi', { DepartmentId: deptId }).subscribe({
      next: (result) => {
        const overdue = result.overdueTasks ?? result.OverdueTasks ?? result.overdue ?? result.overdueCount ?? null;
        const total = result.totalTasks ?? result.TotalTasks ?? result.total ?? null;
        const completion = result.completionRate ?? result.CompletionRate ?? null;
        const avgTime = result.averageHandlingTime ?? result.avgTime ?? null;

        const newItems: BriefItem[] = [];
        if (overdue != null || total != null) {
          newItems.push({ id: 'kpi', title: 'Department Overdue Tasks', value: `${overdue ?? '?'} overdue / ${total ?? '?'} total` });
        }
        if (avgTime != null) {
          newItems.push({ id: 'avg', title: 'Average Handling Time', value: `${avgTime}` });
        }
        if (completion != null) {
          newItems.push({ id: 'completion', title: 'Completion Rate', value: `${completion}%` });
        }

        if (newItems.length === 0) {
          newItems.push({ id: 'empty', title: 'No data', value: 'No briefing data available.' });
        }

        this.items.set(newItems);
        this.isLoading.set(false);
      },
      error: () => {
        this.items.set([{ id: 'err', title: 'Error', value: 'Failed to load briefing data.' }]);
        this.isLoading.set(false);
      }
    });
  }
}
