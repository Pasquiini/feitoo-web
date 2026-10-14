import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const login = () =>
    router.createUrlTree(['/login'], { queryParams: { returnTo: state.url.split(/[?#]/)[0] } });
  if (auth.ready()) return auth.user() ? true : login();
  return auth.restore().pipe(
    map((user) => (user ? true : login())),
    catchError(() => of(login())),
  );
};
