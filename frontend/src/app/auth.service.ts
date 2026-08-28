import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../environments/environment';
import { map, tap } from 'rxjs/operators';
import { Observable, throwError } from 'rxjs';

export interface LoginPayload { email: string; password: string }

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http: HttpClient;
  private readonly tokenKey = 'access_token';
  private readonly refreshKey = 'refresh_token';
  private readonly expiresKey = 'expires_at';

  constructor(http: HttpClient) {
    this.http = http;
  }

  login(payload: LoginPayload): Observable<any> {
    return this.http.post<any>(`${environment.apiUrl}/users/login`, payload).pipe(
      tap(res => {
        const token = res?.accessToken ?? res?.AccessToken;
        const refresh = res?.refreshToken ?? res?.RefreshToken;
        const expires = res?.expiresAtUtc ? new Date(res.expiresAtUtc).getTime() : (Date.now() + 60 * 60 * 1000);
        if (token) {
          this.saveTokens(token, refresh ?? null, expires);
        }
      })
    );
  }

  /** Return the stored refresh token or null */
  getRefreshToken(): string | null {
    return localStorage.getItem(this.refreshKey);
  }

  /** Persist access + refresh tokens (and optional expires timestamp) */
  saveTokens(accessToken: string, refreshToken: string | null, expiresAtMs?: number | null): void {
    try {
      localStorage.setItem(this.tokenKey, accessToken);
      if (refreshToken) localStorage.setItem(this.refreshKey, refreshToken);
      if (expiresAtMs) localStorage.setItem(this.expiresKey, expiresAtMs.toString());
    } catch {
      // ignore localStorage failures
    }
  }

  /** Remove tokens from storage */
  clearTokens(): void {
    try {
      localStorage.removeItem(this.tokenKey);
      localStorage.removeItem(this.refreshKey);
      localStorage.removeItem(this.expiresKey);
    } catch { }
  }

  /** Call backend refresh endpoint to rotate tokens. Returns AuthResponse
   *  Expects backend route: POST /api/users/refresh with body { refreshToken }
   */
  refreshToken(): Observable<any> {
    const refresh = this.getRefreshToken();
    if (!refresh) return throwError(() => new Error('No refresh token'));

    return this.http.post<any>(`${environment.apiUrl}/users/refresh`, { refreshToken: refresh }).pipe(
      tap(res => {
        const newAccess = res?.accessToken ?? res?.AccessToken;
        const newRefresh = res?.refreshToken ?? res?.RefreshToken;
        const expires = res?.expiresAtUtc ? new Date(res.expiresAtUtc).getTime() : null;
        if (newAccess) this.saveTokens(newAccess, newRefresh ?? null, expires);
      })
    );
  }

  logout(): void {
    this.clearTokens();
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
