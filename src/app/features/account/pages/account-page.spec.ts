import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { of, Subject } from 'rxjs';
import { AuthService } from '../../auth/services/auth.service';
import { BillingService } from '../../processing/services/billing.service';
import { QuotationGenerationApi } from '../../quotations/services/quotation-generation-api.service';
import { AccountService } from '../services/account.service';
import { AccountBenefits } from '../services/account-benefits';
import { CreditBalanceStore } from '../services/credit-balance.store';
import { AccountPage } from './account-page';

describe('account overview and benefit consistency', () => {
  const user = signal<{ id: number; name: string } | null>({ id: 1, name: 'Maria Silva' });
  const free = {
    plan: 'free',
    limits: {
      per_processing: 3,
      daily: 6,
      used_today: 0,
      remaining_today: 6,
      resets_at: '2099-01-01',
    },
  };
  const quota = { pro: { active: false, remaining: 0 }, remaining: 1, credits: { available: 5 } };
  let billing: any, api: any, history: any;
  beforeEach(() => {
    user.set({ id: 1, name: 'Maria Silva' });
    billing = {
      subscription: vi.fn(() =>
        of({
          data: {
            state: 'free',
            actions: { checkout: true },
            offer: { amount: 2990 },
            subscription: null,
          },
        }),
      ),
      usage: vi.fn(() => of({ data: free })),
      purchases: vi.fn(),
    };
    api = {
      entitlements: vi.fn(async () => {
        const q = quota;
        TestBed.inject(CreditBalanceStore).publish(user()!.id, q as any);
        return q;
      }),
    };
    history = {
      history: vi.fn(() =>
        of({
          data: [1, 2, 3, 4].map((id) => ({
            id: String(id),
            tool: 'xml-to-excel',
            created_at: '2026-10-28T10:00:00Z',
            status: 'completed',
          })),
        }),
      ),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { user } },
        { provide: BillingService, useValue: billing },
        { provide: QuotationGenerationApi, useValue: api },
        { provide: AccountService, useValue: history },
      ],
    });
  });
  afterEach(() => TestBed.resetTestingModule());
  it('requests only three recent files, no purchases, and provides real commercial routes', async () => {
    const f = TestBed.createComponent(AccountPage);
    f.detectChanges();
    await f.whenStable();
    expect(history.history).toHaveBeenCalledWith(1, 3);
    expect(billing.purchases).not.toHaveBeenCalled();
    expect(f.nativeElement.querySelectorAll('.recent-list li')).toHaveLength(3);
    expect(f.nativeElement.querySelector('form')).toBeNull();
    expect(f.nativeElement.querySelector('a[href="/conta/creditos"]')).not.toBeNull();
    expect(f.nativeElement.querySelector('a[href="/conta/assinatura"]')).not.toBeNull();
  });
  it('invalidates Free snapshots until both benefit families confirm Pro', async () => {
    const b = TestBed.inject(AccountBenefits);
    await b.refresh(false);
    const pendingUsage = new Subject<any>();
    billing.usage.mockReturnValue(pendingUsage);
    api.entitlements.mockImplementation(async () => {
      const q = { ...quota, pro: { active: true, remaining: 100 } };
      TestBed.inject(CreditBalanceStore).publish(1, q as any);
      return q;
    });
    const pending = b.refresh(true);
    expect(b.usage()).toBeNull();
    expect(b.balances.quota()?.pro?.active).toBe(true);
    pendingUsage.next({
      data: { ...free, plan: 'pro', limits: { ...free.limits, daily: 500, per_processing: 250 } },
    });
    pendingUsage.complete();
    await pending;
    expect(b.usage()?.plan).toBe('pro');
    expect(b.balances.quota()?.pro?.remaining).toBe(100);
  });
  it('does not publish an older Free response after the Pro refresh', async () => {
    const b = TestBed.inject(AccountBenefits);
    const slow = new Subject<any>();
    billing.usage.mockReturnValueOnce(slow);
    const old = b.refresh(false);
    billing.usage.mockReturnValue(of({ data: { ...free, plan: 'pro' } }));
    api.entitlements.mockResolvedValue({ ...quota, pro: { active: true, remaining: 100 } });
    await b.refresh(true);
    slow.next({ data: free });
    slow.complete();
    await old;
    expect(b.usage()?.plan).toBe('pro');
  });
  it('shows a synchronization error instead of a stale Free quota after activation', async () => {
    const b = TestBed.inject(AccountBenefits);
    billing.usage.mockReturnValue(of({ data: { ...free, plan: 'pro' } }));
    await b.refresh(true);
    expect(b.usage()).toBeNull();
    expect(b.balances.quota()).toBeNull();
    expect(b.error()).toContain('sincronizados');
  });
  it('never exposes the previous owner snapshot after changing account', async () => {
    const b = TestBed.inject(AccountBenefits);
    await b.refresh(false);
    user.set({ id: 2, name: 'Outra conta' });
    expect(b.usage()).toBeNull();
    expect(b.balances.quota()).toBeNull();
  });
});
