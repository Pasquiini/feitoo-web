import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { AuthService } from '../../auth/services/auth.service';
import {
  QuotationGenerationApi,
  QuotationEntitlements,
} from '../services/quotation-generation-api.service';
import { QuotationCommercePanel } from './quotation-commerce';

describe('quotation commerce and checkout return', () => {
  const user = signal<{ id: number } | null>({ id: 1 });
  const quota: QuotationEntitlements = {
    source: 'free',
    policy: 'explicit_source',
    daily_limit: 1,
    consumed: 0,
    reserved: 0,
    remaining: 1,
    enabled: true,
    resets_at: '2026-10-25T00:00:00-03:00',
    active_processing: null,
    latest_processing: null,
    credits: { granted: 5, available: 5, consumed: 0, reserved: 0, revoked: 0 },
    pro: { active: false, remaining: 0 },
    offer: { available: true, amount: 990, currency: 'brl', credits: 5, code: 'quotation_5' },
  };
  const order = {
    id: '12345678-1234-4234-8234-123456789abc',
    status: 'pending',
    amount: 990,
    credits: 5,
    checkout_url: null,
  };
  let api: {
    checkout: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
    orders: ReturnType<typeof vi.fn>;
    entitlements: ReturnType<typeof vi.fn>;
  };
  beforeEach(() => {
    user.set({ id: 1 });
    sessionStorage.clear();
    history.replaceState({}, '', '/gerador-de-orcamentos');
    api = {
      checkout: vi.fn(async () => order),
      order: vi.fn(async () => order),
      orders: vi.fn(async () => ({ data: [], meta: { current_page: 1, last_page: 1 } })),
      entitlements: vi.fn(async () => quota),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { user } },
        { provide: QuotationGenerationApi, useValue: api },
      ],
    });
  });
  afterEach(() => {
    history.replaceState({}, '', '/');
    vi.useRealTimers();
  });
  async function create(editor = true, q = quota) {
    const fixture = TestBed.createComponent(QuotationCommercePanel);
    fixture.componentRef.setInput('editor', editor);
    fixture.componentRef.setInput('entitlement', q);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }
  it('defaults to free, requires explicit credit selection and avoids an unnecessary offer', async () => {
    const fixture = await create();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('gratuitamente');
    expect(element.textContent).not.toContain('Comprar cinco');
    const choose = vi.fn();
    fixture.componentInstance.choose.subscribe(choose);
    element.querySelectorAll<HTMLInputElement>('input[type=radio]')[1].click();
    expect(choose).toHaveBeenCalledWith('credit');
    expect(api.checkout).not.toHaveBeenCalled();
  });
  it('shows the exhausted Free offer and only tool-specific Pro quota for active subscribers', async () => {
    const fixture = await create(true, { ...quota, remaining: 0, consumed: 1 });
    expect(fixture.nativeElement.textContent).toContain(
      'Você já utilizou seu orçamento gratuito de hoje.',
    );
    expect(fixture.nativeElement.textContent).toContain('R$ 9,90');
    fixture.componentRef.setInput('entitlement', {
      ...quota,
      remaining: 0,
      pro: { active: true, remaining: 99, limit: 100 },
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('99 de 100');
    expect(fixture.nativeElement.textContent).not.toContain('Conhecer o Feitoo Pro');
    expect(fixture.nativeElement.textContent).not.toContain('Comprar cinco');
    expect(fixture.nativeElement.querySelector('input[type=radio]')).toBeNull();
  });
  it('persists before checkout and retries an ambiguous failure with the same key', async () => {
    const fixture = await create();
    const panel = fixture.componentInstance;
    const preserve = vi.fn(async () => true);
    api.checkout.mockRejectedValue(new Error('network'));
    await panel.checkout(preserve);
    await panel.checkout(preserve);
    expect(preserve).toHaveBeenCalledTimes(2);
    expect(api.checkout.mock.calls[0][0]).toBe(api.checkout.mock.calls[1][0]);
    expect(panel.error()).toContain('rascunho foi preservado');
    api.checkout.mockClear();
    await panel.checkout(async () => false);
    expect(api.checkout).not.toHaveBeenCalled();
  });
  it('does not open checkout when unavailable and keeps Free usable', async () => {
    const fixture = await create(true, { ...quota, offer: { ...quota.offer!, available: false } });
    const preserve = vi.fn(async () => true);
    await fixture.componentInstance.checkout(preserve);
    expect(api.checkout).not.toHaveBeenCalled();
    expect(preserve).not.toHaveBeenCalled();
    expect(fixture.componentInstance.error()).toContain('temporariamente indisponível');
    expect(fixture.nativeElement.textContent).toContain('gratuitamente');
  });
  it('disables a checkout that became unavailable without losing the draft', async () => {
    const fixture = await create(true, { ...quota, remaining: 0 });
    api.checkout.mockRejectedValue(
      new HttpErrorResponse({ status: 503, error: { code: 'checkout_unavailable' } }),
    );
    await fixture.componentInstance.checkout(async () => true);
    fixture.detectChanges();
    expect(fixture.componentInstance.error()).toContain('rascunho foi preservado');
    const buy = [...fixture.nativeElement.querySelectorAll('button')].find((button: any) =>
      button.textContent.includes('Comprar'),
    ) as HTMLButtonElement;
    expect(buy.disabled).toBe(true);
    await fixture.componentInstance.checkout(async () => true);
    expect(api.checkout).toHaveBeenCalledOnce();
  });
  it('ignores success URL claims, polls pending and updates only after backend confirms without generating', async () => {
    history.replaceState(
      {},
      '',
      `/gerador-de-orcamentos?quotation_order=${order.id}&payment=success`,
    );
    const fixture = await create();
    const panel = fixture.componentInstance;
    expect(api.order).toHaveBeenCalledWith(order.id);
    expect(panel.message()).toContain('pendente');
    const updated = vi.fn();
    panel.updated.subscribe(updated);
    api.order.mockResolvedValue({ ...order, status: 'paid' });
    await panel.confirmOrder();
    expect(updated).toHaveBeenCalledOnce();
    expect(panel.message()).toContain('manualmente');
    expect(api.checkout).not.toHaveBeenCalled();
    fixture.destroy();
  });
  it('cancelled return preserves draft and never presumes payment', async () => {
    history.replaceState(
      {},
      '',
      `/gerador-de-orcamentos?quotation_order=${order.id}&payment=cancelled`,
    );
    api.order.mockResolvedValue({ ...order, status: 'cancelled' });
    const fixture = await create();
    expect(fixture.componentInstance.message()).toContain('rascunho foi preservado');
    expect(api.checkout).not.toHaveBeenCalled();
  });
  it('invalidates a pending payment response after an account switch', async () => {
    const fixture = await create();
    const panel = fixture.componentInstance;
    let resolve!: (value: typeof order) => void;
    api.order.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    panel.returnOrder.set(order.id);
    const result = panel.confirmOrder();
    user.set({ id: 2 });
    fixture.detectChanges();
    resolve({ ...order, status: 'paid' });
    await result;
    expect(panel.message()).not.toContain('Pagamento confirmado');
  });
  it('paginates purchase history independently from fiscal purchases', async () => {
    const fixture = await create(false);
    const panel = fixture.componentInstance;
    api.orders.mockResolvedValue({
      data: [{ ...order, status: 'paid', created_at: '2026-10-24T12:00:00Z' }],
      meta: { current_page: 2, last_page: 3 },
    });
    await panel.loadPage(2);
    fixture.detectChanges();
    expect(panel.page()).toBe(2);
    expect(fixture.nativeElement.textContent).toContain('Confirmado');
    expect(fixture.nativeElement.textContent).not.toContain('CPF');
  });
  it('respects Retry-After before querying a rate-limited payment again', async () => {
    const fixture = await create();
    const panel = fixture.componentInstance;
    vi.useFakeTimers();
    panel.returnOrder.set(order.id);
    api.order.mockRejectedValue(
      new HttpErrorResponse({ status: 429, headers: new HttpHeaders({ 'Retry-After': '7' }) }),
    );
    await panel.confirmOrder();
    expect(panel.retryBlocked()).toBe(true);
    await panel.confirmOrder();
    expect(api.order).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(7000);
    expect(panel.retryBlocked()).toBe(false);
  });
});
