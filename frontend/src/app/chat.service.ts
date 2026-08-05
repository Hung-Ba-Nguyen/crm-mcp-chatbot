import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface ChatRequest {
  Message: string;
  UserId?: string;
  TaskId?: string;
  DepartmentId?: string;
}

export interface ChatResponse {
  Answer: string;
  ToolUsed?: string;
  ProcessedAt?: string;
}

@Injectable({ providedIn: 'root' })
export class ChatService {
  private http = inject(HttpClient);
  private readonly url = 'https://localhost:7209/api/chat';

  sendMessage(payload: ChatRequest): Observable<any> {
    return this.http.post<any>(this.url, payload);
  }
}
