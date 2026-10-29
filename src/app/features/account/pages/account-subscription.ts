import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize, timer } from 'rxjs';
import { Subscription } from 'rxjs';
import { NavigationStart } from '@angular/router';
import { AnalyticsService } from '../../../core/analytics.service';
import { BillingService, SubscriptionSummary } from '../../processing/services/billing.service';
import { AccountErrors } from '../services/account-errors';
import { AccountBenefits } from '../services/account-benefits';
@Component({
  selector: 'app-account-subscription',
  imports: [DatePipe],
  templateUrl: './account-subscription.html',
  styleUrl: './account-subscription.scss',
})
export class AccountSubscriptionPage {
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  readonly errors = inject(AccountErrors);
  readonly benefits = inject(AccountBenefits);
  private readonly analytics = inject(AnalyticsService);
  readonly subscription = signal<SubscriptionSummary | null>(null);
  readonly subscriptionBusy = signal(false);
  readonly subscriptionError = signal('');
  readonly subscriptionLoading = signal(false);
  readonly confirmingSubscription = signal(false);
  readonly subscriptionPollingActive = signal(false);
  readonly subscriptionRetryBlocked = signal(false);
  readonly subscriptionMessage = signal('');
  private confirmationWork = new Subscription();
  private confirmationAttempts = 0;
  proPrice(): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
      (this.subscription()?.subscription?.amount != null && !this.canUpgrade()
        ? (this.subscription()?.subscription?.amount ?? 0)
        : (this.subscription()?.offer.amount ?? 0)) / 100,
    );
  }
  paymentProblem(): boolean {
    return ['past_due', 'unpaid'].includes(this.subscription()?.subscription?.status ?? '');
  }
  subscriptionStatus(): string {
    const sub = this.subscription()?.subscription;
    if (!sub) return '';
    if (this.paymentProblem()) return 'Problema no pagamento';
    if (sub.grants_pro && sub.cancel_at_period_end) return 'Cancelamento agendado';
    if (sub.grants_pro) return 'Ativo';
    return (
      (
        {
          incomplete: 'Pagamento pendente',
          incomplete_expired: 'Cancelado',
          canceled: 'Cancelado',
          paused: 'Assinatura pausada',
          trialing: 'Período de teste',
          active: 'Período encerrado',
        } as Record<string, string>
      )[sub.status] ?? 'Assinatura indisponível'
    );
  }
  canUpgrade(): boolean {
    return !!this.subscription()?.actions?.checkout;
  }
  canResume(): boolean {
    return !!this.subscription()?.actions?.resume_checkout;
  }
  canPortal(): boolean {
    return !!this.subscription()?.actions?.portal;
  }
  primaryLabel(): string {
    return this.canResume()
      ? 'Retomar assinatura'
      : this.canUpgrade()
        ? 'Assinar Feitoo Pro'
        : this.paymentProblem()
          ? 'Regularizar pagamento'
          : 'Gerenciar assinatura';
  }
  stateHelp(): string {
    return (
      (
        {
          checkout_pending: 'Sua tentativa foi preservada. Retome o mesmo Checkout para concluir.',
          reconciliation_required:
            'A tentativa precisa de conciliação. Consulte o estado ou acesse o gerenciamento. Se persistir, entre em contato pelo suporte.',
          payment_pending:
            'Existe uma assinatura aguardando pagamento. Gerencie essa assinatura para continuar.',
          payment_due:
            'Regularize o pagamento no gerenciamento para recuperar seus benefícios Pro.',
          period_ended:
            'O período registrado terminou. Consulte o gerenciamento; se já pagou, aguarde a confirmação.',
          paused: 'Sua assinatura está pausada. Confira as opções disponíveis no gerenciamento.',
          trialing:
            'O provedor informa um período de teste. Consulte o gerenciamento para verificar o contrato.',
        } as Record<string, string>
      )[this.subscription()?.state ?? ''] ?? ''
    );
  }
  usagePercent(): number {
    const limits = this.usage()?.limits;
    return limits && limits.daily > 0
      ? Math.min(100, Math.max(0, (limits.used_today / limits.daily) * 100))
      : 0;
  }
  usageState(): string {
    return this.usagePercent() >= 100
      ? 'Limite de hoje atingido'
      : this.usagePercent() >= 80
        ? 'Próximo do limite de hoje'
        : 'Dentro do limite de hoje';
  }
  loadSubscription(): void {
    if (
      this.subscriptionPollingActive() ||
      this.subscriptionRetryBlocked() ||
      this.errors.blocked()
    )
      return;
    this.querySubscription();
  }
  private stopSubscriptionPolling(): void {
    this.subscriptionPollingActive.set(false);
    this.confirmationWork.unsubscribe();
  }
  cancelSubscriptionConfirmation(): void {
    this.stopSubscriptionPolling();
    this.confirmingSubscription.set(false);
    this.subscriptionMessage.set('Você pode consultar sua assinatura novamente mais tarde.');
  }
  private startSubscriptionConfirmation(): void {
    if (this.subscriptionPollingActive()) return;
    this.confirmingSubscription.set(true);
    this.subscriptionPollingActive.set(true);
    this.confirmationAttempts = 0;
    this.confirmationWork = new Subscription();
    this.confirmationWork.add(
      timer(30000).subscribe(() => {
        this.stopSubscriptionPolling();
        this.subscriptionMessage.set(
          'Seu pagamento ainda está sendo confirmado. Você pode aguardar mais alguns segundos ou consultar novamente.',
        );
      }),
    );
    this.querySubscription(true);
  }
  private querySubscription(automatic = false): void {
    if (this.subscriptionLoading() || this.destroyRef.destroyed) return;
    if (automatic) this.confirmationAttempts++;
    this.subscriptionLoading.set(true);
    this.subscriptionError.set('');
    const request = this.billing
      .subscription()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.subscriptionLoading.set(false);
          if (automatic && this.subscriptionPollingActive() && this.confirmationAttempts < 10) {
            this.confirmationWork.add(timer(3000).subscribe(() => this.querySubscription(true)));
          }
        }),
      )
      .subscribe({
        next: (r) => {
          const previous = this.subscription();
          this.subscription.set(r.data);
          if (
            !previous ||
            previous.subscription?.grants_pro !== r.data.subscription?.grants_pro ||
            previous.subscription?.status !== r.data.subscription?.status
          )
            this.loadUsage(true);
          this.analytics.confirmSubscription(r.data);
          const status = r.data.subscription?.status;
          if (status && status !== 'incomplete') this.stopSubscriptionPolling();
          if (
            this.confirmingSubscription() &&
            status === 'active' &&
            r.data.subscription?.grants_pro
          ) {
            this.confirmingSubscription.set(false);
            this.subscriptionMessage.set('Feitoo Pro ativado.');
          } else if (this.confirmingSubscription() && status && status !== 'incomplete') {
            this.confirmingSubscription.set(false);
            this.subscriptionMessage.set(
              'A confirmação terminou. Confira abaixo o estado da sua assinatura.',
            );
          } else if (this.confirmingSubscription() && !this.subscriptionPollingActive()) {
            this.subscriptionMessage.set(
              'Seu pagamento ainda está sendo confirmado. Você pode aguardar mais alguns segundos ou consultar novamente.',
            );
          }
          if (
            ['past_due', 'unpaid', 'incomplete_expired'].includes(r.data.subscription?.status ?? '')
          )
            this.analytics.track('pro_subscription_failed');
        },
        error: (error: HttpErrorResponse) => {
          this.stopSubscriptionPolling();
          this.subscription.set(null);
          const message = this.errors.handle(error);
          if (error.status === 429) {
            this.subscriptionError.set(
              'Estamos consultando a confirmação com muita frequência. Aguarde alguns segundos e tente novamente.',
            );
            const header = error.headers?.get('Retry-After');
            const seconds = header && /^\d+$/.test(header) ? Number(header) : NaN;
            const wait = Number.isFinite(seconds)
              ? seconds * 1000
              : header
                ? Date.parse(header) - Date.now()
                : 3000;
            this.subscriptionRetryBlocked.set(true);
            timer(Math.max(3000, Number.isFinite(wait) ? wait : 3000))
              .pipe(takeUntilDestroyed(this.destroyRef))
              .subscribe(() => this.subscriptionRetryBlocked.set(false));
          } else this.subscriptionError.set(message);
          this.subscriptionMessage.set(
            'A consulta automática foi interrompida. Você pode consultar novamente.',
          );
        },
      });
    if (automatic) this.confirmationWork.add(request);
  }
  openSubscription(portal = false): void {
    if (
      this.subscriptionBusy() ||
      this.errors.blocked() ||
      (portal ? !this.canPortal() : !(this.canUpgrade() || this.canResume()))
    )
      return;
    this.subscriptionBusy.set(true);
    this.subscriptionError.set('');
    (portal ? this.billing.portal() : this.billing.proCheckout())
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.subscriptionBusy.set(false)),
      )
      .subscribe({
        next: (r) => {
          try {
            this.analytics.track(portal ? 'pro_portal_opened' : 'pro_checkout_started');
            if (portal) this.billing.portalRedirect(r.data.url);
            else {
              this.analytics.track('checkout_started', {
                purchase_type: 'subscription',
                plan: 'pro',
              });
              this.analytics.beginSubscriptionCheckout();
              this.billing.redirect(r.data.url);
            }
          } catch {
            if (!portal)
              this.analytics.track('checkout_failed', {
                purchase_type: 'subscription',
                plan: 'pro',
              });
            this.subscriptionError.set('Não foi possível abrir a Stripe.');
          }
        },
        error: (error: HttpErrorResponse) => {
          if (!portal)
            this.analytics.track('checkout_failed', { purchase_type: 'subscription', plan: 'pro' });
          const message = this.errors.handle(error);
          if (error.status === 409) this.loadSubscription();
          this.subscriptionError.set(message);
        },
      });
  }

  private readonly billing = inject(BillingService);
  readonly usage = this.benefits.usage;
  readonly usageError = this.benefits.error;
  readonly usageLoading = this.benefits.loading;
  loadUsage(_refresh = false): void {
    void this.benefits.refresh(!!this.subscription()?.subscription?.grants_pro);
  }
  constructor() {
    this.destroyRef.onDestroy(() => this.stopSubscriptionPolling());
    this.router.events.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
      if (event instanceof NavigationStart) this.stopSubscriptionPolling();
    });
    const returning = inject(ActivatedRoute).snapshot.queryParamMap.get('subscription');
    if (returning === 'confirming') this.startSubscriptionConfirmation();
    else this.loadSubscription();
    if (returning === 'cancelled')
      this.subscriptionMessage.set(
        'Você voltou do Checkout. Consulte o estado da tentativa antes de retomar.',
      );
    this.analytics.track('pro_offer_viewed');
  }
}
