import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.ready()) return auth.user() ? router.createUrlTree(['/']) : true;
  return auth.restore().pipe(
    map((user) => (user ? router.createUrlTree(['/']) : true)),
    catchError(() => of(true)),
  );
};
