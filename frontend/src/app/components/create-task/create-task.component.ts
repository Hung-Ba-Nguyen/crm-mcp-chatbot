import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { TaskRpcService } from '../../services/task-rpc.service';
import { UiService } from '../../services/ui.service';
import Swal from 'sweetalert2';

interface OptionItem {
  id: string;
  name: string;
}

@Component({
  selector: 'app-create-task',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './create-task.component.html'
})
export class CreateTaskComponent implements OnInit {
  private taskRpc = inject(TaskRpcService);
  private http = inject(HttpClient);
  public ui = inject(UiService);

  isLoading = signal(false);
  errorMessage = signal<string | null>(null);
  successMessage = signal<string | null>(null);
  isSubmitted = signal(false);

  departments: OptionItem[] = [
    { id: '6a709be6af0d8b17ec325927', name: 'Phòng Phát Triển Phần Mềm (DEV)' },
    { id: '6a709be6af0d8b17ec325928', name: 'Phòng Nhân Sự (HR)' }
  ];

  // Danh sách cố định theo thứ tự chuẩn
  users: OptionItem[] = [
    { id: '6a798756195040ed1af9cf22', name: 'Lê Văn Kiểm Thử' },
    { id: '6a798756195040ed1af9cf20', name: 'Nguyễn Văn Quản Lý' },
    { id: '6a798756195040ed1af9cf21', name: 'Trần Thị Lập Trình' }
  ];

  taskForm = {
    title: '',
    description: '',
    departmentId: '',
    assigneeId: '',
    dueDate: '',
    priority: 'Medium'
  };

  selectedSupervisorIds: string[] = [];

  ngOnInit(): void {
    this.fetchUsersFromApi();
  }

  private fetchUsersFromApi(): void {
    const url = `${environment.apiUrl.replace(/\/+$/, '')}/Users`;
    this.http.get<any[]>(url).subscribe({
      next: (res) => {
        let list: any[] = [];
        if (Array.isArray(res)) list = res;
        else if (Array.isArray((res as any)?.users)) list = (res as any).users;
        else if (Array.isArray((res as any)?.data)) list = (res as any).data;

        if (list.length > 0) {
          const apiUsers = list.map(u => ({
            id: String(u.id || u.Id || u._id || '').trim(),
            name: String(u.fullName || u.FullName || u.userName || u.UserName || u.name || 'User').trim()
          })).filter(u => u.id);

          if (apiUsers.length > 0) {
            // Sắp xếp cố định theo tên để tránh bị xáo trộn thứ tự
            this.users = apiUsers.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
          }
        }
      },
      error: () => { }
    });
  }

  isSupervisorSelected(userId: string): boolean {
    return this.selectedSupervisorIds.includes(userId);
  }

  toggleSupervisor(userId: string): void {
    if (this.isSupervisorSelected(userId)) {
      this.selectedSupervisorIds = this.selectedSupervisorIds.filter(id => id !== userId);
    } else {
      this.selectedSupervisorIds.push(userId);
    }
  }

  hasFieldError(field: 'title' | 'departmentId' | 'assigneeId' | 'dueDate'): boolean {
    if (!this.isSubmitted()) return false;
    return !this.taskForm[field] || String(this.taskForm[field]).trim() === '';
  }

  submit(): void {
    this.isSubmitted.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    const missingFields: string[] = [];
    if (!this.taskForm.title.trim()) missingFields.push('Tiêu đề task');
    if (!this.taskForm.departmentId.trim()) missingFields.push('Phòng ban');
    if (!this.taskForm.assigneeId.trim()) missingFields.push('Người phụ trách');
    if (!this.taskForm.dueDate) missingFields.push('Hạn hoàn thành');

    if (missingFields.length > 0) {
      const msg = `Vui lòng nhập đầy đủ: ${missingFields.join(', ')}`;
      this.errorMessage.set(msg);
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'warning',
        title: msg,
        showConfirmButton: false,
        timer: 2800,
        timerProgressBar: true
      });
      return;
    }

    this.isLoading.set(true);

    const mapPriorityToNum = (p: string): number => {
      const val = p.toLowerCase();
      if (val === 'low') return 0;
      if (val === 'high') return 2;
      return 1;
    };

    const payload = {
      title: this.taskForm.title.trim(),
      description: this.taskForm.description.trim(),
      departmentId: this.taskForm.departmentId.trim(),
      assigneeId: this.taskForm.assigneeId.trim(),
      priority: mapPriorityToNum(this.taskForm.priority),
      dueDate: new Date(this.taskForm.dueDate).toISOString(),
      supervisorIds: this.selectedSupervisorIds
    };

    this.taskRpc.createTask(payload).subscribe({
      next: (res: any) => {
        this.isLoading.set(false);
        this.isSubmitted.set(false);
        const successText = `Tạo task thành công: ${res?.title || payload.title}`;
        this.successMessage.set(successText);

        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'success',
          title: successText,
          showConfirmButton: false,
          timer: 2000,
          timerProgressBar: true
        });

        this.taskForm = {
          title: '',
          description: '',
          departmentId: '',
          assigneeId: '',
          dueDate: '',
          priority: 'Medium'
        };
        this.selectedSupervisorIds = [];
      },
      error: (err: any) => {
        this.isLoading.set(false);
        const errorText = err?.error?.title || err?.message || 'Không thể tạo task. Vui lòng thử lại!';
        this.errorMessage.set(errorText);

        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'error',
          title: errorText,
          showConfirmButton: false,
          timer: 3500,
          timerProgressBar: true
        });
      }
    });
  }
}
