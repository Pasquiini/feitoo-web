import { DatePipe } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../auth/services/auth.service';
import { BillingService, SubscriptionSummary } from '../../processing/services/billing.service';
import { processingTools } from '../../processing/tools';
import { HistoryProcessing } from '../models/account';
import { AccountService } from '../services/account.service';
import { AccountBenefits } from '../services/account-benefits';
import { AccountErrors } from '../services/account-errors';

@Component({
  selector: 'app-account-page',
  imports: [DatePipe, RouterLink],
  templateUrl: './account-page.html',
  styleUrl: './account-page.scss',
})
export class AccountPage {
  readonly auth = inject(AuthService);
  readonly benefits = inject(AccountBenefits);
  private readonly api = inject(AccountService);
  private readonly billing = inject(BillingService);
  private readonly errors = inject(AccountErrors);
  private readonly destroy = inject(DestroyRef);
  readonly summary = signal<SubscriptionSummary | null>(null);
  readonly summaryError = signal('');
  readonly history = signal<readonly HistoryProcessing[]>([]);
  readonly historyLoading = signal(false);
  readonly historyError = signal('');
  readonly tools = {
    ...processingTools,
    'quotation-generator': { name: 'Orçamento em PDF', path: '/gerador-de-orcamentos' },
  };
  constructor() {
    this.loadSummary();
    this.loadRecent();
  }
  loadSummary(): void {
    if (this.errors.blocked()) return;
    this.summaryError.set('');
    this.billing
      .subscription()
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (r) => {
          this.summary.set(r.data);
          void this.benefits.refresh(!!r.data.subscription?.grants_pro);
        },
        error: (e) => this.summaryError.set(this.errors.handle(e)),
      });
  }
  loadRecent(): void {
    if (this.historyLoading() || this.errors.blocked()) return;
    this.historyLoading.set(true);
    this.historyError.set('');
    this.api
      .history(1, 3)
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (r) => {
          this.history.set(r.data.slice(0, 3));
          this.historyLoading.set(false);
        },
        error: (e) => {
          this.historyLoading.set(false);
          this.historyError.set(this.errors.handle(e));
        },
      });
  }
  planStatus(): string {
    const s = this.summary();
    return (
      (
        {
          active: 'Ativo',
          cancel_scheduled: 'Cancelamento agendado',
          checkout_pending: 'Tentativa pendente',
          payment_pending: 'Pagamento pendente',
          payment_due: 'Pagamento em atraso',
          ended: 'Encerrada',
          period_ended: 'Período encerrado',
          paused: 'Pausada',
          reconciliation_required: 'Em conciliação',
          trialing: 'Período de teste',
        } as Record<string, string>
      )[s?.state ?? ''] ??
      s?.subscription?.status ??
      'Gratuito'
    );
  }
}
