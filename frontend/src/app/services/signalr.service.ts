import { Injectable, inject, NgZone } from '@angular/core';
import { Router } from '@angular/router';
import { HubConnection, HubConnectionBuilder, LogLevel } from '@microsoft/signalr';
import { environment } from '../../environments/environment';
import { MatSnackBar } from '@angular/material/snack-bar';

@Injectable({ providedIn: 'root' })
export class SignalRService {
  private hubConnection?: HubConnection;
  private snackBar = inject(MatSnackBar);
  private ngZone = inject(NgZone);
  private router = inject(Router);

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
        // Ensure the snackBar is opened inside Angular zone
        this.ngZone.run(() => {
          const msg = payload?.message || payload?.Message || JSON.stringify(payload);
          const actionRef = this.snackBar.open(msg, 'View', { duration: 6000 });

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
