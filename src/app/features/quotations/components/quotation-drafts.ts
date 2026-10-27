import { Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../auth/services/auth.service';
import { QuotationDraftApi, QuotationDraftSummary } from '../services/quotation-draft-api.service';
import { QuotationDraftCoordinator } from '../services/quotation-draft.coordinator';

@Component({
  selector: 'app-quotation-drafts',
  imports: [DatePipe],
  template: `
    @if (auth.user()) {
      <section class="saved-drafts" aria-labelledby="saved-drafts-title">
        <div class="draft-actions">
          <h2 id="saved-drafts-title">Seus rascunhos</h2>
          <button
            class="btn btn-secondary"
            type="button"
            [disabled]="busy() || draft.loading()"
            (click)="load(1)"
          >
            Consultar rascunhos salvos
          </button>
          <button
            class="btn btn-outline-primary"
            type="button"
            [disabled]="busy() || draft.loading() || draft.conflict()"
            (click)="create()"
          >
            Novo orçamento
          </button>
        </div>
        <p>
          Ao abrir outro orçamento, salvamos o atual. Para excluir um rascunho, abra-o e use
          Descartar rascunho.
        </p>
        @if (busy()) {
          <p role="status">Consultando seus rascunhos…</p>
        }
        @if (error()) {
          <p role="alert">{{ error() }}</p>
        }
        @if (loaded()) {
          <ul class="saved-drafts-list">
            @for (item of items(); track item.uuid) {
              <li>
                <div>
                  <strong>{{ item.number || 'Sem identificação' }}</strong> ·
                  {{ item.customer_name || 'Cliente ainda não informado' }}
                  <small
                    >{{ item.template_id === 'classic' ? 'Clássico' : 'Moderno' }} · expira em
                    {{ item.expires_at | date: 'dd/MM/yyyy HH:mm' : '-0300' }} (São Paulo)</small
                  >
                </div>
                <button
                  class="btn btn-secondary"
                  type="button"
                  [disabled]="busy() || draft.loading() || draft.conflict()"
                  (click)="open(item.uuid)"
                  [attr.aria-label]="'Abrir rascunho ' + (item.number || 'sem identificação')"
                >
                  Abrir rascunho
                </button>
              </li>
            } @empty {
              <li>Nenhum rascunho vigente nesta página.</li>
            }
          </ul>
          <nav class="draft-actions" aria-label="Páginas dos rascunhos">
            @if (page() > 1) {
              <button
                class="btn btn-secondary"
                type="button"
                [disabled]="busy()"
                (click)="load(page() - 1)"
              >
                Anterior
              </button>
            }
            <span>Página {{ page() }} de {{ lastPage() }}</span>
            @if (page() < lastPage()) {
              <button
                class="btn btn-secondary"
                type="button"
                [disabled]="busy()"
                (click)="load(page() + 1)"
              >
                Próxima
              </button>
            }
          </nav>
        }
      </section>
    }
  `,
})
export class QuotationDrafts {
  readonly auth = inject(AuthService);
  readonly draft = inject(QuotationDraftCoordinator);
  private readonly api = inject(QuotationDraftApi);
  private readonly destroy = inject(DestroyRef);
  readonly items = signal<QuotationDraftSummary[]>([]);
  readonly busy = signal(false);
  readonly loaded = signal(false);
  readonly error = signal('');
  readonly page = signal(1);
  readonly lastPage = signal(1);
  private epoch = 0;
  constructor() {
    effect(() => {
      this.auth.user();
      this.epoch++;
      this.items.set([]);
      this.loaded.set(false);
      this.busy.set(false);
      this.error.set('');
    });
  }
  async load(page: number): Promise<void> {
    if (this.busy() || !this.auth.user()) return;
    const owner = this.auth.user()!.id;
    const epoch = this.epoch;
    this.busy.set(true);
    this.error.set('');
    try {
      const result = await this.api.list(page);
      if (this.destroy.destroyed || epoch !== this.epoch || owner !== this.auth.user()?.id) return;
      this.items.set(result.data);
      this.page.set(result.meta.current_page);
      this.lastPage.set(result.meta.last_page);
      this.loaded.set(true);
    } catch (error) {
      if (epoch === this.epoch && !this.destroy.destroyed)
        this.error.set(
          error instanceof HttpErrorResponse && [401, 419].includes(error.status)
            ? 'Entre novamente para consultar seus rascunhos.'
            : 'Não foi possível consultar os rascunhos. Aguarde e tente novamente.',
        );
    } finally {
      if (epoch === this.epoch && !this.destroy.destroyed) this.busy.set(false);
    }
  }
  async open(uuid: string): Promise<void> {
    if (await this.draft.open(uuid)) this.loaded.set(false);
  }
  async create(): Promise<void> {
    await this.draft.newDraft();
    this.loaded.set(false);
  }
}
