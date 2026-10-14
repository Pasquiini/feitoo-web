import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../auth/services/auth.service';
import { AccountService } from './account.service';

describe('AccountService', () => {
  const updateUser = vi.fn();
  let api: AccountService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { updateUser } },
      ],
    });
    api = TestBed.inject(AccountService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    http.verify();
    vi.clearAllMocks();
  });

  it('fetches one backend page without a preview request', () => {
    api.history(2).subscribe();
    const request = http.expectOne('http://localhost:8000/api/processings?page=2');
    expect(request.request.method).toBe('GET');
    request.flush({ data: [], meta: {} });
  });

  it('gets CSRF, patches only name and synchronizes header auth state', () => {
    api.profile('Maria').subscribe();
    http.expectOne('http://localhost:8000/sanctum/csrf-cookie').flush({});
    const request = http.expectOne('http://localhost:8000/api/account/profile');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ name: 'Maria' });
    const user = { id: 1, name: 'Maria' };
    request.flush({ data: user });
    expect(updateUser).toHaveBeenCalledWith(user);
  });

  it('gets CSRF and sends current password and confirmation', () => {
    const payload = {
      current_password: 'old-password-123',
      password: 'new-password-123',
      password_confirmation: 'new-password-123',
    };
    api.password(payload).subscribe();
    http.expectOne('http://localhost:8000/sanctum/csrf-cookie').flush({});
    const request = http.expectOne('http://localhost:8000/api/account/password');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual(payload);
    request.flush({ message: 'ok' });
  });
});
