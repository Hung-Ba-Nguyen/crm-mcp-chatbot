import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpEvent } from '@angular/common/http';
import { Observable } from 'rxjs';

// Attach Bearer token from localStorage to outgoing HTTP requests
export const authInterceptor: HttpInterceptorFn = (req: HttpRequest<unknown>, next: HttpHandlerFn): Observable<HttpEvent<unknown>> => {
  try {
    const token = localStorage.getItem('access_token');
    if (token) {
      // If Authorization header is already present, do not overwrite
      if (req.headers.has('Authorization')) {
        return next(req);
      }

      const authReq = req.clone({
        headers: req.headers.set('Authorization', `Bearer ${token}`)
      });
      return next(authReq);
    }
  } catch (e) {
    // localStorage may not be available in some environments; fall back to original request
    console.warn('authInterceptor error reading token', e);
  }

  return next(req);
};
