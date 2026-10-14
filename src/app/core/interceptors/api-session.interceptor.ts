import { HttpErrorResponse, HttpInterceptorFn, HttpXsrfTokenExtractor } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../features/auth/services/auth.service';

export const apiSessionInterceptor: HttpInterceptorFn = (request, next) => {
  const base = environment.apiUrl.replace(/\/$/, '');
  const isApi = request.url === base || request.url.startsWith(`${base}/`);
  if (!isApi && request.url !== environment.csrfUrl) return next(request);

  let headers = request.headers.set('Accept', 'application/json');
  // Angular's built-in XSRF handler skips absolute URLs; restrict this extension to our API.
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    const token = inject(HttpXsrfTokenExtractor).getToken();
    if (token) headers = headers.set('X-XSRF-TOKEN', token);
  }
  const auth = inject(AuthService);
  return next(request.clone({ headers, withCredentials: true })).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401) auth.clear();
      return throwError(() => error);
    }),
  );
};
