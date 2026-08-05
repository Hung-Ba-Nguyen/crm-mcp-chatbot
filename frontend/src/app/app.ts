import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { finalize } from 'rxjs';
import { TaskChatComponent } from './task-chat/task-chat.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, TaskChatComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  isReady = false;
  private readonly loginUrl = 'https://localhost:7209/api/users/login';
  private http = inject(HttpClient);

  ngOnInit(): void {
    const loginPayload = {
      Email: 'a.nguyen@example.com',
      Password: 'P@ssw0rd!'
    };

    this.http.post<any>(this.loginUrl, loginPayload)
      .pipe(finalize(() => {
        this.isReady = true;
      }))
      .subscribe({
        next: (response) => {
          const accessToken = response?.AccessToken;
          if (accessToken) {
            localStorage.setItem('access_token', accessToken);
          } else {
            console.warn('Silent login thành công nhưng không nhận AccessToken:', response);
          }
        },
        error: (error) => {
          console.error('Silent login thất bại:', error);
        }
      });
  }
}
