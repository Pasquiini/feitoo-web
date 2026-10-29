import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { afterNextRender, Component, DestroyRef, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../../auth/services/auth.service';
import { BillingService, Purchase } from '../../processing/services/billing.service';
import { processingTools } from '../../processing/tools';
import {
  QuotationGenerationApi,
  QuotationOrder,
} from '../../quotations/services/quotation-generation-api.service';
import { CreditBalanceStore } from '../services/credit-balance.store';
import { AccountErrors } from '../services/account-errors';

@Component({
  selector: 'app-account-credits',
  imports: [DatePipe, RouterLink],
  templateUrl: './account-credits.html',
  styleUrl: './account-credits.scss',
})
export class AccountCreditsPage {
  readonly balances = inject(CreditBalanceStore);
  private readonly api = inject(QuotationGenerationApi);
  private readonly auth = inject(AuthService);
  private readonly billing = inject(BillingService);
  private readonly errors = inject(AccountErrors);
  private readonly route = inject(ActivatedRoute);
  private readonly destroy = inject(DestroyRef);
  private readonly owner = this.auth.user()?.id;
  readonly busy = signal(false);
  readonly quotaLoading = signal(false);
  readonly quotaError = signal('');
  readonly ordersLoading = signal(false);
  readonly ordersLoaded = signal(false);
  readonly ordersError = signal('');
  readonly orders = signal<QuotationOrder[]>([]);
  readonly current = signal<QuotationOrder | null>(null);
  readonly returnId = signal<string | null>(null);
  readonly message = signal('');
  readonly error = signal('');
  readonly retryBlocked = signal(false);
  readonly pendingAttempt = signal(false);
  readonly page = signal(1);
  readonly lastPage = signal(1);
  readonly xmlPurchases = signal<Purchase[]>([]);
  readonly xmlLoading = signal(false);
  readonly xmlLoaded = signal(false);
  readonly xmlError = signal('');
  readonly xmlPage = signal(1);
  readonly xmlLastPage = signal(1);
  readonly tools = processingTools;
  private polling?: ReturnType<typeof setTimeout>;
  private unblock?: ReturnType<typeof setTimeout>;
  private attempts = 0;
  private quotaSequence = 0;
  private valid(): boolean {
    return !this.destroy.destroyed && this.owner === this.auth.user()?.id;
  }
  private keyName(): string {
    return `quotation-checkout-${this.owner}`;
  }
  private orderName(): string {
    return `quotation-checkout-order-${this.owner}`;
  }
  constructor() {
    afterNextRender(() => {
      try {
        this.pendingAttempt.set(!!sessionStorage.getItem(this.keyName()));
        const id =
          this.route.snapshot.queryParamMap.get('quotation_order') ??
          sessionStorage.getItem('quotation-login-return') ??
          sessionStorage.getItem(this.orderName());
        sessionStorage.removeItem('quotation-login-return');
        if (id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
          this.returnId.set(id);
          void this.consult(id, true);
        } else if (id)
          this.error.set('O identificador do pedido é inválido. Consulte a lista de compras.');
      } catch {
        this.error.set('Permita o armazenamento da sessão para iniciar uma compra com segurança.');
      }
      void this.loadQuota();
      void this.loadOrders();
    });
    this.destroy.onDestroy(() => {
      clearTimeout(this.polling);
      clearTimeout(this.unblock);
    });
  }
  private fail(error: unknown): string {
    const message = this.errors.handle(error);
    if (error instanceof HttpErrorResponse && error.status === 429) {
      this.retryBlocked.set(true);
      clearTimeout(this.unblock);
      this.unblock = setTimeout(
        () => {
          if (this.valid()) this.retryBlocked.set(false);
        },
        Math.max(0, this.errors.retryAt() - Date.now()),
      );
    }
    return message;
  }
  private finish(order: QuotationOrder): void {
    this.current.set(order);
    this.orders.update((rows) => rows.map((row) => (row.id === order.id ? order : row)));
    if (order.status === 'pending') {
      this.message.set(
        order.actions?.resume_checkout
          ? 'Pagamento pendente. O saldo será liberado após confirmação. Você pode consultar ou retomar o mesmo pedido.'
          : 'Pagamento pendente de conciliação. Consulte novamente em instantes; o saldo será liberado após confirmação.',
      );
      return;
    }
    clearTimeout(this.polling);
    // An old return must never erase the key of a more recent attempt.
    if (sessionStorage.getItem(this.orderName()) === order.id) {
      sessionStorage.removeItem(this.keyName());
      sessionStorage.removeItem(this.orderName());
      this.pendingAttempt.set(false);
    }
    this.returnId.set(null);
    if (order.status === 'paid') this.balances.clear();
    this.message.set(
      order.status === 'paid'
        ? 'Pagamento confirmado. Atualizando seu saldo de créditos.'
        : `Pedido ${this.status(order.status).toLowerCase()}. Nenhum saldo foi presumido pelo retorno do Checkout.`,
    );
    void this.loadQuota(true);
  }
  async buy(): Promise<void> {
    if (
      this.busy() ||
      this.errors.blocked() ||
      !this.valid() ||
      !this.balances.quota()?.offer?.available
    )
      return;
    if (this.current()?.status === 'pending') {
      await this.consult(this.current()!.id, false, true);
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      let key = sessionStorage.getItem(this.keyName());
      if (!key) {
        key = crypto.randomUUID();
        sessionStorage.setItem(this.keyName(), key);
      }
      this.pendingAttempt.set(true);
      const order = await this.api.checkout(key, 'account');
      if (!this.valid()) return;
      sessionStorage.setItem(this.orderName(), order.id);
      this.returnId.set(order.id);
      this.finish(order);
      if (order.status === 'pending' && order.actions?.resume_checkout && order.checkout_url)
        this.billing.redirect(order.checkout_url);
    } catch (e) {
      if (this.valid()) this.error.set(this.fail(e));
    } finally {
      if (this.valid()) this.busy.set(false);
    }
  }
  async consult(id = this.returnId(), automatic = false, resume = false): Promise<void> {
    if (!id || this.busy() || this.errors.blocked() || !this.valid()) return;
    clearTimeout(this.polling);
    if (!automatic) this.attempts = 0;
    this.busy.set(true);
    this.error.set('');
    this.returnId.set(id);
    try {
      const order = await this.api.order(id);
      if (!this.valid()) return;
      this.finish(order);
      if (resume && order.status === 'pending') {
        if (order.actions?.resume_checkout && order.checkout_url)
          this.billing.redirect(order.checkout_url);
        else
          this.message.set(
            'Este pedido aguarda conciliação. Consulte novamente antes de iniciar outra compra.',
          );
      } else if (automatic && order.status === 'pending' && ++this.attempts < 8) {
        this.polling = setTimeout(() => {
          if (!document.hidden) void this.consult(id, true);
        }, 5000);
      }
    } catch (e) {
      if (this.valid()) this.error.set(this.fail(e));
    } finally {
      if (this.valid()) this.busy.set(false);
    }
  }
  async loadQuota(refresh = false): Promise<void> {
    if ((this.quotaLoading() && !refresh) || this.errors.blocked()) return;
    const sequence = ++this.quotaSequence;
    this.quotaLoading.set(true);
    this.quotaError.set('');
    try {
      await this.api.entitlements();
      if (this.valid() && sequence === this.quotaSequence && this.current()?.status === 'paid')
        this.message.set('Pagamento confirmado. Saldo atualizado.');
    } catch (e) {
      if (this.valid() && sequence === this.quotaSequence) {
        this.balances.clear();
        this.quotaError.set(this.fail(e));
      }
    } finally {
      if (this.valid() && sequence === this.quotaSequence) this.quotaLoading.set(false);
    }
  }
  async loadOrders(page = this.page()): Promise<void> {
    if (this.ordersLoading() || this.errors.blocked()) return;
    this.ordersLoading.set(true);
    this.ordersError.set('');
    try {
      const r = await this.api.orders(page);
      if (this.valid()) {
        this.orders.set(r.data);
        this.page.set(r.meta.current_page);
        this.lastPage.set(r.meta.last_page);
        this.ordersLoaded.set(true);
      }
    } catch (e) {
      if (this.valid()) this.ordersError.set(this.fail(e));
    } finally {
      if (this.valid()) this.ordersLoading.set(false);
    }
  }
  loadXml(page = this.xmlPage()): void {
    if (this.xmlLoading() || this.errors.blocked()) return;
    this.xmlLoading.set(true);
    this.xmlError.set('');
    this.billing
      .purchases(page)
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (r) => {
          this.xmlPurchases.set(r.data);
          this.xmlPage.set(r.meta.current_page);
          this.xmlLastPage.set(r.meta.last_page);
          this.xmlLoaded.set(true);
          this.xmlLoading.set(false);
        },
        error: (e) => {
          this.xmlLoading.set(false);
          this.xmlError.set(this.fail(e));
        },
      });
  }
  money(amount: number, currency = 'brl'): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(amount / 100);
  }
  status(value: string): string {
    return (
      (
        {
          pending: 'Pendente',
          paid: 'Confirmado',
          failed: 'Pagamento não concluído',
          cancelled: 'Expirado ou cancelado',
          expired: 'Expirado',
          refunded: 'Reembolsado',
          disputed: 'Em disputa',
        } as Record<string, string>
      )[value] ?? 'Em análise'
    );
  }
  xmlPath(tool: string): string {
    return tool === 'xml-to-pdf'
      ? '/xml-para-pdf'
      : tool === 'products-from-xml'
        ? '/produtos-dos-xmls'
        : '/xml-para-excel';
  }
}
