import { HttpInterceptorFn } from '@angular/common/http';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  try {
    const token = localStorage.getItem('access_token');
    if (token) {
      const authReq = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
      return next(authReq);
    }
  } catch (e) {
    // If anything goes wrong reading storage, continue without auth header
    console.error('authInterceptor error reading token', e);
  }

  return next(req);
};

export default authInterceptor;
