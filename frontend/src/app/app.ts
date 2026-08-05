import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { TaskChatComponent } from './task-chat/task-chat.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, TaskChatComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  // Cho phép hiển thị giao diện ngay lập tức để kịp demo
  isReady = true; 

  ngOnInit(): void {
    // Tự động gán sẵn token giả lập để các API gọi đi không bị chặn
    if (!localStorage.getItem('access_token')) {
      localStorage.setItem('access_token', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock-token-for-demo');
    }
  }
}