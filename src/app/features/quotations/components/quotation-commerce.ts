import {
  afterNextRender,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../auth/services/auth.service';
import {
  QuotationGenerationApi,
  QuotationEntitlements,
  QuotationOrder,
} from '../services/quotation-generation-api.service';

@Component({
  selector: 'app-quotation-commerce',
  imports: [DatePipe, RouterLink],
  template: `
    <section aria-label="Créditos e benefícios de orçamentos">
      @if (quota(); as q) {
        @if (q.pro?.active) {
          <p>
            Feitoo Pro: {{ q.pro?.remaining }} de {{ q.pro?.limit }} orçamentos disponíveis no
            período vigente.
          </p>
          <p>
            Limite exclusivo do Gerador de Orçamentos. Fim do período:
            {{ q.pro?.period_end | date: 'dd/MM/yyyy HH:mm' : '-0300' }} (São Paulo).
          </p>
        } @else if (q.remaining > 0) {
          <p>Você pode gerar um orçamento gratuitamente hoje.</p>
        } @else if (q.reserved > 0) {
          <p>Sua franquia gratuita está reservada para uma emissão em andamento.</p>
        } @else {
          <p>Você já utilizou seu orçamento gratuito de hoje.</p>
          <p>
            Volte em {{ q.resets_at | date: 'dd/MM/yyyy HH:mm' : '-0300' }} (São Paulo) para usar a
            nova franquia.
          </p>
        }
        <p>
          Créditos de orçamentos: {{ q.credits?.available ?? 0 }} disponíveis,
          {{ q.credits?.reserved ?? 0 }} reservados e {{ q.credits?.consumed ?? 0 }} utilizados.
        </p>
        @if (editor()) {
          @if (!(q.pro?.active && (q.pro?.remaining ?? 0) > 0)) {
            <fieldset>
              <legend>Escolha como emitir</legend>
              @if (!q.pro?.active && q.remaining > 0) {
                <label
                  ><input
                    type="radio"
                    name="quotation-source"
                    [checked]="source() === 'free'"
                    (change)="choose.emit('free')"
                  />
                  Usar a franquia gratuita</label
                >
              }
              @if ((q.credits?.available ?? 0) > 0) {
                <label
                  ><input
                    type="radio"
                    name="quotation-source"
                    [checked]="source() === 'credit'"
                    (change)="choose.emit('credit')"
                  />
                  Usar 1 crédito pago para esta emissão</label
                >
              }
            </fieldset>
          }
          @if (
            (q.pro?.active ? q.pro?.remaining === 0 : q.remaining === 0 && q.reserved === 0) &&
            q.offer
          ) {
            <button
              type="button"
              class="btn btn-primary"
              [disabled]="busy() || retryBlocked() || !q.offer.available || checkoutUnavailable()"
              (click)="buy.emit()"
            >
              Comprar cinco créditos por R$ 9,90
            </button>
            @if (!q.offer.available || checkoutUnavailable()) {
              <p>A compra de créditos está temporariamente indisponível.</p>
            }
            @if (!q.pro?.active) {
              <a routerLink="/conta">Conhecer o Feitoo Pro</a>
            }
          }
        }
        <p>
          Créditos exclusivos para orçamentos, sem expiração comercial. PDF e rascunho possuem
          prazos próprios.
        </p>
      }
      @if (message()) {
        <p role="status">{{ message() }}</p>
      }
      @if (error()) {
        <p role="alert">{{ error() }}</p>
      }
      @if (returnOrder()) {
        <button
          type="button"
          class="btn btn-outline-primary"
          [disabled]="busy() || retryBlocked()"
          (click)="confirmOrder()"
        >
          Consultar pagamento
        </button>
      }
      @if (!editor()) {
        <h2>Compras de créditos para orçamentos</h2>
        @for (order of orders(); track order.id) {
          <p>
            {{ order.created_at | date: 'dd/MM/yyyy HH:mm' : '-0300' }} ·
            {{ order.credits }} créditos · R$
            {{ (order.amount / 100).toFixed(2).replace('.', ',') }} · {{ status(order.status) }}
          </p>
        } @empty {
          <p>Nenhuma compra comercial nesta página.</p>
        }
        <button
          type="button"
          class="btn btn-outline-primary"
          [disabled]="busy()"
          (click)="reload()"
        >
          Atualizar saldo e compras
        </button>
        @if (page() > 1) {
          <button type="button" (click)="loadPage(page() - 1)">Anterior</button>
        }
        @if (page() < lastPage()) {
          <button type="button" (click)="loadPage(page() + 1)">Próxima</button>
        }
      }
    </section>
  `,
})
export class QuotationCommercePanel {
  readonly editor = input(false);
  readonly entitlement = input<QuotationEntitlements | null>(null);
  readonly source = input<'free' | 'pro' | 'credit'>('free');
  readonly choose = output<'free' | 'credit'>();
  readonly buy = output<void>();
  readonly updated = output<void>();
  private readonly api = inject(QuotationGenerationApi);
  private readonly auth = inject(AuthService);
  private readonly destroy = inject(DestroyRef);
  readonly ownQuota = signal<QuotationEntitlements | null>(null);
  readonly orders = signal<QuotationOrder[]>([]);
  readonly busy = signal(false);
  readonly checkoutUnavailable = signal(false);
  readonly retryBlocked = signal(false);
  readonly message = signal('');
  readonly error = signal('');
  readonly returnOrder = signal<string | null>(null);
  readonly page = signal(1);
  readonly lastPage = signal(1);
  private timer?: ReturnType<typeof setTimeout>;
  private unblock?: ReturnType<typeof setTimeout>;
  private attempts = 0;
  private epoch = 0;
  private owner: number | null = null;
  private ready = false;
  quota(): QuotationEntitlements | null {
    return this.entitlement() ?? this.ownQuota();
  }
  constructor() {
    effect(() => {
      const owner = this.auth.user()?.id ?? null;
      if (owner === this.owner) return;
      this.owner = owner;
      this.epoch++;
      clearTimeout(this.timer);
      clearTimeout(this.unblock);
      this.retryBlocked.set(false);
      this.returnOrder.set(null);
      this.attempts = 0;
      this.orders.set([]);
      this.ownQuota.set(null);
      this.message.set('');
      this.error.set('');
      this.busy.set(false);
      this.checkoutUnavailable.set(false);
      if (this.ready && owner) void this.initialize();
    });
    afterNextRender(() => {
      this.ready = true;
      if (this.auth.user()) {
        this.owner = this.auth.user()!.id;
        void this.initialize();
      }
    });
    this.destroy.onDestroy(() => {
      this.epoch++;
      clearTimeout(this.timer);
      clearTimeout(this.unblock);
    });
  }
  private valid(epoch: number): boolean {
    return !this.destroy.destroyed && this.epoch === epoch && this.owner === this.auth.user()?.id;
  }
  private async initialize(): Promise<void> {
    if (!this.editor()) {
      await this.reload();
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const id = params.get('quotation_order');
    if (id && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id)) {
      this.returnOrder.set(id);
      this.message.set(
        params.get('payment') === 'cancelled'
          ? 'Checkout cancelado. Seu rascunho foi preservado. Nenhum pagamento foi presumido.'
          : 'Consultando a confirmação do pagamento...',
      );
      await this.confirmOrder(true);
    }
  }
  async checkout(preserve: () => Promise<boolean>): Promise<void> {
    if (this.busy() || this.retryBlocked() || this.checkoutUnavailable()) return;
    if (!this.quota()?.offer?.available) {
      this.checkoutUnavailable.set(true);
      this.error.set(
        'A compra de créditos está temporariamente indisponível. Você pode continuar usando sua franquia gratuita ou Pro.',
      );
      return;
    }
    this.busy.set(true);
    this.error.set('');
    const epoch = this.epoch;
    try {
      if (!(await preserve()) || !this.valid(epoch)) return;
      const storageKey = `quotation-checkout-${this.owner}`;
      let key = sessionStorage.getItem(storageKey);
      if (!key) {
        key = crypto.randomUUID();
        sessionStorage.setItem(storageKey, key);
      }
      const order = await this.api.checkout(key);
      if (!this.valid(epoch)) return;
      this.returnOrder.set(order.id);
      if (order.status !== 'pending') {
        sessionStorage.removeItem(storageKey);
        this.message.set('Pedido já encerrado. Consulte o saldo antes de iniciar outra compra.');
        this.updated.emit();
        return;
      }
      if (!order.checkout_url || !/^https:\/\/checkout\.stripe\.com\//.test(order.checkout_url))
        throw new Error('checkout');
      window.location.assign(order.checkout_url);
    } catch (error) {
      if (this.valid(epoch)) {
        if (error instanceof HttpErrorResponse && error.status === 503) {
          this.checkoutUnavailable.set(true);
          this.error.set(
            'A compra de créditos está temporariamente indisponível. Seu rascunho foi preservado; as gerações gratuitas e Pro continuam disponíveis conforme seu saldo.',
          );
        } else if (error instanceof HttpErrorResponse && [401, 419].includes(error.status)) {
          this.error.set('Entre novamente antes de comprar créditos. Seu rascunho foi preservado.');
        } else
          this.error.set(
            'Não foi possível abrir o Checkout. Seu rascunho foi preservado; tente novamente.',
          );
      }
    } finally {
      if (this.valid(epoch)) this.busy.set(false);
    }
  }
  async confirmOrder(automatic = false): Promise<void> {
    const id = this.returnOrder();
    if (!id || this.busy() || this.retryBlocked()) return;
    this.busy.set(true);
    this.error.set('');
    const epoch = this.epoch;
    try {
      const order = await this.api.order(id);
      if (!this.valid(epoch)) return;
      if (order.status === 'paid') {
        this.message.set(
          'Pagamento confirmado. O saldo foi atualizado. Confirme manualmente a emissão usando um crédito.',
        );
        sessionStorage.removeItem(`quotation-checkout-${this.owner}`);
        this.returnOrder.set(null);
        this.updated.emit();
      } else if (['cancelled', 'failed', 'refunded', 'disputed'].includes(order.status)) {
        this.message.set(`Pedido: ${this.status(order.status)}. Seu rascunho foi preservado.`);
        sessionStorage.removeItem(`quotation-checkout-${this.owner}`);
        this.returnOrder.set(null);
        this.updated.emit();
      } else {
        this.message.set(
          'Pagamento pendente de confirmação. Você pode consultar novamente; o PDF não será gerado automaticamente.',
        );
        if (automatic && ++this.attempts < 8)
          this.timer = setTimeout(() => {
            if (!document.hidden) void this.confirmOrder(true);
          }, 5000);
      }
    } catch (error) {
      if (this.valid(epoch)) {
        if (error instanceof HttpErrorResponse && error.status === 429) {
          const seconds = Number(error.headers.get('Retry-After'));
          const delay = Math.min(
            60000,
            Math.max(3000, Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 5000),
          );
          this.retryBlocked.set(true);
          this.unblock = setTimeout(() => this.retryBlocked.set(false), delay);
        }
        this.error.set(
          'Não foi possível confirmar o pedido. Consulte novamente em alguns instantes.',
        );
      }
    } finally {
      if (this.valid(epoch)) this.busy.set(false);
    }
  }
  async reload(): Promise<void> {
    const epoch = this.epoch;
    try {
      const quota = await this.api.entitlements();
      if (this.valid(epoch)) this.ownQuota.set(quota);
      await this.loadPage(this.page());
    } catch {
      if (this.valid(epoch)) this.error.set('Não foi possível consultar os créditos.');
    }
  }
  async loadPage(page: number): Promise<void> {
    const epoch = this.epoch;
    this.busy.set(true);
    try {
      const result = await this.api.orders(page);
      if (this.valid(epoch)) {
        this.orders.set(result.data);
        this.page.set(result.meta.current_page);
        this.lastPage.set(result.meta.last_page);
      }
    } catch {
      if (this.valid(epoch)) this.error.set('Não foi possível consultar as compras.');
    } finally {
      if (this.valid(epoch)) this.busy.set(false);
    }
  }
  status(value: string): string {
    return (
      (
        {
          pending: 'Pendente',
          paid: 'Confirmado',
          failed: 'Falhou',
          cancelled: 'Cancelado',
          refunded: 'Reembolsado',
          disputed: 'Em disputa',
        } as Record<string, string>
      )[value] ?? value
    );
  }
}
