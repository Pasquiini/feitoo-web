import { FileSelectionService } from '../../processing/services/file-selection.service';
import { QuotationLocalStore } from '../../quotations/services/quotation-local.store';
import { AnalyticsService } from '../../../core/analytics.service';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { afterNextRender, DestroyRef, inject, Injectable, signal } from '@angular/core';
import {
  catchError,
  from,
  finalize,
  Observable,
  of,
  shareReplay,
  switchMap,
  tap,
  throwError,
  map,
} from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  AuthUser,
  GoogleStartResponse,
  LoginPayload,
  RegisterPayload,
  UserResponse,
} from '../models/auth';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly selection = inject(FileSelectionService);
  private readonly quotationLocal = inject(QuotationLocalStore);
  private readonly http = inject(HttpClient);
  private readonly analytics = inject(AnalyticsService);
  private readonly userState = signal<AuthUser | null>(null);
  private readonly readyState = signal(false);
  private restoreRequest: Observable<AuthUser | null> | null = null;
  readonly user = this.userState.asReadonly();
  readonly ready = this.readyState.asReadonly();

  constructor() {
    afterNextRender(() => this.quotationLocal.connect());
    const subscription = this.quotationLocal.changes.subscribe((event) => {
      if (event === 'accounts-cleared') this.clear();
    });
    inject(DestroyRef).onDestroy(() => subscription.unsubscribe());
  }

  restore(): Observable<AuthUser | null> {
    if (this.restoreRequest) return this.restoreRequest;
    this.restoreRequest = this.http.get<UserResponse>(`${environment.apiUrl}/me`).pipe(
      map((response) => {
        if (response.signup_method === 'google')
          this.analytics.funnel('signup_completed', { auth_method: 'google' });
        return response.data;
      }),
      tap((user) => this.userState.set(user)),
      catchError((error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status === 401) {
          this.clear();
          return of(null);
        }
        return throwError(() => error);
      }),
      finalize(() => {
        this.readyState.set(true);
        this.restoreRequest = null;
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    return this.restoreRequest;
  }

  login(payload: LoginPayload): Observable<UserResponse> {
    return this.csrf().pipe(
      switchMap(() => this.http.post<UserResponse>(`${environment.apiUrl}/auth/login`, payload)),
      tap((response) => {
        this.userState.set(response.data);
        this.readyState.set(true);
      }),
    );
  }

  register(payload: RegisterPayload): Observable<UserResponse> {
    this.analytics.track('signup_started', { auth_method: 'password' });
    return this.csrf().pipe(
      switchMap(() => this.http.post<UserResponse>(`${environment.apiUrl}/auth/register`, payload)),
      tap((response) => {
        this.analytics.funnel('signup_completed', { auth_method: 'password' });
        this.userState.set(response.data);
        this.readyState.set(true);
      }),
    );
  }

  logout(): Observable<unknown> {
    return this.csrf().pipe(
      switchMap(() => this.http.post<unknown>(`${environment.apiUrl}/auth/logout`, {})),
      tap(() => this.clear()),
      switchMap((response) =>
        from(this.quotationLocal.clearAccounts().catch(() => {})).pipe(map(() => response)),
      ),
    );
  }

  startGoogle(
    intent: 'login' | 'link',
    returnTo?:
      | '/docx-para-pdf'
      | '/conta'
      | '/analisar-xml'
      | '/organizar-xml'
      | '/xml-para-excel'
      | '/xml-para-pdf'
      | '/gerador-de-orcamentos'
      | '/produtos-dos-xmls',
  ): Observable<GoogleStartResponse> {
    const tool =
      returnTo === '/xml-para-excel'
        ? 'xml-to-excel'
        : returnTo === '/produtos-dos-xmls'
          ? 'products-from-xml'
          : null;
    return this.csrf().pipe(
      switchMap(() =>
        tool && this.selection.forTool(tool)().length
          ? from(this.selection.preserveForGoogle(tool))
          : of(undefined),
      ),
      switchMap(() =>
        this.http.post<GoogleStartResponse>(`${environment.apiUrl}/auth/google/start`, {
          intent,
          ...(returnTo ? { return_to: returnTo } : {}),
        }),
      ),
      tap((response) => {
        if (intent === 'login') this.analytics.track('signup_started', { auth_method: 'google' });
        const url = new URL(response.redirect_url);
        if (url.protocol !== 'https:' || url.hostname !== 'accounts.google.com') {
          throw new Error('Destino Google inválido.');
        }
      }),
    );
  }

  clear(): void {
    this.userState.set(null);
  }

  updateUser(user: AuthUser): void {
    this.userState.set(user);
  }

  private csrf(): Observable<unknown> {
    return this.http.get<unknown>(environment.csrfUrl);
  }
}
