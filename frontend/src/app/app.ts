import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { SignalRService } from './services/signalr.service';
import { TaskChatComponent } from './task-chat/task-chat.component';
import { AuthService } from './auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, TaskChatComponent, RouterModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  // Cho phép hiển thị giao diện ngay lập tức để kịp demo
  isReady = true; 

  ngOnInit(): void {
    // Start SignalR only when authenticated
    try {
      const auth = inject(AuthService);
      const signalR = inject(SignalRService);
      if (auth.isLoggedIn()) {
        signalR.startConnection();
      }
    } catch (e) {
      // ignore if injection fails in some environments
    }
  }
}
