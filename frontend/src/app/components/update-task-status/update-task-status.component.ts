import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TaskRpcService } from '../../services/task-rpc.service';
import { TaskItem } from '../../models/task-rpc.model';
import { UiService } from '../../services/ui.service';

@Component({
  selector: 'app-update-task-status',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './update-task-status.component.html',
  styles: [`
    :host { display: block; }
    /* Unified page layout */
    .page { height: calc(100vh - 64px); display: flex; align-items: center; justify-content: center; padding: 24px; box-sizing: border-box; overflow: hidden; background-color: var(--bg-color); color: var(--text-color); }
    .card { width: 100%; max-width: 500px; padding: 24px; background: var(--card-bg); border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); box-sizing: border-box; margin: 0; }
    h3 { margin: 0 0 12px 0; font-size: 1.125rem; }
    .alert { border-radius: 6px; padding: 10px; margin-bottom: 12px; }
    .alert-error { background: #fff5f5; color: #8b1d1d; border: 1px solid #ffdede; }
    .alert-success { background: #f0fdf4; color: #14532d; border: 1px solid #d1fae5; }
    .task-form { display: block; }
    .form-row { margin-bottom: 12px; }
    label { display: block; margin-bottom: 6px; font-size: 0.9rem; }
    .input, textarea, select { width: 100%; box-sizing: border-box; border: 1px solid #e5e7eb; padding: 8px 10px; border-radius: 6px; font-size: 0.95rem; background: transparent; color: var(--text-color); }
    .input:focus, textarea:focus, select:focus { outline: none; box-shadow: 0 0 0 4px rgba(106,90,205,0.12); border-color: #6a5acd; }
    .form-actions { padding-top: 8px; }
    .btn-primary { background: #6a5acd; color: #fff; border: none; padding: 10px 14px; border-radius: 6px; cursor: pointer; }
    .btn-primary:hover { background: #5946b0; }
    .btn-primary:disabled { opacity: 0.6; cursor: default; }
    .loading { margin-top: 8px; color: #374151; }
  `]
})
export class UpdateTaskStatusComponent {
  private fb = inject(FormBuilder);
  private taskService = inject(TaskRpcService);
  public ui = inject(UiService);

  form = this.fb.group({
    taskId: ['', Validators.required],
    status: ['Todo', Validators.required]
  });

  isLoading = signal(false);
  errorMessage = signal<string | null>(null);
  successMessage = signal<string | null>(null);

  submit() {
    this.errorMessage.set(null);
    this.successMessage.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const taskId = String(this.form.get('taskId')?.value ?? '');
    const status = String(this.form.get('status')?.value ?? '');

    this.isLoading.set(true);

    this.taskService.updateTaskStatus(taskId, status).subscribe({
      next: (task: TaskItem) => {
        this.isLoading.set(false);
        this.successMessage.set('Task ' + task.Title + ' updated to ' + task.Status);
        this.form.reset({ status: 'Todo' });
      },
      error: (err: any) => {
        this.isLoading.set(false);
        const msg = err?.message ?? 'Failed to update task status';
        this.errorMessage.set(msg);
      }
    });
  }
}
