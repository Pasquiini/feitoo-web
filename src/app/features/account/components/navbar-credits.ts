import {
  afterNextRender,
  Component,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../auth/services/auth.service';
import { QuotationGenerationApi } from '../../quotations/services/quotation-generation-api.service';
import { CreditBalanceStore } from '../services/credit-balance.store';

@Component({
  selector: 'app-navbar-credits',
  imports: [RouterLink],
  template: `
    <details (keydown.escape)="close($event)">
      <summary aria-label="Créditos de orçamentos e benefícios">
        @if (balances.quota()?.credits; as credits) {
          <span
            >{{ credits.available }} <span class="credit-unit">créditos de orçamentos</span
            ><span class="credit-mobile" aria-hidden="true"> · Orç.</span></span
          >
        } @else {
          <span>Saldo</span>
        }
      </summary>
      <div class="credit-popover">
        <strong>Créditos e benefícios</strong>
        @if (balances.quota(); as q) {
          @if (q.credits; as credits) {
            <p>
              {{ credits.available }} créditos pagos de orçamentos disponíveis ·
              {{ credits.reserved }} reservados.
            </p>
          }
          @if (q.pro?.active) {
            <p>Pro: {{ q.pro?.remaining }} orçamentos no período.</p>
          } @else {
            <p>Free: {{ q.remaining }} orçamento disponível hoje.</p>
          }
          <p>
            Créditos de orçamentos são exclusivos desta ferramenta. Compras XML pertencem ao lote
            comprado.
          </p>
        }
        @if (loading()) {
          <p role="status">Consultando saldo…</p>
        }
        @if (error()) {
          <p role="status">{{ error() }}</p>
        }
        <button
          class="btn btn-outline-secondary"
          type="button"
          [disabled]="loading()"
          (click)="reload()"
        >
          Atualizar saldo
        </button>
        <a routerLink="/conta/creditos" (click)="close($event)">Meus créditos</a>
        <a routerLink="/conta/creditos" (click)="close($event)">Comprar créditos</a>
      </div>
    </details>
  `,
  styleUrl: './navbar-credits.scss',
})
export class NavbarCredits {
  readonly balances = inject(CreditBalanceStore);
  private readonly api = inject(QuotationGenerationApi);
  private readonly auth = inject(AuthService);
  private readonly destroy = inject(DestroyRef);
  private readonly browserReady = signal(false);
  readonly loading = signal(false);
  readonly error = signal('');
  private epoch = 0;
  constructor() {
    afterNextRender(() => this.browserReady.set(true));
    effect(() => {
      const owner = this.auth.user()?.id;
      const ready = this.browserReady();
      untracked(() => {
        this.epoch++;
        this.balances.clear();
        this.error.set('');
        this.loading.set(false);
        if (ready && owner) void this.reload();
      });
    });
    this.destroy.onDestroy(() => {
      this.epoch++;
      this.balances.clear();
    });
  }
  async reload(): Promise<void> {
    if (this.loading() || !this.auth.user() || !this.browserReady()) return;
    const epoch = this.epoch;
    this.loading.set(true);
    this.error.set('');
    try {
      await this.api.entitlements();
    } catch {
      if (epoch === this.epoch && !this.destroy.destroyed) {
        this.balances.clear();
        this.error.set('Saldo indisponível. Tente consultar novamente.');
      }
    } finally {
      if (epoch === this.epoch && !this.destroy.destroyed) this.loading.set(false);
    }
  }
  close(event: Event): void {
    const details = (event.target as HTMLElement).closest('details');
    details?.removeAttribute('open');
    if (event.type === 'keydown') {
      event.stopPropagation();
      details?.querySelector('summary')?.focus();
    }
  }
}
