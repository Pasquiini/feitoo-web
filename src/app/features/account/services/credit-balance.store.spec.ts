import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../../auth/services/auth.service';
import { QuotationEntitlements } from '../../quotations/services/quotation-generation-api.service';
import { CreditBalanceStore } from './credit-balance.store';

describe('credit balance ownership', () => {
  it('never carries a snapshot into another account or accepts a late foreign response', () => {
    const user = signal<{ id: number } | null>({ id: 1 });
    TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: { user } }] });
    const store = TestBed.inject(CreditBalanceStore);
    const quota = { credits: { available: 7 } } as QuotationEntitlements;
    expect(store.quota()).toBeNull();
    store.publish(1, quota);
    expect(store.quota()?.credits?.available).toBe(7);
    user.set({ id: 2 });
    expect(store.quota()).toBeNull();
    store.publish(1, quota);
    expect(store.quota()).toBeNull();
    store.publish(2, { credits: { available: 0 } } as QuotationEntitlements);
    expect(store.quota()?.credits?.available).toBe(0);
    user.set(null);
    expect(store.quota()).toBeNull();
    store.clear();
    user.set({ id: 2 });
    expect(store.quota()).toBeNull();
  });
});
