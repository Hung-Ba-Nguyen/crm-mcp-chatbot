import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpEvent } from '@angular/common/http';
import { Observable, throwError, BehaviorSubject } from 'rxjs';
import { catchError, filter, take, switchMap, finalize } from 'rxjs/operators';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';

// A simple refresh-lock to avoid multiple parallel refresh calls
let isRefreshing = false;
const refreshTokenSubject = new BehaviorSubject<string | null>(null);

// Attach Bearer token and handle 401 via refresh token flow
export const authInterceptor: HttpInterceptorFn = (req: HttpRequest<unknown>, next: HttpHandlerFn): Observable<HttpEvent<unknown>> => {
  const authService = inject(AuthService);
  const router = inject(Router);

  try {
    const token = authService.getToken() ?? localStorage.getItem('access_token');
    if (token && !req.headers.has('Authorization')) {
      req = req.clone({ headers: req.headers.set('Authorization', `Bearer ${token}`) });
    }
  } catch (e) {
    console.warn('authInterceptor error reading token', e);
  }

  return next(req).pipe(
    catchError((err: any) => {
      if (err && err.status === 401) {
        // If not already refreshing, start refresh
        if (!isRefreshing) {
          isRefreshing = true;
          refreshTokenSubject.next(null);

          return authService.refreshToken().pipe(
            switchMap((res: any) => {
              const newToken = authService.getToken();
              refreshTokenSubject.next(newToken);
              const cloned = newToken ? req.clone({ headers: req.headers.set('Authorization', `Bearer ${newToken}`) }) : req;
              return next(cloned);
            }),
            finalize(() => {
              isRefreshing = false;
            }),
            catchError((refreshErr) => {
              try { authService.logout(); } catch { }
              try { router.navigate(['/login']); } catch { }
              return throwError(() => refreshErr);
            })
          );
        }

        // If refresh is already in progress, wait for it to finish and then retry
        return refreshTokenSubject.pipe(
          filter(token => token != null),
          take(1),
          switchMap((token) => {
            const cloned = token ? req.clone({ headers: req.headers.set('Authorization', `Bearer ${token}`) }) : req;
            return next(cloned);
          })
        );
      }

      return throwError(() => err);
    })
  );
};
