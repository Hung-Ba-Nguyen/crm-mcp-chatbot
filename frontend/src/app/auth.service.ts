import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../environments/environment';
import { map } from 'rxjs/operators';
import { Observable } from 'rxjs';

export interface LoginPayload { email: string; password: string }

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http: HttpClient;
  private readonly tokenKey = 'access_token';
  private readonly expiresKey = 'expires_at';

  constructor(http: HttpClient) {
    this.http = http;
  }

  login(payload: LoginPayload): Observable<any> {
    return this.http.post<any>(`${environment.apiUrl}/users/login`, payload).pipe(
      map(res => {
        if (res && res.accessToken || res.AccessToken) {
          const token = res.accessToken ?? res.AccessToken;
          const expires = res.expiresAtUtc ? new Date(res.expiresAtUtc).getTime() : (Date.now() + 60*60*1000);
          localStorage.setItem(this.tokenKey, token);
          localStorage.setItem(this.expiresKey, expires.toString());
        }
        return res;
      })
    );
  }

  logout(): void {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.expiresKey);
  }

  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  isLoggedIn(): boolean {
    const token = this.getToken();
    if (!token) return false;
    const exp = localStorage.getItem(this.expiresKey);
    if (!exp) return true;
    const expNum = parseInt(exp, 10);
    return Date.now() < expNum;
  }
}
