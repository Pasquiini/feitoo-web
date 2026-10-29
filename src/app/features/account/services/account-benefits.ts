import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../auth/services/auth.service';
import { BillingService, Usage } from '../../processing/services/billing.service';
import { QuotationGenerationApi } from '../../quotations/services/quotation-generation-api.service';
import { CreditBalanceStore } from './credit-balance.store';
import { AccountErrors } from './account-errors';

/** A subscription change invalidates both benefit families before fetching authoritative data. */
@Injectable({ providedIn: 'root' })
export class AccountBenefits {
  private readonly auth = inject(AuthService);
  private readonly billing = inject(BillingService);
  private readonly api = inject(QuotationGenerationApi);
  readonly balances = inject(CreditBalanceStore);
  private readonly errors = inject(AccountErrors);
  private readonly snapshot = signal<{ owner: number; usage: Usage } | null>(null);
  readonly usage = computed(() =>
    this.snapshot()?.owner === this.auth.user()?.id ? (this.snapshot()?.usage ?? null) : null,
  );
  readonly loading = signal(false);
  readonly error = signal('');
  private epoch = 0;
  async refresh(expectedPro?: boolean): Promise<void> {
    if (this.errors.blocked()) return;
    const owner = this.auth.user()?.id;
    if (!owner) return;
    const epoch = ++this.epoch;
    this.snapshot.set(null);
    this.balances.clear();
    this.loading.set(true);
    this.error.set('');
    const results = await Promise.allSettled([
      firstValueFrom(this.billing.usage()),
      this.api.entitlements(),
    ]);
    if (epoch !== this.epoch || owner !== this.auth.user()?.id) return;
    this.loading.set(false);
    const [usage, quota] = results;
    if (usage.status === 'rejected' || quota.status === 'rejected') {
      this.balances.clear();
      this.error.set(
        this.errors.handle(
          usage.status === 'rejected'
            ? usage.reason
            : quota.status === 'rejected'
              ? quota.reason
              : null,
        ),
      );
      return;
    }
    if (
      expectedPro !== undefined &&
      ((usage.value.data.plan === 'pro') !== expectedPro ||
        !!quota.value.pro?.active !== expectedPro)
    ) {
      this.balances.clear();
      this.error.set('Seus benefícios estão sendo sincronizados. Consulte novamente em instantes.');
      return;
    }
    this.snapshot.set({ owner, usage: usage.value.data });
  }
}
