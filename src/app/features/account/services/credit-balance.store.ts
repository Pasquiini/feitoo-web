import { computed, inject, Injectable, signal } from '@angular/core';
import { AuthService } from '../../auth/services/auth.service';
import type { QuotationEntitlements } from '../../quotations/services/quotation-generation-api.service';

/** Only the existing quotation currency is exposed here. XML purchases remain batch-bound. */
@Injectable({ providedIn: 'root' })
export class CreditBalanceStore {
  private readonly auth = inject(AuthService);
  private readonly snapshot = signal<{ owner: number; value: QuotationEntitlements } | null>(null);
  readonly quota = computed(() => {
    const snapshot = this.snapshot();
    return snapshot?.owner === this.auth.user()?.id ? (snapshot?.value ?? null) : null;
  });
  publish(owner: number, value: QuotationEntitlements): void {
    if (owner === this.auth.user()?.id) this.snapshot.set({ owner, value });
  }
  clear(): void {
    this.snapshot.set(null);
  }
}
