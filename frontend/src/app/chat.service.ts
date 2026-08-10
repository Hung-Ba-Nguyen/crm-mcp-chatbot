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
          let buffer = '';
          const emitChunk = (text: string) => {
            if (!text) return;
            subscriber.next(text);
          };

          // Helper to try parse JSON objects from the buffer. If a valid JSON object
          // is found, extract data.answer (or Answer/answer) and emit that value.
          const tryParseBuffer = () => {
            // Look for the first opening brace
            let start = buffer.indexOf('{');
            if (start === -1) {
              // No JSON start found — emit as plain text and clear buffer
              if (buffer.trim()) {
                emitChunk(buffer);
              }
              buffer = '';
              return;
            }

            // Attempt to find a matching '}' and parse progressively
            for (let end = buffer.indexOf('}', start); end !== -1; end = buffer.indexOf('}', end + 1)) {
              const candidate = buffer.substring(start, end + 1);
              try {
                const obj = JSON.parse(candidate);
                // Prefer nested properties where available
                const answer = obj?.data?.answer ?? obj?.Answer ?? obj?.answer ?? null;
                if (typeof answer === 'string') {
                  emitChunk(answer);
                } else {
                  // If no answer field, emit the whole object as fallback string
                  emitChunk(JSON.stringify(obj));
                }
                // remove the parsed portion and continue
                buffer = buffer.substring(end + 1);
                // try to parse more JSON in the remaining buffer
                return tryParseBuffer();
              } catch {
                // not valid JSON yet, continue searching for a later '}'
                continue;
              }
            }

            // If we get here, we couldn't parse a complete JSON object yet.
            // If buffer is large and doesn't look like it will complete, emit as plain text.
            if (buffer.length > 1000) {
              emitChunk(buffer);
              buffer = '';
            }
          };

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              const chunk = decoder.decode(value, { stream: true });
              if (!chunk) continue;
              buffer += chunk;
              tryParseBuffer();
            }
          }

          // flush any remaining buffer as plain text
          if (buffer.trim()) {
            // Try a final JSON parse attempt
            try {
              const obj = JSON.parse(buffer);
              const answer = obj?.data?.answer ?? obj?.Answer ?? obj?.answer ?? null;
              if (typeof answer === 'string') subscriber.next(answer);
              else subscriber.next(buffer);
            } catch {
              subscriber.next(buffer);
            }
            buffer = '';
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
