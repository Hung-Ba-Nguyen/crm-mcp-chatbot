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

  users: OptionItem[] = [
    { id: '64b8d5f1e1a3f5a0c2d9b7a1', name: 'Nguyễn Bá Hùng (Dev Lead)' },
    { id: '64b8d5f1e1a3f5a0c2d9b7a2', name: 'Duy Linh (Backend Dev)' },
    { id: '64b8d5f1e1a3f5a0c2d9b7a3', name: 'Trần Thị Lập Trình (Fullstack Dev)' },
    { id: '64b8d5f1e1a3f5a0c2d9b7a4', name: 'Lê Văn Kiểm Thử (QA/QC Tester)' },
    { id: '64b8d5f1e1a3f5a0c2d9b7a5', name: 'Nguyễn Văn Quản Lý (Admin/Manager)' }
  ];

  taskForm = {
    title: '',
    description: '',
    departmentId: '',
    assigneeId: '',
    dueDate: '',
    priority: 'Medium',
    supervisorIds: ''
  };

  ngOnInit(): void {
    this.fetchUsersFromApi();
  }

  private fetchUsersFromApi(): void {
    const url = `${environment.apiUrl.replace(/\/+$/, '')}/Users`;
    this.http.get<any[]>(url).subscribe({
      next: (res) => {
        if (Array.isArray(res) && res.length > 0) {
          const apiUsers = res.map(u => ({
            id: String(u.id || u.Id || u._id || ''),
            name: String(u.fullName || u.FullName || u.userName || u.UserName || u.email || 'User')
          })).filter(u => u.id);

          if (apiUsers.length > 0) {
            this.users = apiUsers;
          }
        }
      },
      error: () => { /* Giữ danh sách mặc định nếu endpoint /Users chưa có */ }
    });
  }

  hasFieldError(field: 'title' | 'departmentId' | 'assigneeId' | 'dueDate'): boolean {
    if (!this.isSubmitted()) return false;
    return !this.taskForm[field] || String(this.taskForm[field]).trim() === '';
  }

  submit() {
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
        timer: 3000,
        timerProgressBar: true
      });
      return;
    }

    this.isLoading.set(true);

    const payload = {
      title: this.taskForm.title.trim(),
      description: this.taskForm.description.trim(),
      departmentId: this.taskForm.departmentId.trim(),
      assigneeId: this.taskForm.assigneeId.trim(),
      priority: this.taskForm.priority,
      dueDate: new Date(this.taskForm.dueDate).toISOString(),
      supervisorIds: this.taskForm.supervisorIds
        ? [this.taskForm.supervisorIds.trim()]
        : []
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
          priority: 'Medium',
          supervisorIds: ''
        };
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
