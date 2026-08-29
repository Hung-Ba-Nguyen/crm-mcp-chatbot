import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { TaskRpcService } from '../../services/task-rpc.service';
import { TaskItem, WorkloadSummary } from '../../models/task-rpc.model';

@Component({
  selector: 'app-workload-dashboard',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './workload-dashboard.component.html',
  styles: [`
    :host { display: block; }
    .page { height: calc(100vh - 64px); background: #f3f4f6; display: flex; align-items: center; justify-content: center; overflow: hidden; padding: 20px; box-sizing: border-box; }
    .card { width: 100%; max-width: 1024px; max-height: 100%; overflow-y: auto; display: flex; flex-direction: column; background: #fff; box-shadow: 0 6px 18px rgba(15,23,42,0.08); border-radius: 8px; padding: 20px; }
    h3 { margin: 0 0 12px 0; font-size: 1.125rem; }
    .alert { border-radius: 6px; padding: 10px; margin-bottom: 12px; }
    .alert-error { background: #fff5f5; color: #8b1d1d; border: 1px solid #ffdede; }
    .alert-success { background: #f0fdf4; color: #14532d; border: 1px solid #d1fae5; }
    .task-form { display: block; }
    .form-row { margin-bottom: 10px; }
    label { display: block; margin-bottom: 6px; font-size: 0.9rem; }
    .input { width: 100%; box-sizing: border-box; border: 1px solid #e5e7eb; padding: 8px 10px; border-radius: 6px; font-size: 0.95rem; }
    .input:focus, textarea:focus, select:focus { outline: none; box-shadow: 0 0 0 4px rgba(106,90,205,0.12); border-color: #6a5acd; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .form-actions { padding-top: 8px; }
    .btn-primary { background: #6a5acd; color: #fff; border: none; padding: 10px 14px; border-radius: 6px; cursor: pointer; }
    .btn-primary:hover { background: #5946b0; }
    .btn-primary:disabled { opacity: 0.6; cursor: default; }
    .loading { margin-top: 8px; color: #374151; }
    .overdue-list li { border-bottom: 1px solid #e5e7eb; padding: 6px 0; }
    .workload-table { width: 100%; border-collapse: collapse; }
    .workload-table th, .workload-table td { padding: 8px 6px; }
    .workload-table thead tr { background: #f3f4f6; }
    .workload-table tbody tr { border-bottom: 1px solid #e5e7eb; }
    /* Section spacing */
    section { margin-bottom: 12px; }
    section h4 { margin: 0 0 8px 0; font-size: 1rem; }
  `]
})
export class WorkloadDashboardComponent {
  private fb = inject(FormBuilder);
  private taskService = inject(TaskRpcService);

  form = this.fb.group({
    searchType: ['department'], // 'department' | 'user'
    departmentId: [''],
    userId: ['']
  });

  isLoading = signal(false);
  errorMessage = signal<string | null>(null);
  successMessage = signal<string | null>(null);

  overdueTasks = signal<TaskItem[]>([]);
  workloadSummaries = signal<WorkloadSummary[]>([]);

  load() {
    this.errorMessage.set(null);
    this.successMessage.set(null);

    const searchType = String(this.form.get('searchType')?.value ?? 'department');

    if (searchType === 'department') {
      const deptId: string = String(this.form.get('departmentId')?.value ?? '').trim();
      if (!deptId) {
        this.form.get('departmentId')?.setErrors({ required: true });
        this.form.markAllAsTouched();
        return;
      }

      this.isLoading.set(true);

      forkJoin({
        overdueTasks: this.taskService.getOverdueTasks(deptId),
        workloadSummaries: this.taskService.getWorkloadSummary({ departmentId: deptId })
      }).subscribe({
        next: (res) => {
          // server returns PascalCase fields; models updated accordingly
          this.overdueTasks.set(res.overdueTasks ?? res.overdueTasks ?? [] as any);
          this.workloadSummaries.set(res.workloadSummaries ?? res.workloadSummaries ?? [] as any);
          this.isLoading.set(false);
          this.successMessage.set('Loaded dashboard for department ' + deptId);
        },
        error: (err) => {
          this.isLoading.set(false);
          const message = err?.message ?? 'Failed to load data';
          this.errorMessage.set(message);
        }
      });

    } else if (searchType === 'user') {
      const userId = String(this.form.get('userId')?.value ?? '').trim();
      if (!userId) {
        this.form.get('userId')?.setErrors({ required: true });
        this.form.markAllAsTouched();
        return;
      }

      this.isLoading.set(true);
      this.overdueTasks.set([]);

      this.taskService.getWorkloadSummary({ userId }).subscribe({
        next: (res) => {
          this.workloadSummaries.set(res ?? []);
          this.isLoading.set(false);
          this.successMessage.set('Loaded workload summary for user ' + userId);
        },
        error: (err) => {
          this.isLoading.set(false);
          const message = err?.message ?? 'Failed to load data';
          this.errorMessage.set(message);
        }
      });
    }
  }
}
