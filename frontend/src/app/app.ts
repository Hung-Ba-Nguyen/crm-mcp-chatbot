
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal, afterNextRender } from '@angular/core';
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
  // Cho phép hiển thị giao diện ngay lập tức để kịp demo
  isReady = true;
  showDaily = signal(false);

  // inject services at class-level for clarity
  private auth = inject(AuthService);
  private signalR = inject(SignalRService);

  ngOnInit(): void {
    try {
      // Start SignalR only when authenticated
      if (this.auth.isLoggedIn()) {
        // The SignalRService implementation already registers the server-side handlers
        // (e.g., 'ReceiveAlert') and uses ToastService internally. Just start the connection.
        this.signalR.startConnection();

        // Show daily briefing between 08:00 and 08:59 only once per day
        const now = new Date();
        const hour = now.getHours();
        if (hour >= 8 && hour < 9) {
        const key = 'daily_briefing_date';
          const last = localStorage.getItem(key);
          const today = now.toISOString().slice(0, 10); // YYYY-MM-DD
          if (last !== today) {
            // render after next render to ensure app template is present
            afterNextRender(() => {
              this.showDaily.set(true);
              try { localStorage.setItem(key, today); } catch { /* ignore */ }
            });
          }
        }
      }
    } catch (e) {
      // ignore if injection fails in some environments
      console.warn('App init error', e);
    }
  }

  // debug helper to open daily briefing manually
  openDailyDebug(): void {
    this.showDaily.set(true);
  }
}
