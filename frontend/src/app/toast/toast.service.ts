import { Injectable, signal } from '@angular/core';

export interface ToastItem {
  id: string;
  title?: string;
  message: string;
  level?: 'info' | 'warning' | 'error' | 'success';
  createdAt: number;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  toasts = signal<ToastItem[]>([]);

  show(message: string, title?: string, level: ToastItem['level'] = 'info', duration = 6000): string {
    const id = `toast-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const item: ToastItem = { id, title, message, level, createdAt: Date.now() };
    this.toasts.update(prev => [...prev, item]);

    // auto-dismiss
    setTimeout(() => this.dismiss(id), duration);
    return id;
  }

  dismiss(id: string): void {
    this.toasts.update(prev => prev.filter(t => t.id !== id));
  }
}
