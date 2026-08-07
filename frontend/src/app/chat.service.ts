import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpEventType } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment';

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
  private readonly url = `${environment.apiUrl}/chat`;

  // Legacy non-streaming POST
  sendMessage(payload: ChatRequest): Observable<any> {
    return this.http.post<any>(this.url, payload);
  }

  // Streaming POST using fetch + ReadableStream. Emits chunks of text as they arrive.
  sendMessageStream(payload: ChatRequest, signal?: AbortSignal): Observable<string> {
    return new Observable<string>((subscriber) => {
      const sub = this.http.post(this.url, payload, {
        responseType: 'text',
        observe: 'events',
        reportProgress: true,
      }).subscribe({
        next: (event: any) => {
          if (event.type === HttpEventType.DownloadProgress) {
            const partial = (event as any).partialText ?? '';
            if (partial) subscriber.next(partial);
          } else if (event.type === HttpEventType.Response) {
            const body = event.body ?? '';
            if (body) subscriber.next(body);
            subscriber.complete();
          }
        },
        error: (err) => subscriber.error(err),
      });

      const onAbort = () => {
        try { sub.unsubscribe(); } catch { }
        subscriber.complete();
      };

      if (signal) {
        if (signal.aborted) {
          onAbort();
        } else {
          signal.addEventListener('abort', onAbort, { once: true });
        }
      }

      return () => {
        try { sub.unsubscribe(); } catch { }
        if (signal) {
          try { signal.removeEventListener('abort', onAbort); } catch { }
        }
      };
    });
  }
}
