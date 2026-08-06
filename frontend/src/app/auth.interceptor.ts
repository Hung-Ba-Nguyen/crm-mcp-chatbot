import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpEvent } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';

// Attach Bearer token from localStorage to outgoing HTTP requests
export const authInterceptor: HttpInterceptorFn = (req: HttpRequest<unknown>, next: HttpHandlerFn): Observable<HttpEvent<unknown>> => {
  const authService = inject(AuthService);
  const router = inject(Router);

  try {
    const token = authService.getToken() ?? localStorage.getItem('access_token');
    if (token) {
      if (!req.headers.has('Authorization')) {
        req = req.clone({ headers: req.headers.set('Authorization', `Bearer ${token}`) });
      }
    }
  } catch (e) {
    console.warn('authInterceptor error reading token', e);
  }

  return next(req).pipe(
    catchError((err: any) => {
      if (err && err.status === 401) {
        try {
          authService.logout();
        } catch { }
        try { router.navigate(['/login']); } catch { }
      }
      return throwError(() => err);
    })
  );
};
