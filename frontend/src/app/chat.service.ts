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
      const controller = new AbortController();
      const combinedSignal = controller.signal;

      // If external signal is provided, forward aborts
      const onExternalAbort = () => controller.abort();
      if (signal) {
        if (signal.aborted) controller.abort();
        else signal.addEventListener('abort', onExternalAbort, { once: true });
      }

      (async () => {
        try {
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          const token = localStorage.getItem('access_token');
          if (token) headers['Authorization'] = `Bearer ${token}`;

          const resp = await fetch(this.url, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
            signal: combinedSignal,
          });

          if (!resp.ok) {
            const txt = await resp.text().catch(() => '');
            subscriber.error(new Error(`Stream response error: ${resp.status} ${txt}`));
            return;
          }

          const reader = resp.body?.getReader();
          if (!reader) {
            const text = await resp.text().catch(() => '');
            if (text) subscriber.next(text);
            subscriber.complete();
            return;
          }

          const decoder = new TextDecoder();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              const chunk = decoder.decode(value, { stream: true });
              if (chunk) subscriber.next(chunk);
            }
          }

          // finalize
          subscriber.complete();
        } catch (err) {
          if ((err as any)?.name === 'AbortError') subscriber.complete();
          else subscriber.error(err as any);
        } finally {
          if (signal) {
            try { signal.removeEventListener('abort', onExternalAbort); } catch { }
          }
        }
      })();

      return () => {
        try { controller.abort(); } catch { }
      };
    });
  }
}
