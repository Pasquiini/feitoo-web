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
import { AccountPage } from './account-page';
import {
  BillingService,
  SubscriptionSummary,
  Usage,
} from '../../processing/services/billing.service';

describe('AccountPage', () => {
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
  let fixture: ComponentFixture<AccountPage>;
  let page: AccountPage;
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
  function beginConfirmation(
    response: Observable<{ data: SubscriptionSummary }> = of({ data: pending }),
  ) {
    fixture.destroy();
    queryParams.set('subscription', 'confirming');
    const request = vi
      .spyOn(TestBed.inject(BillingService), 'subscription')
      .mockReturnValue(response);
    fixture = TestBed.createComponent(AccountPage);
    page = fixture.componentInstance;
    element = fixture.nativeElement;
    fixture.detectChanges();
    return request;
  }

  beforeEach(async () => {
    vi.useFakeTimers();
    queryParams.clear();
    user.set(initialUser);
    api.history.mockReturnValue(of(response));
    api.profile.mockReturnValue(of({ data: { ...initialUser, name: 'Maria Nova' } }));
    api.password.mockReturnValue(of({ message: 'Senha atualizada.' }));
    processingApi.deleteFiles.mockReturnValue(of({ data: {} }));
    await TestBed.configureTestingModule({
      imports: [AccountPage],
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
    fixture = TestBed.createComponent(AccountPage);
    page = fixture.componentInstance;
    element = fixture.nativeElement;
  });

  it('shows a strong Free offer and accessible daily usage', () => {
    fixture.detectChanges();
    expect(element.textContent).toContain('Feitoo Free');
    expect(element.textContent).toContain('Assinar Feitoo Pro');
    expect(element.querySelector('progress')?.getAttribute('max')).toBe('50');
    expect(element.querySelector('progress')?.getAttribute('aria-valuetext')).toContain('50');
    const details = element.querySelector<HTMLDetailsElement>('.password-disclosure')!;
    expect(details.open).toBe(false);
    details.querySelector('summary')!.click();
    expect(details.open).toBe(true);
  });
  it.each([4, 45, 50])('describes daily usage at %s XMLs without relying on color', (used) => {
    page.usage.set({
      plan: 'free',
      limits: {
        daily: 50,
        per_processing: 20,
        used_today: used,
        remaining_today: 50 - used,
        resets_at: '',
      },
    });
    fixture.detectChanges();
    expect(element.textContent).toContain(
      used === 50
        ? 'Limite de hoje atingido'
        : used === 45
          ? 'Próximo do limite de hoje'
          : 'Dentro do limite de hoje',
    );
  });
  it.each([
    ['active', true, false, 'Ativo'],
    ['active', true, true, 'Cancelamento agendado'],
    ['incomplete', false, false, 'Pagamento pendente'],
    ['past_due', false, false, 'Problema no pagamento'],
    ['unpaid', false, false, 'Problema no pagamento'],
    ['canceled', false, false, 'Cancelado'],
  ])('presents subscription %s in plain language', (status, pro, cancel, label) => {
    page.subscription.set({
      ...pending,
      subscription: {
        status: status as string,
        grants_pro: pro as boolean,
        cancel_at_period_end: cancel as boolean,
        current_period_end: '2026-11-10T12:00:00Z',
      },
    });
    page.usage.set({
      plan: pro ? 'pro' : 'free',
      limits: {
        daily: pro ? 500 : 50,
        per_processing: pro ? 250 : 20,
        used_today: 4,
        remaining_today: pro ? 496 : 46,
        resets_at: '',
      },
    });
    fixture.detectChanges();
    expect(element.textContent).toContain(label);
    if (cancel)
      expect(element.textContent).toContain('Depois disso, sua conta voltará ao plano Free.');
    if (status === 'past_due' || status === 'unpaid')
      expect(element.textContent).toContain('Atualizar pagamento');
    if (pro) expect(element.textContent).toContain('24h de retenção');
  });

  it('keeps the account sections in reading order', () => {
    fixture.detectChanges();
    expect([...element.querySelectorAll('h2, #usage-title')].slice(0, 6).map((h) => h.id)).toEqual([
      'plan-title',
      'usage-title',
      'purchases-title',
      'profile-title',
      'security-title',
      'history-title',
    ]);
  });

  it('does not show an error count for a fully successful processing', () => {
    page.history.set([{ ...batch, successful_files_count: 3, failed_files_count: 0 }]);
    fixture.detectChanges();
    expect(element.querySelector('.history-counts')?.textContent).not.toContain('0 com erro');
  });

  it.each([
    ['completed', false, '8742.19', 'R$ 8.742,19'],
    ['expired', false, '8742.19', 'R$ 8.742,19'],
    ['expired', true, '8742.19', 'R$ 8.742,19'],
    ['completed', false, '9007199254740993.29', 'R$ 9.007.199.254.740.993,29'],
    ['completed', false, '0.00', 'R$ 0,00'],
  ] as const)(
    'renders a persisted fiscal total for %s (deleted: %s)',
    (status, deleted, value, formatted) => {
      page.history.set([{ ...batch, status, files_deleted: deleted, total_value: value }]);
      fixture.detectChanges();
      expect(element.querySelector('.history-info')?.textContent).toContain(
        `Total fiscal: ${formatted}`,
      );
    },
  );

  it.each([undefined, null])('omits unavailable fiscal totals (%s)', (value) => {
    page.history.set([{ ...batch, total_value: value }]);
    fixture.detectChanges();
    expect(element.querySelector('.history-info')?.textContent).not.toContain('Total fiscal:');
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('queries immediately then once every three seconds, without manual duplicate calls', () => {
    const request = beginConfirmation();
    expect(request).toHaveBeenCalledTimes(1);
    const manual = [...element.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
      b.textContent?.includes('Consultar confirmação'),
    )!;
    expect(manual.disabled).toBe(true);
    manual.click();
    page.loadSubscription();
    expect(request).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2999);
    expect(request).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(request).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(3000);
    expect(request).toHaveBeenCalledTimes(3);
  });

  it('times out after thirty seconds and ten requests; manual retry performs only one query', () => {
    const request = beginConfirmation();
    const history = api.history.mock.calls.length;
    const purchases = vi.spyOn(TestBed.inject(BillingService), 'purchases');
    vi.advanceTimersByTime(30000);
    fixture.detectChanges();
    expect(request).toHaveBeenCalledTimes(10);
    expect(page.subscriptionPollingActive()).toBe(false);
    expect(element.textContent).toContain('Seu pagamento ainda está sendo confirmado');
    expect(api.history).toHaveBeenCalledTimes(history);
    expect(purchases).not.toHaveBeenCalled();
    const manual = [...element.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
      b.textContent?.includes('Consultar novamente'),
    )!;
    expect(manual.disabled).toBe(false);
    manual.click();
    expect(request).toHaveBeenCalledTimes(11);
    vi.advanceTimersByTime(60000);
    expect(request).toHaveBeenCalledTimes(11);
  });

  it.each(['canceled', 'past_due', 'unpaid', 'incomplete_expired', 'paused', 'trialing', 'active'])(
    'stops immediately at terminal state %s',
    (status) => {
      const request = beginConfirmation(
        of({ data: { ...pending, subscription: { ...pending.subscription!, status } } }),
      );
      expect(page.subscriptionPollingActive()).toBe(false);
      expect(page.confirmingSubscription()).toBe(false);
      vi.advanceTimersByTime(60000);
      expect(request).toHaveBeenCalledTimes(1);
    },
  );

  it('activation stops polling and refreshes plan, limits, usage, date and CTA once', () => {
    const request = beginConfirmation();
    const billing = TestBed.inject(BillingService);
    const usage = vi.spyOn(billing, 'usage').mockReturnValue(
      of({
        data: {
          plan: 'pro',
          limits: {
            per_processing: 250,
            daily: 500,
            used_today: 50,
            remaining_today: 450,
            resets_at: '2099-01-01',
          },
        },
      }),
    );
    request.mockReturnValue(
      of({
        data: {
          ...pending,
          subscription: {
            ...pending.subscription!,
            status: 'active',
            grants_pro: true,
            current_period_end: '2026-11-09T12:00:00Z',
          },
        },
      }),
    );
    vi.advanceTimersByTime(3000);
    fixture.detectChanges();
    expect(element.textContent).toContain('Feitoo Pro ativado.');
    expect(element.textContent).toContain('50 / 500');
    expect(element.textContent).toContain('250 XMLs por');
    expect(element.textContent).toContain('09/11/2026');
    expect(element.textContent).not.toContain('Assinar Feitoo Pro');
    vi.advanceTimersByTime(60000);
    expect(request).toHaveBeenCalledTimes(2);
    expect(usage).toHaveBeenCalledTimes(1);
  });

  it('activation replaces an unfinished initial usage request instead of leaving stale Free limits', () => {
    const billing = TestBed.inject(BillingService);
    const initialUsage = new Subject<{ data: Usage }>();
    const usage = vi.spyOn(billing, 'usage').mockReturnValue(initialUsage);
    const request = beginConfirmation();
    expect(initialUsage.observed).toBe(true);
    usage.mockReturnValue(
      of({
        data: {
          plan: 'pro',
          limits: {
            per_processing: 250,
            daily: 500,
            used_today: 50,
            remaining_today: 450,
            resets_at: '2099-01-01',
          },
        },
      }),
    );
    request.mockReturnValue(
      of({
        data: {
          ...pending,
          subscription: { ...pending.subscription!, status: 'active', grants_pro: true },
        },
      }),
    );
    vi.advanceTimersByTime(3000);
    expect(initialUsage.observed).toBe(false);
    expect(usage).toHaveBeenCalledTimes(2);
    expect(page.usage()?.plan).toBe('pro');
  });

  it('429 stops polling and respects Retry-After before allowing a single manual retry', () => {
    const request = beginConfirmation(
      throwError(
        () =>
          new HttpErrorResponse({ status: 429, headers: new HttpHeaders({ 'Retry-After': '8' }) }),
      ),
    );
    expect(page.subscriptionPollingActive()).toBe(false);
    expect(element.textContent).toContain('Estamos consultando a confirmação com muita frequência');
    page.loadSubscription();
    vi.advanceTimersByTime(7999);
    expect(request).toHaveBeenCalledTimes(1);
    expect(page.subscriptionRetryBlocked()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(page.subscriptionRetryBlocked()).toBe(false);
    request.mockReturnValue(of({ data: pending }));
    page.loadSubscription();
    vi.advanceTimersByTime(60000);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('does not overlap slow requests, cancels in-flight work and timers on destruction', () => {
    const response = new Subject<{ data: SubscriptionSummary }>();
    const request = beginConfirmation(response);
    vi.advanceTimersByTime(10000);
    page.loadSubscription();
    expect(request).toHaveBeenCalledTimes(1);
    expect(response.observed).toBe(true);
    fixture.destroy();
    expect(response.observed).toBe(false);
    vi.advanceTimersByTime(60000);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('cancels pending polling as soon as navigation starts', () => {
    const navigation = new Subject<NavigationStart>();
    vi.spyOn(TestBed.inject(Router), 'events', 'get').mockReturnValue(navigation);
    const request = beginConfirmation();
    navigation.next(new NavigationStart(1, '/xml-para-excel'));
    vi.advanceTimersByTime(60000);
    expect(request).toHaveBeenCalledTimes(1);
    expect(page.subscriptionPollingActive()).toBe(false);
  });

  it('cancels pending polling when the user stops confirmation', () => {
    const request = beginConfirmation();
    page.cancelSubscriptionConfirmation();
    vi.advanceTimersByTime(60000);
    expect(request).toHaveBeenCalledTimes(1);
    expect(page.subscriptionPollingActive()).toBe(false);
  });

  it('offers configurable Pro checkout to Free and opens Stripe checkout', () => {
    fixture.detectChanges();
    expect(element.textContent).toContain('Assinar Feitoo Pro');
    expect(element.textContent).toContain('29,90');
    page.openSubscription();
    expect(TestBed.inject(BillingService).redirect).toHaveBeenCalledWith(
      'https://checkout.stripe.com/test',
    );
  });

  it('shows active Pro, next billing, scheduled cancellation and payment problem with portal', () => {
    const billing = TestBed.inject(BillingService);
    const sub = {
      status: 'active',
      current_period_end: '2026-11-09T12:00:00Z',
      cancel_at_period_end: false,
      grants_pro: true,
    };
    page.usage.update((u) => (u ? { ...u, plan: 'pro' } : u));
    page.subscription.update((s) => (s ? { ...s, subscription: sub } : s));
    fixture.detectChanges();
    expect(element.textContent).toContain('Ativo');
    expect(element.textContent).toContain('09/11/2026');
    expect(element.textContent).not.toContain('Assinar Feitoo Pro');
    page.subscription.update((s) =>
      s ? { ...s, subscription: { ...sub, cancel_at_period_end: true } } : s,
    );
    fixture.detectChanges();
    expect(element.textContent).toContain('Seu Pro ficará ativo até');
    page.subscription.update((s) =>
      s ? { ...s, subscription: { ...sub, status: 'past_due', grants_pro: false } } : s,
    );
    fixture.detectChanges();
    expect(element.textContent).toContain('Há um problema com o pagamento');
    page.openSubscription(true);
    expect(billing.portalRedirect).toHaveBeenCalledWith('https://billing.stripe.com/test');
  });

  it('waits for backend confirmation and refreshes entitlement only after active subscription', () => {
    const billing = TestBed.inject(BillingService);
    page.confirmingSubscription.set(true);
    fixture.detectChanges();
    expect(element.textContent).toContain('Consultar novamente');
    page.loadSubscription();
    expect(page.confirmingSubscription()).toBe(true);
    vi.spyOn(billing, 'subscription').mockReturnValue(
      of({
        data: {
          offer: {
            amount: 2990,
            currency: 'brl',
            per_processing: 250,
            daily: 500,
            available: true,
          },
          subscription: {
            status: 'active',
            current_period_end: '2026-11-09T12:00:00Z',
            cancel_at_period_end: false,
            grants_pro: true,
          },
        },
      }),
    );
    const usage = vi.spyOn(page, 'loadUsage');
    page.loadSubscription();
    expect(page.confirmingSubscription()).toBe(false);
    expect(usage).toHaveBeenCalledOnce();
  });

  it('loads account data, readonly email, password and partial history with semantic labels', () => {
    fixture.detectChanges();
    expect(api.history).toHaveBeenCalledWith(1);
    expect(element.querySelector<HTMLInputElement>('#account-name')!.value).toBe('Maria Silva');
    expect(element.querySelector<HTMLInputElement>('#account-email')!.readOnly).toBe(true);
    expect(element.textContent).toContain('GoogleNão conectado');
    expect(element.textContent?.replace(/\s+/g, ' ')).toContain(
      '3 XMLs · 2 concluídos · 1 com erro',
    );
    expect(element.textContent).toContain('Baixar Excel');
    expect(element.querySelector('table')).toBeNull();
    for (const input of element.querySelectorAll('input')) {
      expect(element.querySelector(`label[for="${input.id}"]`)).not.toBeNull();
    }
  });

  it('renders usage and paginated purchase history with human statuses and safe resumption', () => {
    const billing = TestBed.inject(BillingService);
    vi.spyOn(billing, 'purchases').mockReturnValue(
      of({
        data: [
          {
            id: 'purchase',
            processing_id: 'batch',
            tool: 'xml-to-excel',
            package_code: 'xml_250',
            files_count: 147,
            files_limit: 250,
            amount: 690,
            currency: 'brl',
            status: 'paid',
            consumed: false,
            can_resume_processing: true,
            paid_at: '2026-10-08',
            expires_at: '2099-01-01',
            created_at: '2026-10-08',
          },
        ],
        meta: { current_page: 2, last_page: 2 },
      }),
    );
    page.loadPurchases(2);
    fixture.detectChanges();
    expect(page.purchasePage()).toBe(2);
    expect(element.textContent).toContain('Feitoo Free');
    expect(element.textContent).toContain('147 XMLs');
    expect(element.textContent).toContain('Pago');
    expect(element.querySelector('a[href*="processing=batch"]')).not.toBeNull();
    expect(element.textContent).not.toContain('cs_test_');
  });

  it('handles purchase loading and errors without hiding account data', () => {
    const billing = TestBed.inject(BillingService);
    const pending = new Subject<
      ReturnType<BillingService['purchases']> extends import('rxjs').Observable<infer T> ? T : never
    >();
    vi.spyOn(billing, 'purchases').mockReturnValue(pending);
    page.loadPurchases();
    fixture.detectChanges();
    expect(page.purchasesLoading()).toBe(true);
    expect(element.textContent).toContain('Carregando compras');
    pending.error(new Error('offline'));
    fixture.detectChanges();
    expect(page.purchasesLoading()).toBe(false);
    expect(element.textContent).toContain('Não foi possível consultar suas compras');
    expect(element.querySelector('#account-name')).not.toBeNull();
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
    expect(auth.startGoogle).toHaveBeenCalledWith('link');
    expect(page.googleError()).toContain('Google indisponível');
  });

  it('loads only the requested page and shows history loading and retry states', () => {
    const pending = new Subject<HistoryResponse>();
    api.history.mockReturnValue(pending);
    page.loadHistory(2);
    fixture.detectChanges();
    expect(element.textContent).toContain('Carregando seus processamentos');
    page.loadHistory(2);
    expect(api.history).toHaveBeenCalledTimes(2);
    pending.next({
      ...response,
      meta: { ...response.meta, current_page: 2, last_page: 2, total: 12 },
    });
    pending.complete();
    fixture.detectChanges();
    expect(element.textContent).toContain('Página 2 de 2');
    expect(
      [...element.querySelectorAll<HTMLButtonElement>('.history-pagination button')][1].disabled,
    ).toBe(true);
    api.history.mockReturnValue(throwError(() => new Error('offline')));
    page.loadHistory();
    fixture.detectChanges();
    expect(element.textContent).toContain('Não foi possível carregar');
  });

  it('shows a useful empty state', () => {
    api.history.mockReturnValue(
      of({ data: [], meta: { current_page: 1, last_page: 1, total: 0, per_page: 10 } }),
    );
    page.loadHistory();
    fixture.detectChanges();
    expect(element.textContent).toContain('Você ainda não fez nenhum processamento');
    expect(element.querySelector('.empty-history a')!.getAttribute('href')).toBe('/xml-para-excel');
  });

  it('downloads through the private endpoint and releases the object URL', async () => {
    processingApi.download.mockReturnValue(
      of(
        new HttpResponse({
          body: new Blob(['xlsx']),
          headers: new HttpHeaders({
            'Content-Disposition': 'attachment; filename="private.xlsx"',
          }),
        }),
      ),
    );
    const create = vi.fn(() => 'blob:private');
    const revoke = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: create });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      expect(this.download).toBe('private.xlsx');
    });
    page.download(batch);
    expect(processingApi.download).toHaveBeenCalledWith('batch');
    await vi.advanceTimersByTimeAsync(1000);
    expect(revoke).toHaveBeenCalledWith('blob:private');
    click.mockRestore();
  });

  it('hides download for expired or deleted results and updates expiry without network requests', async () => {
    const short = { ...batch, expires_at: new Date(Date.now() + 1000).toISOString() };
    page.history.set([short]);
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(15000);
    fixture.detectChanges();
    expect(element.textContent).toContain('Resultado expirado');
    expect(element.textContent).not.toContain('Baixar Excel');
    page.download(short);
    expect(processingApi.download).not.toHaveBeenCalled();
    page.history.set([{ ...batch, files_deleted: true, can_delete_files: false }]);
    fixture.detectChanges();
    expect(element.textContent).toContain('Arquivos excluídos');
    expect(element.textContent).not.toContain('Excluir arquivos');
    expect(api.history).toHaveBeenCalledOnce();
  });

  it('requires explicit deletion confirmation, permits cancellation, preserves the history row', () => {
    fixture.detectChanges();
    const remove = [...element.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent?.trim() === 'Excluir arquivos',
    )!;
    remove.click();
    fixture.detectChanges();
    expect(processingApi.deleteFiles).not.toHaveBeenCalled();
    expect(element.textContent).toContain('Esta ação não pode ser desfeita');
    page.cancelDelete();
    expect(page.confirming()).toBeNull();
    fixture.detectChanges();
    remove.click();
    fixture.detectChanges();
    page.deleteFiles();
    fixture.detectChanges();
    expect(processingApi.deleteFiles).toHaveBeenCalledWith('batch');
    expect(page.history()).toHaveLength(1);
    expect(page.history()[0].files_deleted).toBe(true);
    expect(element.textContent).toContain('O registro permanece no histórico');
    expect(element.textContent).not.toContain('Baixar Excel');
  });

  it('keeps confirmation and existing files after deletion failure', () => {
    processingApi.deleteFiles.mockReturnValue(throwError(() => new Error('offline')));
    fixture.detectChanges();
    [...element.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === 'Excluir arquivos')!
      .click();
    page.deleteFiles();
    expect(page.confirming()?.id).toBe('batch');
    expect(page.history()[0].files_deleted).toBe(false);
    expect(page.historyError()).toContain('Não foi possível excluir');
  });

  it('redirects an expired session back to login with account return', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    api.history.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 401 })));
    page.loadHistory();
    expect(auth.clear).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/login'], { queryParams: { returnTo: '/conta' } });
  });
});
