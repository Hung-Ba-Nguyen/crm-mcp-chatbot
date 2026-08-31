import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import Swal from 'sweetalert2';

interface OptionItem {
  id: string;
  name: string;
}

interface WorkloadStatRow {
  userId: string;
  userName: string;
  total: number;
  completed: number;
  inProgress: number;
  overdue: number;
  completionRate: number;
}

@Component({
  selector: 'app-workload-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './workload-dashboard.component.html'
})
export class WorkloadDashboardComponent implements OnInit {
  private http = inject(HttpClient);

  queryType: 'department' | 'user' = 'department';
  selectedId: string = '';
  isLoading = signal(false);

  departments: OptionItem[] = [
    { id: '6a709be6af0d8b17ec325927', name: 'Phòng Phát Triển Phần Mềm (DEV)' },
    { id: '6a709be6af0d8b17ec325928', name: 'Phòng Nhân Sự (HR)' }
  ];

  users: OptionItem[] = [
    { id: '64b8d5f1e1a3f5a0c2d9b7a1', name: 'Nguyễn Bá Hùng (Dev Lead)' },
    { id: '64b8d5f1e1a3f5a0c2d9b7a2', name: 'Duy Linh (Backend Dev)' },
    { id: '64b8d5f1e1a3f5a0c2d9b7a3', name: 'Trần Thị Lập Trình (Fullstack Dev)' },
    { id: '64b8d5f1e1a3f5a0c2d9b7a4', name: 'Lê Văn Kiểm Thử (QA/QC Tester)' },
    { id: '64b8d5f1e1a3f5a0c2d9b7a5', name: 'Nguyễn Văn Quản Lý (Admin/Manager)' }
  ];

  private userMap: Record<string, string> = {
    '64b8d5f1e1a3f5a0c2d9b7a1': 'Nguyễn Bá Hùng',
    '64b8d5f1e1a3f5a0c2d9b7a2': 'Duy Linh',
    '64b8d5f1e1a3f5a0c2d9b7a3': 'Trần Thị Lập Trình',
    '64b8d5f1e1a3f5a0c2d9b7a4': 'Lê Văn Kiểm Thử',
    '64b8d5f1e1a3f5a0c2d9b7a5': 'Nguyễn Văn Quản Lý'
  };

  stats = signal({
    total: 0,
    completed: 0,
    inProgress: 0,
    overdue: 0
  });

  overdueTasks = signal<any[]>([]);
  workloadSummary = signal<WorkloadStatRow[]>([]);

  ngOnInit(): void {
    this.fetchUsersFromApi();
    this.selectedId = ''; // Giữ trống ban đầu
  }

  onQueryTypeChange(): void {
    this.selectedId = ''; // Reset về trống khi đổi loại query
  }

  private fetchUsersFromApi(): void {
    const url = `${environment.apiUrl.replace(/\/+$/, '')}/Users`;
    this.http.get<any[]>(url).subscribe({
      next: (res) => {
        if (Array.isArray(res) && res.length > 0) {
          const apiUsers = res.map(u => ({
            id: String(u.id || u.Id || u._id || ''),
            name: String(u.fullName || u.FullName || u.userName || u.UserName || u.name || 'User')
          })).filter(u => u.id);

          if (apiUsers.length > 0) {
            this.users = apiUsers;
            apiUsers.forEach(u => this.userMap[u.id] = u.name);
          }
        }
      },
      error: () => { }
    });
  }

  getUserDisplayName(userId?: string): string {
    const uid = String(userId || '').trim();
    if (!uid) return 'Chưa phân công';
    return this.userMap[uid] || (uid.length > 8 ? `Nhân sự (${uid.slice(0, 6)})` : uid);
  }

  loadDashboardData(): void {
    if (!this.selectedId) return;

    this.isLoading.set(true);
    const baseUrl = environment.apiUrl.replace(/\/+$/, '');
    const url = `${baseUrl}/Tasks`;

    this.http.get<any[]>(url).subscribe({
      next: (res) => {
        let tasks: any[] = [];
        if (Array.isArray(res)) tasks = res;
        else if (Array.isArray((res as any)?.tasks)) tasks = (res as any).tasks;

        const targetId = this.selectedId.trim();
        const filtered = tasks.filter(t => {
          if (this.queryType === 'department') {
            const deptId = String(t.departmentId || t.DepartmentId || '').trim();
            return deptId === targetId;
          } else {
            const assigneeId = String(t.assigneeId || t.AssigneeId || '').trim();
            return assigneeId === targetId;
          }
        });

        this.calculateDashboardStats(filtered);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.isLoading.set(false);
        Swal.fire({
          icon: 'error',
          title: 'Lỗi tải dữ liệu',
          text: 'Không thể tải dữ liệu thống kê từ máy chủ. Vui lòng thử lại!'
        });
      }
    });
  }

  private calculateDashboardStats(tasks: any[]): void {
    const now = new Date();
    let total = tasks.length;
    let completed = 0;
    let inProgress = 0;
    let overdue = 0;
    const overdues: any[] = [];
    const userGroups: Record<string, { total: number; completed: number; inProgress: number; overdue: number }> = {};

    tasks.forEach(t => {
      const status = String(t.status ?? t.Status ?? 0).toLowerCase();
      const isDone = status === '2' || status === 'completed' || status === 'done';
      const isInProg = status === '1' || status === 'inprogress';

      const dueDateStr = t.dueDate || t.DueDate;
      let isOver = false;
      if (dueDateStr && !isDone) {
        const d = new Date(dueDateStr);
        d.setHours(23, 59, 59, 999);
        if (d < now) {
          isOver = true;
        }
      }

      if (isDone) completed++;
      if (isInProg) inProgress++;
      if (isOver) {
        overdue++;
        overdues.push({
          id: t.id || t.Id || t._id,
          title: t.title || t.Title,
          assigneeId: t.assigneeId || t.AssigneeId,
          dueDate: dueDateStr,
          priority: t.priority || t.Priority || 'Medium'
        });
      }

      const uId = String(t.assigneeId || t.AssigneeId || 'unassigned').trim();
      if (!userGroups[uId]) {
        userGroups[uId] = { total: 0, completed: 0, inProgress: 0, overdue: 0 };
      }
      userGroups[uId].total++;
      if (isDone) userGroups[uId].completed++;
      if (isInProg) userGroups[uId].inProgress++;
      if (isOver) userGroups[uId].overdue++;
    });

    this.stats.set({ total, completed, inProgress, overdue });
    this.overdueTasks.set(overdues);

    const summaryRows: WorkloadStatRow[] = Object.keys(userGroups).map(uId => {
      const g = userGroups[uId];
      const rate = g.total > 0 ? Math.round((g.completed / g.total) * 100) : 0;
      return {
        userId: uId,
        userName: this.getUserDisplayName(uId),
        total: g.total,
        completed: g.completed,
        inProgress: g.inProgress,
        overdue: g.overdue,
        completionRate: rate
      };
    });

    this.workloadSummary.set(summaryRows);
  }
}
