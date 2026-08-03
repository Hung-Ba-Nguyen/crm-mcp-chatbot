import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatSidenavModule } from '@angular/material/sidenav';

export interface Task {
  id: string;
  title: string;
  status: 'Draft' | 'Open' | 'InProgress' | 'Blocked' | 'PendingApproval' | 'Done' | 'Cancelled';
}

export interface ChatMessage {
  sender: 'User' | 'Bot' | string;
  content: string;
  timestamp: Date;
}

@Component({
  selector: 'app-task-chat',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatSidenavModule,
    MatListModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatFormFieldModule,
  ],
  templateUrl: './task-chat.component.html',
  styleUrl: './task-chat.component.scss',
})
export class TaskChatComponent {
  mockTasks: Task[] = [
    { id: 'T-101', title: 'Fix login bug', status: 'InProgress' },
    { id: 'T-102', title: 'Design database schema', status: 'Open' },
    { id: 'T-103', title: 'Review customer onboarding flow', status: 'PendingApproval' },
    { id: 'T-104', title: 'Prepare support dashboard', status: 'Blocked' },
    { id: 'T-105', title: 'Update CRM migration notes', status: 'Done' },
  ];

  messages: ChatMessage[] = [
    {
      sender: 'Bot',
      content: 'Hello! I can help you review the task updates for today.',
      timestamp: new Date('2026-08-03T09:15:00'),
    },
    {
      sender: 'User',
      content: 'Please summarize the current tasks that need attention.',
      timestamp: new Date('2026-08-03T09:16:00'),
    },
    {
      sender: 'Bot',
      content: 'The most urgent work is the login bug and the blocked support dashboard task.',
      timestamp: new Date('2026-08-03T09:17:00'),
    },
  ];

  selectedTask: Task = this.mockTasks[0];
  newMessage = '';

  selectTask(task: Task): void {
    this.selectedTask = task;
  }

  sendMessage(): void {
    const content = this.newMessage.trim();

    if (!content) {
      return;
    }

    this.messages = [
      ...this.messages,
      { sender: 'User', content, timestamp: new Date() },
      {
        sender: 'Bot',
        content: `I will track your note for ${this.selectedTask.title}.`,
        timestamp: new Date(),
      },
    ];

    this.newMessage = '';
  }
}
