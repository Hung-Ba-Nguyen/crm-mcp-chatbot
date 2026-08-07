import { Component, inject } from '@angular/core';
import { ToastService } from './toast.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [],
  template: `
    <div class="toast-wrapper">
      @for (t of toasts(); track t.id) {
        @if (t) {
          <div class="toast-item" [attr.data-level]="t.level">
            <div class="toast-header">
              @if (t?.title) {
                <strong>{{ t.title }}</strong>
              }
              <button class="toast-close" (click)="dismiss(t?.id)">✕</button>
            </div>
            <div class="toast-body">{{ t?.message }}</div>
          </div>
        }
      }
    </div>
  `,
  styles: [
    `:host { position: fixed; right: 16px; top: 16px; z-index: 9999; }
     .toast-wrapper { display: flex; flex-direction: column; gap: 10px; }
     .toast-item { min-width: 280px; max-width: 380px; padding: 12px 14px; border-radius: 8px; box-shadow: 0 6px 18px rgba(0,0,0,0.12); background: white; }
     .toast-item[data-level="info"] { border-left: 4px solid #2563eb; }
     .toast-item[data-level="success"] { border-left: 4px solid #059669; }
     .toast-item[data-level="warning"] { border-left: 4px solid #d97706; }
     .toast-item[data-level="error"] { border-left: 4px solid #dc2626; }
     .toast-header { display:flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
     .toast-close { background: transparent; border: none; cursor: pointer; font-size: 14px; }
     .toast-body { font-size: 14px; color: #0f172a; }
    `
  ]
})
export class ToastComponent {
  private svc = inject(ToastService);
  toasts = this.svc.toasts;

  dismiss(id?: string): void {
    if (!id) return;
    this.svc.dismiss(id);
  }
}
