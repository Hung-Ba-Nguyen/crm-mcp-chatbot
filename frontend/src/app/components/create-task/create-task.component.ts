import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TaskRpcService } from '../../services/task-rpc.service';
import { TaskItem } from '../../models/task-rpc.model';

@Component({
  selector: 'app-create-task',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './create-task.component.html',
  styles: [`
    :host { display: block; }
    /* Unified page layout */
    .page { height: calc(100vh - 64px); display: flex; align-items: center; justify-content: center; padding: 24px 24px; box-sizing: border-box; overflow: hidden; background-color: #f3f4f6; }
    .card { width: 100%; max-width: 1024px; background: #ffffff; box-shadow: 0 6px 18px rgba(15,23,42,0.08); border-radius: 8px; padding: 16px 20px; box-sizing: border-box; overflow: hidden; }
    h3 { margin: 0 0 8px 0; font-size: 1.125rem; }
    .alert { border-radius: 6px; padding: 10px; margin-bottom: 12px; }
    .alert-error { background: #fff5f5; color: #8b1d1d; border: 1px solid #ffdede; }
    .alert-success { background: #f0fdf4; color: #14532d; border: 1px solid #d1fae5; }
    .task-form { display: block; }
    .form-row { margin-bottom: 8px; }
    label { display: block; margin-bottom: 2px; font-size: 0.9rem; }
    .input, textarea, select { width: 100%; box-sizing: border-box; border: 1px solid #e5e7eb; padding: 6px 10px; border-radius: 6px; font-size: 0.95rem; }
    textarea { min-height: 40px; resize: vertical; }
    .input:focus, textarea:focus, select:focus { outline: none; box-shadow: 0 0 0 4px rgba(106,90,205,0.12); border-color: #6a5acd; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .form-actions { margin-top: 2px; padding-top: 0; }

    /* Ensure button sits closer to bottom */
    .btn-primary { margin-bottom: 0; }
    .btn-primary { background: #6a5acd; color: #fff; border: none; padding: 10px 14px; border-radius: 6px; cursor: pointer; }
    .btn-primary:hover { background: #5946b0; }
    .btn-primary:disabled { opacity: 0.6; cursor: default; }
    .loading { margin-top: 8px; color: #374151; }
  `]
})
export class CreateTaskComponent {
  private fb = inject(FormBuilder);
  private taskService = inject(TaskRpcService);

  form = this.fb.group({
    title: ['', Validators.required],
    description: ['', Validators.required],
    departmentId: ['', Validators.required],
    assigneeId: ['', Validators.required],
    dueDate: ['', Validators.required],
    priority: ['', Validators.required],
    supervisorIds: ['']
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

    const raw = this.form.value;

    // Format dueDate to ISO 8601 string
    const due = raw.dueDate ? new Date(raw.dueDate).toISOString() : null;

    const params: any = {
      Title: raw.title,
      Description: raw.description,
      DepartmentId: raw.departmentId,
      AssigneeId: raw.assigneeId,
      DueDate: due,
      // Map priority string to integer to avoid backend enum parsing issues
      Priority: ((): number => {
        const priorityMap: Record<string, number> = { 'Low': 0, 'Medium': 1, 'High': 2 };
        return priorityMap[String(raw.priority)] ?? 1;
      })()
    };

    if (raw.supervisorIds) {
      params.SupervisorIds = Array.isArray(raw.supervisorIds)
        ? raw.supervisorIds
        : String(raw.supervisorIds).split(',').map((s: string) => s.trim()).filter(Boolean);
    }

    this.isLoading.set(true);

    this.taskService.createTask(params).subscribe({
      next: (task: TaskItem) => {
        this.isLoading.set(false);
        this.successMessage.set('Task created: ' + task.Title);
        this.form.reset();
      },
      error: (err: any) => {
        this.isLoading.set(false);
        const message = err?.message ?? 'Unknown error';
        this.errorMessage.set(message);
      }
    });
  }
}
