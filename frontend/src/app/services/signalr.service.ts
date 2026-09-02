import { Injectable, inject, NgZone, signal } from '@angular/core';
import { Router } from '@angular/router';
import { HubConnection, HubConnectionBuilder, LogLevel } from '@microsoft/signalr';
import { environment } from '../../environments/environment';
import { MatSnackBar } from '@angular/material/snack-bar';

export interface AlertPayload {
  message?: string;
  Message?: string;
  taskId?: string;
  TaskId?: string;
  task?: string;
  Task?: string;
  url?: string;
  Url?: string;
  type?: 'warning' | 'info' | 'urgent';
  timestamp?: Date;
}

@Injectable({ providedIn: 'root' })
export class SignalRService {
  private hubConnection?: HubConnection;
  private snackBar = inject(MatSnackBar);
  private ngZone = inject(NgZone);
  private router = inject(Router);

  // Signal để component TaskChat hoặc Header có thể theo dõi alert mới nhất
  public latestAlert = signal<AlertPayload | null>(null);
  public alertHistory = signal<AlertPayload[]>([]);

  public startConnection(): void {
    if (this.hubConnection) return;

    // Use the explicit hubUrl from environment (should not include the /api prefix)
    const hubUrl = `${environment.hubUrl.replace(/\/$/, '')}/notificationHub`;

    this.hubConnection = new HubConnectionBuilder()
      .withUrl(hubUrl, {
        accessTokenFactory: () => localStorage.getItem('access_token') ?? ''
      })
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Information)
      .build();

    this.hubConnection.start()
      .then(() => console.log('SignalR connected to', hubUrl))
      .catch(err => console.error('SignalR start error', err));

    this.hubConnection.on('ReceiveAlert', (payload: any) => {
      try {
        const item: AlertPayload = {
          ...payload,
          timestamp: new Date()
        };

        // Cập nhật State cho các component quan sát
        this.latestAlert.set(item);
        this.alertHistory.update(list => [item, ...list]);

        // Ensure the snackBar is opened inside Angular zone
        this.ngZone.run(() => {
          const msg = payload?.message || payload?.Message || JSON.stringify(payload);
          const actionRef = this.snackBar.open(msg, 'Xem', { duration: 6000 });

          // wire the View action to navigate to a related task or url when available
          const taskId = payload?.taskId || payload?.TaskId || payload?.task || payload?.Task;
          const url = payload?.url || payload?.Url;
          if (taskId || url) {
            actionRef.onAction().subscribe(() => {
              try {
                const path = taskId ? `/tasks/${taskId}` : url;
                this.router.navigateByUrl(path).catch(() => { (window.location as any).href = path; });
              } catch {
                try { (window.location as any).href = taskId ? `/tasks/${taskId}` : url; } catch { }
              }
            });
          }
        });
      } catch (e) {
        console.log('SignalR ReceiveAlert (fallback):', payload);
      }
    });
  }

  public stopConnection(): void {
    this.hubConnection?.stop().catch(err => console.error('SignalR stop error', err));
    this.hubConnection = undefined;
  }
}
