import { RouterModule, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal, afterNextRender, Injector, runInInjectionContext } from '@angular/core';
import { SignalRService } from './services/signalr.service';
import { TaskChatComponent } from './task-chat/task-chat.component';
import { AuthService } from './auth.service';
import { ToastComponent } from './toast/toast.component';
import { DailyBriefingComponent } from './daily-briefing/daily-briefing.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, TaskChatComponent, RouterModule, ToastComponent, DailyBriefingComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  isReady = true;
  showDaily = signal(false);

  private auth = inject(AuthService);
  private signalR = inject(SignalRService);
  private injector = inject(Injector);
  private router = inject(Router);

  get isLoginPage(): boolean {
    try {
      const url = String(this.router.url || '');
      return url === '/login' || url.includes('/login');
    } catch {
      return false;
    }
  }

  ngOnInit(): void {
    try {
      if (this.auth.isLoggedIn()) {
        this.signalR.startConnection();

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

  openDailyDebug(): void {
    this.showDaily.set(true);
  }
}
