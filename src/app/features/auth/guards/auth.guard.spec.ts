import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  provideRouter,
  Router,
  RouterStateSnapshot,
} from '@angular/router';
import { firstValueFrom, isObservable, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../services/auth.service';
import { authGuard } from './auth.guard';

describe('authGuard', () => {
  it.each(['authenticated', 'guest', 'restored', 'failed'])(
    'protects account for %s state and preserves return',
    async (state) => {
      const auth = {
        ready: signal(state === 'authenticated' || state === 'guest'),
        user: signal(state === 'authenticated' ? { id: 1 } : null),
        restore: vi.fn(() =>
          state === 'failed' ? throwError(() => new Error('offline')) : of({ id: 1 }),
        ),
      };
      TestBed.configureTestingModule({
        providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
      });
      const result = TestBed.runInInjectionContext(() =>
        authGuard({} as ActivatedRouteSnapshot, { url: '/conta' } as RouterStateSnapshot),
      );
      const value = isObservable(result) ? await firstValueFrom(result) : result;
      if (state === 'authenticated' || state === 'restored') expect(value).toBe(true);
      else
        expect(
          TestBed.inject(Router).serializeUrl(value as ReturnType<Router['createUrlTree']>),
        ).toBe('/login?returnTo=%2Fconta');
      TestBed.resetTestingModule();
    },
  );
});
