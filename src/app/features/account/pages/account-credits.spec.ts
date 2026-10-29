import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { of } from 'rxjs';
import { AuthService } from '../../auth/services/auth.service';
import { BillingService } from '../../processing/services/billing.service';
import { QuotationGenerationApi } from '../../quotations/services/quotation-generation-api.service';
import { CreditBalanceStore } from '../services/credit-balance.store';
import { AccountCreditsPage } from './account-credits';

describe('direct account credit checkout', () => {
  const user = signal<{ id: number } | null>({ id: 1 });
  const quota = {
    pro: { active: false, remaining: 0 },
    remaining: 1,
    credits: { available: 5 },
    offer: { available: true, amount: 990, currency: 'brl', credits: 5 },
  };
  const pending = {
    id: '12345678-1234-4234-8234-123456789abc',
    status: 'pending',
    amount: 990,
    credits: 5,
    currency: 'brl',
    created_at: '2026-10-28T10:00:00Z',
    paid_at: null,
    refunded_amount: 0,
    checkout_url: 'https://checkout.stripe.com/c/pay/fixture',
    actions: { refresh: true, resume_checkout: true },
  };
  let api: any, billing: any;
  const params = new Map<string, string>();
  beforeEach(() => {
    user.set({ id: 1 });
    params.clear();
    sessionStorage.clear();
    api = {
      checkout: vi.fn(async () => pending),
      order: vi.fn(async () => pending),
      orders: vi.fn(async () => ({ data: [], meta: { current_page: 1, last_page: 1 } })),
      entitlements: vi.fn(async () => {
        TestBed.inject(CreditBalanceStore).publish(user()!.id, quota as any);
        return quota;
      }),
    };
    billing = {
      redirect: vi.fn(),
      purchases: vi.fn(() => of({ data: [], meta: { current_page: 1, last_page: 1 } })),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { user, clear: vi.fn(() => user.set(null)) } },
        { provide: QuotationGenerationApi, useValue: api },
        { provide: BillingService, useValue: billing },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: params } } },
      ],
    });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });
  async function create() {
    const f = TestBed.createComponent(AccountCreditsPage);
    f.detectChanges();
    await f.whenStable();
    return f;
  }
  it.each([false, true])(
    'buys before remaining quota is exhausted (Pro: %s), without a draft or generation',
    async (pro) => {
      const f = await create();
      TestBed.inject(CreditBalanceStore).publish(1, {
        ...quota,
        pro: { active: pro, remaining: 100 },
      } as any);
      f.detectChanges();
      expect(f.nativeElement.textContent).toContain('Comprar 5 créditos');
      await f.componentInstance.buy();
      expect(api.checkout).toHaveBeenCalledWith(expect.any(String), 'account');
      expect(billing.redirect).toHaveBeenCalledWith(pending.checkout_url);
      expect(billing.purchases).not.toHaveBeenCalled();
    },
  );
  it('preserves the same technical key across timeout, remount and explicit retry', async () => {
    const f = await create();
    api.checkout.mockRejectedValue(new HttpErrorResponse({ status: 0 }));
    await f.componentInstance.buy();
    const key = api.checkout.mock.calls[0][0];
    f.destroy();
    const next = await create();
    expect(api.checkout).toHaveBeenCalledTimes(1);
    await next.componentInstance.buy();
    expect(api.checkout.mock.calls[1][0]).toBe(key);
  });
  it('prevents overlapping purchases and never posts on refresh or successful return parameters', async () => {
    params.set('quotation_order', pending.id);
    params.set('payment', 'success');
    const f = await create();
    expect(api.order).toHaveBeenCalledWith(pending.id);
    expect(api.checkout).not.toHaveBeenCalled();
    expect(f.componentInstance.message()).toContain('pendente');
    expect(TestBed.inject(CreditBalanceStore).quota()?.credits?.available).toBe(5);
    expect(api.checkout).not.toHaveBeenCalled();
  });
  it('refreshes balance only after backend confirmation and clears only its own completed attempt', async () => {
    sessionStorage.setItem('quotation-checkout-1', 'stable-key');
    sessionStorage.setItem('quotation-checkout-order-1', pending.id);
    params.set('quotation_order', pending.id);
    api.order.mockResolvedValue({
      ...pending,
      status: 'paid',
      actions: { refresh: false, resume_checkout: false },
    });
    const f = await create();
    await f.whenStable();
    expect(f.componentInstance.message()).toContain('Pagamento confirmado');
    expect(sessionStorage.getItem('quotation-checkout-1')).toBeNull();
    expect(api.entitlements).toHaveBeenCalled();
    expect(api.checkout).not.toHaveBeenCalled();
  });
  it('an old paid return cannot erase a newer attempt key', async () => {
    sessionStorage.setItem('quotation-checkout-1', 'new-key');
    sessionStorage.setItem('quotation-checkout-order-1', '22222222-2222-4222-8222-222222222222');
    params.set('quotation_order', pending.id);
    api.order.mockResolvedValue({ ...pending, status: 'paid' });
    await create();
    expect(sessionStorage.getItem('quotation-checkout-1')).toBe('new-key');
  });
  it('reconciles a listed pending order before opening the existing Checkout', async () => {
    const f = await create();
    await f.componentInstance.consult(pending.id, false, true);
    expect(api.order).toHaveBeenCalledWith(pending.id);
    expect(billing.redirect).toHaveBeenCalledWith(pending.checkout_url);
    expect(api.checkout).not.toHaveBeenCalled();
    billing.redirect.mockClear();
    api.order.mockResolvedValue({
      ...pending,
      checkout_url: null,
      actions: { refresh: true, resume_checkout: false },
    });
    await f.componentInstance.consult(pending.id, false, true);
    expect(billing.redirect).not.toHaveBeenCalled();
  });
  it('shows loading and failure without a false empty state', async () => {
    api.orders.mockRejectedValue(new HttpErrorResponse({ status: 503 }));
    const f = await create();
    f.detectChanges();
    expect(f.nativeElement.textContent).not.toContain('Você ainda não comprou');
    expect(f.nativeElement.textContent).toContain('temporariamente indisponível');
  });
  it('respects Retry-After for every financial action', async () => {
    const f = await create();
    vi.useFakeTimers();
    api.order.mockRejectedValue(
      new HttpErrorResponse({ status: 429, headers: new HttpHeaders({ 'Retry-After': '12' }) }),
    );
    await f.componentInstance.consult(pending.id);
    await f.componentInstance.buy();
    expect(api.checkout).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(11999);
    expect(f.componentInstance.retryBlocked()).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(f.componentInstance.retryBlocked()).toBe(false);
  });
  it.each([401, 419])(
    'expires the session with a safe return and no repeated purchase (%s)',
    async (status) => {
      const f = await create();
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      vi.spyOn(TestBed.inject(Router), 'url', 'get').mockReturnValue('/conta/creditos');
      api.checkout.mockRejectedValue(new HttpErrorResponse({ status }));
      await f.componentInstance.buy();
      expect(user()).toBeNull();
      expect(navigate).toHaveBeenCalledWith(['/login'], {
        queryParams: { returnTo: '/conta/creditos', session: 'expired' },
      });
      expect(sessionStorage.getItem('quotation-checkout-1')).not.toBeNull();
    },
  );
  it('ignores a response arriving after the owner changes', async () => {
    const f = await create();
    let resolve: any;
    api.checkout.mockImplementation(() => new Promise((r) => (resolve = r)));
    const request = f.componentInstance.buy();
    await Promise.resolve();
    user.set({ id: 2 });
    resolve(pending);
    await request;
    expect(billing.redirect).not.toHaveBeenCalled();
    expect(TestBed.inject(CreditBalanceStore).quota()).toBeNull();
  });
  it('bounds pending polling and stops all automatic work when the route is destroyed', async () => {
    params.set('quotation_order', pending.id);
    const f = await create();
    vi.useFakeTimers();
    // Begin a new bounded polling cycle under the controlled clock.
    await f.componentInstance.consult(pending.id, true);
    await vi.advanceTimersByTimeAsync(60000);
    const count = api.order.mock.calls.length;
    expect(count).toBeLessThanOrEqual(9);
    await vi.advanceTimersByTimeAsync(60000);
    expect(api.order).toHaveBeenCalledTimes(count);
    f.destroy();
    await vi.advanceTimersByTimeAsync(60000);
    expect(api.order).toHaveBeenCalledTimes(count);
    expect(api.checkout).not.toHaveBeenCalled();
  });
});
