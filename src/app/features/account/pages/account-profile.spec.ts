import { HttpErrorResponse, HttpHeaders, HttpResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, NavigationStart, provideRouter, Router } from '@angular/router';
import { of, Subject, throwError, Observable } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthUser } from '../../auth/models/auth';
import { AuthService } from '../../auth/services/auth.service';
import { ProcessingService } from '../../processing/services/processing.service';
import { HistoryProcessing, HistoryResponse } from '../models/account';
import { AccountService } from '../services/account.service';
import { AccountProfilePage } from './account-profile';
import {
  BillingService,
  SubscriptionSummary,
  Usage,
} from '../../processing/services/billing.service';

describe('AccountProfilePage', () => {
  const initialUser: AuthUser = {
    id: 1,
    name: 'Maria Silva',
    email: 'maria@example.com',
    google_linked: false,
    has_password: true,
    created_at: '2026-10-08T12:00:00Z',
  };
  const user = signal<AuthUser | null>(initialUser);
  const batch: HistoryProcessing = {
    id: 'batch',
    tool: 'xml-to-excel',
    status: 'completed',
    created_at: '2026-10-08T12:00:00Z',
    expires_at: '2099-01-01T12:00:00Z',
    files_count: 3,
    successful_files_count: 2,
    failed_files_count: 1,
    files_deleted: false,
    can_delete_files: true,
    result: { available: true, file_name: 'result.xlsx' },
  };
  const response: HistoryResponse = {
    data: [batch],
    meta: { current_page: 1, last_page: 1, per_page: 10, total: 1 },
  };
  const api = { history: vi.fn(), profile: vi.fn(), password: vi.fn() };
  const processingApi = { download: vi.fn(), deleteFiles: vi.fn() };
  const auth = { user, clear: vi.fn(() => user.set(null)), startGoogle: vi.fn() };
  let fixture: ComponentFixture<AccountProfilePage>;
  let page: AccountProfilePage;
  let element: HTMLElement;
  const queryParams = new Map<string, string>();
  const pending: SubscriptionSummary = {
    offer: { amount: 2990, currency: 'brl', per_processing: 250, daily: 500, available: true },
    subscription: {
      status: 'incomplete',
      current_period_end: null,
      cancel_at_period_end: false,
      grants_pro: false,
    },
  };
  beforeEach(async () => {
    vi.useFakeTimers();
    queryParams.clear();
    user.set(initialUser);
    api.history.mockReturnValue(of(response));
    api.profile.mockReturnValue(of({ data: { ...initialUser, name: 'Maria Nova' } }));
    api.password.mockReturnValue(of({ message: 'Senha atualizada.' }));
    processingApi.deleteFiles.mockReturnValue(of({ data: {} }));
    await TestBed.configureTestingModule({
      imports: [AccountProfilePage],
      providers: [
        provideRouter([]),
        {
          provide: BillingService,
          useValue: {
            usage: () =>
              of({
                data: {
                  plan: 'free',
                  limits: { per_processing: 20, daily: 50, used_today: 0, remaining_today: 50 },
                },
              }),
            subscription: () =>
              of({
                data: {
                  offer: {
                    amount: 2990,
                    currency: 'brl',
                    per_processing: 250,
                    daily: 500,
                    available: true,
                  },
                  subscription: null,
                },
              }),
            proCheckout: () => of({ data: { url: 'https://checkout.stripe.com/test' } }),
            portal: () => of({ data: { url: 'https://billing.stripe.com/test' } }),
            redirect: vi.fn(),
            portalRedirect: vi.fn(),
            purchases: () => of({ data: [], meta: { current_page: 1, last_page: 1 } }),
          },
        },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: queryParams } } },
        { provide: AuthService, useValue: auth },
        { provide: AccountService, useValue: api },
        { provide: ProcessingService, useValue: processingApi },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AccountProfilePage);
    page = fixture.componentInstance;
    element = fixture.nativeElement;
  });

  it('saves a trimmed name and handles invalid names and API errors', () => {
    page.profileForm.setValue({ name: '  Maria Nova  ' });
    page.saveProfile();
    expect(api.profile).toHaveBeenCalledWith('Maria Nova');
    expect(page.profileMessage()).toBe('Nome atualizado.');
    page.profileForm.setValue({ name: '   ' });
    page.saveProfile();
    expect(api.profile).toHaveBeenCalledTimes(1);
    expect(page.nameError()).toContain('Informe');
    api.profile.mockReturnValue(throwError(() => new Error('offline')));
    page.profileForm.setValue({ name: 'Outra Maria' });
    page.saveProfile();
    expect(page.profileError()).toContain('Não foi possível salvar');
    expect(page.profileMessage()).toBe('');
  });

  it('disables profile form while saving and prevents duplicate submission', () => {
    const pending = new Subject();
    api.profile.mockReturnValue(pending);
    page.saveProfile();
    page.saveProfile();
    fixture.detectChanges();
    expect(api.profile).toHaveBeenCalledOnce();
    expect(element.querySelector<HTMLFieldSetElement>('form fieldset')!.disabled).toBe(true);
    expect(element.textContent).toContain('Salvando…');
    pending.complete();
    expect(page.saving()).toBe(false);
  });

  it('validates password confirmation, handles incorrect current password and clears passwords on success', () => {
    page.passwordForm.setValue({
      current_password: 'old-password-123',
      password: 'new-password-123',
      password_confirmation: 'mismatch',
    });
    page.changePassword();
    expect(api.password).not.toHaveBeenCalled();
    expect(page.passwordFieldError('password_confirmation')).toContain('iguais');
    page.passwordForm.controls.password_confirmation.setValue('new-password-123');
    api.password.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 422,
            error: { errors: { current_password: ['incorrect'] } },
          }),
      ),
    );
    page.changePassword();
    expect(page.passwordError()).toBe('A senha atual não confere.');
    api.password.mockReturnValue(of({ message: 'ok' }));
    page.changePassword();
    expect(page.passwordForm.controls.password.value).toBe('');
    expect(page.passwordMessage()).toContain('Senha atualizada');
  });

  it('shows Google-only access without a password form and handles link errors', () => {
    user.set({ ...initialUser, has_password: false, google_linked: true });
    fixture.detectChanges();
    expect(element.querySelector('#account-current-password')).toBeNull();
    expect(element.textContent).toContain('Você entra com Google');
    expect(element.textContent).toContain('GoogleConectado');
    page.changePassword();
    expect(api.password).not.toHaveBeenCalled();
    user.set(initialUser);
    auth.startGoogle.mockReturnValue(throwError(() => new Error('unavailable')));
    page.linkGoogle();
    expect(auth.startGoogle).toHaveBeenCalledWith('link', '/conta/perfil');
    expect(page.googleError()).toContain('Google indisponível');
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.clearAllMocks();
  });
});
