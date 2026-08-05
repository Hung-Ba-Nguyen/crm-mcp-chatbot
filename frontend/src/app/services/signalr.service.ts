import { Injectable } from '@angular/core';
import { HubConnection, HubConnectionBuilder, LogLevel } from '@microsoft/signalr';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SignalRService {
  private hubConnection?: HubConnection;

  public startConnection(): void {
    if (this.hubConnection) return;

    const base = environment.apiUrl.replace(/\/api\/?$/, '');
    const hubUrl = `${base}/notificationHub`;

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
      console.log('SignalR ReceiveAlert:', payload);
      // TODO: forward to toast/notification UI
    });
  }

  public stopConnection(): void {
    this.hubConnection?.stop().catch(err => console.error('SignalR stop error', err));
    this.hubConnection = undefined;
  }
}
