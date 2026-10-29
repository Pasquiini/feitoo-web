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
import { AccountSubscriptionPage } from './account-subscription';
import { AccountBenefits } from '../services/account-benefits';
import {
  BillingService,
  SubscriptionSummary,
  Usage,
} from '../../processing/services/billing.service';

describe('AccountSubscriptionPage', () => {
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
  let fixture: ComponentFixture<AccountSubscriptionPage>;
  let page: AccountSubscriptionPage;
  let element: HTMLElement;
  const queryParams = new Map<string, string>();
  const pending: SubscriptionSummary = {
    state: 'checkout_pending',
    actions: { checkout: false, resume_checkout: true, portal: true, refresh: true },
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
    fixture = TestBed.createComponent(AccountSubscriptionPage);
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
      imports: [AccountSubscriptionPage],
      providers: [
        provideRouter([]),
        {
          provide: AccountBenefits,
          useValue: {
            usage: signal(null),
            error: signal(''),
            loading: signal(false),
            refresh: vi.fn(),
          },
        },
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
                  state: 'free',
                  actions: { checkout: true, resume_checkout: false, portal: false, refresh: true },
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
    fixture = TestBed.createComponent(AccountSubscriptionPage);
    page = fixture.componentInstance;
    element = fixture.nativeElement;
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
      b.textContent?.includes('Consultar confirmação'),
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

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.clearAllMocks();
  });
  it('uses backend capabilities for a local attempt and never offers a duplicate remote subscription', () => {
    page.subscription.set(pending);
    fixture.detectChanges();
    expect(element.textContent).toContain('Retomar assinatura');
    page.openSubscription();
    expect(TestBed.inject(BillingService).redirect).toHaveBeenCalled();
    const checkout = vi.spyOn(TestBed.inject(BillingService), 'proCheckout');
    page.subscription.set({
      ...pending,
      state: 'payment_pending',
      actions: { checkout: false, resume_checkout: false, portal: true, refresh: true },
    });
    page.openSubscription();
    expect(checkout).not.toHaveBeenCalled();
    fixture.detectChanges();
    expect(element.textContent).toContain('Gerenciar assinatura');
    expect(element.textContent).not.toContain('Retomar assinatura');
  });
  it('preserves portal access when a new offer is unavailable', () => {
    page.subscription.set({
      ...pending,
      state: 'payment_due',
      offer: { ...pending.offer, available: false },
      actions: { checkout: false, resume_checkout: false, portal: true, refresh: true },
      subscription: { ...pending.subscription!, status: 'past_due', amount: 2990 },
    });
    fixture.detectChanges();
    expect(element.textContent).toContain('Regularizar pagamento');
    page.openSubscription(true);
    expect(TestBed.inject(BillingService).portalRedirect).toHaveBeenCalled();
  });
  it('offers retry after an initial subscription error', () => {
    const request = vi
      .spyOn(TestBed.inject(BillingService), 'subscription')
      .mockReturnValue(throwError(() => new HttpErrorResponse({ status: 503 })));
    page.loadSubscription();
    fixture.detectChanges();
    expect(element.textContent).toContain('Consultar assinatura novamente');
    expect(page.subscription()).toBeNull();
    request.mockReturnValue(of({ data: pending }));
    page.loadSubscription();
    expect(page.subscription()).toEqual(pending);
  });
  it('invalidates XML and quotation benefits together on confirmed activation', () => {
    page.subscription.set(pending);
    const summary = {
      ...pending,
      state: 'active',
      actions: { checkout: false, resume_checkout: false, portal: true, refresh: true },
      subscription: { ...pending.subscription!, status: 'active', grants_pro: true, amount: 2990 },
    };
    vi.spyOn(TestBed.inject(BillingService), 'subscription').mockReturnValue(of({ data: summary }));
    page.loadSubscription();
    expect(TestBed.inject(AccountBenefits).refresh).toHaveBeenLastCalledWith(true);
    expect(page.canUpgrade()).toBe(false);
  });
  it.each([401, 419])(
    'handles an expired Checkout session without a generic Stripe error (%s)',
    (status) => {
      vi.spyOn(TestBed.inject(Router), 'url', 'get').mockReturnValue('/conta/assinatura');
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      vi.spyOn(TestBed.inject(BillingService), 'proCheckout').mockReturnValue(
        throwError(() => new HttpErrorResponse({ status })),
      );
      page.openSubscription();
      expect(auth.clear).toHaveBeenCalled();
      expect(navigate).toHaveBeenCalledWith(['/login'], {
        queryParams: { returnTo: '/conta/assinatura', session: 'expired' },
      });
      expect(page.subscriptionError()).toContain('Sua sessão expirou');
    },
  );
});
