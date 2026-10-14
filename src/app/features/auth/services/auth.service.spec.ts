import { AnalyticsService } from '../../../core/analytics.service';
import {
  HttpClient,
  HttpXsrfTokenExtractor,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { apiSessionInterceptor } from '../../../core/interceptors/api-session.interceptor';
import { AuthUser } from '../models/auth';
import { AuthService } from './auth.service';

describe('AuthService and API session interceptor', () => {
  const user: AuthUser = {
    id: 1,
    name: 'Maria',
    email: 'maria@example.com',
    google_linked: false,
    has_password: true,
    created_at: '2026-10-08T12:00:00Z',
  };
  let auth: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiSessionInterceptor])),
        provideHttpClientTesting(),
        { provide: HttpXsrfTokenExtractor, useValue: { getToken: () => 'csrf-cookie-value' } },
      ],
    });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  function csrf(): void {
    const request = http.expectOne(environment.csrfUrl);
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.headers.has('X-XSRF-TOKEN')).toBe(false);
    request.flush(null, { status: 204, statusText: 'No Content' });
  }

  function login(): void {
    auth.login({ email: user.email, password: 'a-strong-password' }).subscribe();
    csrf();
    const request = http.expectOne(`${environment.apiUrl}/auth/login`);
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.headers.get('X-XSRF-TOKEN')).toBe('csrf-cookie-value');
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({ data: user });
  }

  it('logs in after CSRF initialization and keeps only user metadata', () => {
    const track = vi.spyOn(TestBed.inject(AnalyticsService), 'track');
    login();
    expect(track).not.toHaveBeenCalledWith('signup_completed', expect.anything());
    expect(auth.user()).toEqual(user);
    expect(auth.ready()).toBe(true);
  });

  it('tracks Google signup only when backend reports newly created account', () => {
    const track = vi.spyOn(TestBed.inject(AnalyticsService), 'track');
    auth.restore().subscribe();
    http.expectOne(`${environment.apiUrl}/me`).flush({ data: user, signup_method: 'google' });
    expect(track).toHaveBeenCalledWith('signup_completed', { auth_method: 'google' });
    auth.restore().subscribe();
    http.expectOne(`${environment.apiUrl}/me`).flush({ data: user });
    expect(track).toHaveBeenCalledTimes(1);
  });

  it('registers and logs out through the session', () => {
    const track = vi.spyOn(TestBed.inject(AnalyticsService), 'track');
    auth
      .register({
        name: user.name,
        email: user.email,
        password: 'a-strong-password',
        password_confirmation: 'a-strong-password',
      })
      .subscribe();
    csrf();
    http.expectOne(`${environment.apiUrl}/auth/register`).flush({ data: user });
    expect(track).toHaveBeenCalledWith('signup_completed', { auth_method: 'password' });
    expect(auth.user()).toEqual(user);
    auth.logout().subscribe();
    csrf();
    http.expectOne(`${environment.apiUrl}/auth/logout`).flush({ message: 'Sessão encerrada.' });
    expect(auth.user()).toBeNull();
  });

  it('restores a session and coalesces concurrent me requests', () => {
    auth.restore().subscribe();
    auth.restore().subscribe();
    http.expectOne(`${environment.apiUrl}/me`).flush({ data: user });
    expect(auth.user()).toEqual(user);
  });

  it('clears expired authentication after a backend 401', () => {
    login();
    auth.restore().subscribe((result) => expect(result).toBeNull());
    http
      .expectOne(`${environment.apiUrl}/me`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });
    expect(auth.user()).toBeNull();
  });

  it('does not treat backend outages as successful authentication', () => {
    auth.restore().subscribe({ error: (error: unknown) => expect(error).toBeTruthy() });
    http
      .expectOne(`${environment.apiUrl}/me`)
      .flush(null, { status: 503, statusText: 'Unavailable' });
    expect(auth.user()).toBeNull();
  });

  it('starts Google login through the backend with CSRF', () => {
    auth
      .startGoogle('login')
      .subscribe((response) => expect(response.redirect_url).toContain('accounts.google.com'));
    csrf();
    const request = http.expectOne(`${environment.apiUrl}/auth/google/start`);
    expect(request.request.body).toEqual({ intent: 'login' });
    request.flush({ redirect_url: 'https://accounts.google.com/o/oauth2/auth?state=test' });
  });

  it('rejects unexpected Google redirect destinations', () => {
    auth
      .startGoogle('login')
      .subscribe({ error: (error: unknown) => expect(error).toBeInstanceOf(Error) });
    csrf();
    http
      .expectOne(`${environment.apiUrl}/auth/google/start`)
      .flush({ redirect_url: 'https://evil.example' });
  });

  it('never attaches credentials or CSRF to unrelated hosts or API lookalikes', () => {
    const client = TestBed.inject(HttpClient);
    for (const url of [
      'https://unrelated.example/endpoint',
      `${environment.apiUrl}-other/endpoint`,
    ]) {
      client.post(url, {}).subscribe();
      const request = http.expectOne(url);
      expect(request.request.withCredentials).toBe(false);
      expect(request.request.headers.has('X-XSRF-TOKEN')).toBe(false);
      expect(request.request.headers.has('Authorization')).toBe(false);
      request.flush({});
    }
  });
});
