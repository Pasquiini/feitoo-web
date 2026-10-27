import { DestroyRef, effect, inject, Injectable, InjectionToken, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../auth/services/auth.service';
import { QuotationDraftCoordinator } from './quotation-draft.coordinator';
import {
  QuotationEntitlements,
  QuotationGenerationApi,
  QuotationProcessing,
} from './quotation-generation-api.service';

export const quotationPolling = new InjectionToken('quotation polling', {
  providedIn: 'root',
  factory: () => ({ interval: 2000, maxRequests: 40, maxDuration: 180000 }),
});

@Injectable()
export class QuotationGenerationCoordinator {
  private readonly api = inject(QuotationGenerationApi);
  private readonly auth = inject(AuthService);
  private readonly draft = inject(QuotationDraftCoordinator);
  private readonly options = inject(quotationPolling);
  readonly selectedSource = signal<'free' | 'pro' | 'credit'>('free');
  readonly entitlements = signal<QuotationEntitlements | null>(null);
  readonly processing = signal<QuotationProcessing | null>(null);
  readonly sending = signal(false);
  readonly polling = signal(false);
  readonly downloading = signal(false);
  readonly message = signal('');
  readonly error = signal('');
  readonly loginRequired = signal(false);
  readonly retryBlocked = signal(false);
  private active = false;
  private owner: number | null = null;
  private epoch = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private unblock: ReturnType<typeof setTimeout> | undefined;
  private inFlight = false;
  private count = 0;
  private began = 0;
  private retryKey: { id: string; attempt: number; key: string } | null = null;
  private readonly urls = new Set<string>();
  constructor() {
    effect(() => {
      const owner = this.auth.user()?.id ?? null;
      if (!this.active || owner === this.owner) return;
      this.owner = owner;
      this.epoch++;
      this.stop();
      this.processing.set(null);
      this.entitlements.set(null);
      this.selectedSource.set('free');
      this.error.set('');
      this.message.set('');
      this.sending.set(false);
      this.downloading.set(false);
      if (owner !== null) void this.refresh();
    });
    inject(DestroyRef).onDestroy(() => {
      this.active = false;
      this.epoch++;
      this.stop();
      clearTimeout(this.unblock);
      for (const url of this.urls) URL.revokeObjectURL(url);
    });
  }
  start(): void {
    this.active = true;
    this.owner = this.auth.user()?.id ?? null;
    if (this.owner !== null) void this.refresh();
  }
  private valid(epoch: number): boolean {
    return this.active && epoch === this.epoch && this.owner === this.auth.user()?.id;
  }
  pending(): boolean {
    return ['queued', 'processing'].includes(this.processing()?.status ?? '');
  }
  needLogin(): void {
    this.loginRequired.set(true);
    this.message.set(
      'Entre para gerar seu PDF. O rascunho será preservado; após entrar, solicite a geração novamente.',
    );
  }
  async refresh(): Promise<void> {
    if (this.owner === null || this.retryBlocked()) return;
    const epoch = this.epoch;
    try {
      const entitlement = await this.api.entitlements();
      if (!this.valid(epoch)) return;
      this.entitlements.set(entitlement);
      if (entitlement.pro?.active && entitlement.pro.remaining > 0) this.selectedSource.set('pro');
      else if (this.selectedSource() === 'pro') this.selectedSource.set('free');
      this.loginRequired.set(false);
      const uuid = entitlement.active_processing ?? entitlement.latest_processing;
      if (uuid && !this.processing()) await this.consult(uuid);
    } catch (error) {
      if (this.valid(epoch)) this.failure(error);
    }
  }
  async generate(): Promise<void> {
    if (this.sending() || this.pending() || this.retryBlocked()) return;
    if (!this.auth.user()) {
      this.needLogin();
      return;
    }
    this.sending.set(true);
    this.error.set('');
    this.message.set('Preparando o orçamento...');
    const epoch = this.epoch;
    try {
      const context = await this.draft.generationContext(
        this.entitlements()?.policy === 'explicit_source' ? this.selectedSource() : undefined,
      );
      if (!this.valid(epoch)) return;
      if (!context) {
        this.error.set(
          'Salve e sincronize o rascunho antes de gerar. Confira os avisos de salvamento.',
        );
        return;
      }
      const processing = await this.api.generate(context);
      if (!this.valid(epoch)) return;
      this.accept(processing);
      this.beginPolling();
      void this.refresh();
    } catch (error) {
      if (this.valid(epoch)) {
        this.failure(error);
        if (!(error instanceof HttpErrorResponse && [401, 419].includes(error.status)))
          void this.refresh();
      }
    } finally {
      if (this.valid(epoch)) this.sending.set(false);
    }
  }
  async retry(): Promise<void> {
    const processing = this.processing();
    if (!processing?.quotation.retryable || this.sending() || this.retryBlocked()) return;
    this.sending.set(true);
    this.error.set('');
    const epoch = this.epoch;
    if (
      this.retryKey?.id !== processing.id ||
      this.retryKey.attempt !== processing.quotation.attempt
    )
      this.retryKey = {
        id: processing.id,
        attempt: processing.quotation.attempt,
        key: crypto.randomUUID(),
      };
    try {
      const response = await this.api.retry(processing, this.retryKey.key);
      if (this.valid(epoch)) {
        this.accept(response, true);
        this.beginPolling();
        void this.refresh();
      }
    } catch (error) {
      if (this.valid(epoch)) this.failure(error);
    } finally {
      if (this.valid(epoch)) this.sending.set(false);
    }
  }
  private accept(processing: QuotationProcessing, force = false): void {
    const previous = this.processing();
    if (
      !force &&
      previous?.id === processing.id &&
      (previous.quotation.attempt > processing.quotation.attempt ||
        (['completed', 'failed', 'expired'].includes(previous.status) &&
          ['queued', 'processing'].includes(processing.status)))
    )
      return;
    this.processing.set(processing);
    const reason = processing.quotation.error_code;
    this.message.set(
      processing.status === 'queued'
        ? 'Seu orçamento está na fila. A unidade Free está reservada.'
        : processing.status === 'processing'
          ? 'Gerando seu orçamento em PDF...'
          : processing.status === 'completed'
            ? 'Seu PDF está pronto. Você pode baixá-lo novamente enquanto estiver disponível.'
            : processing.status === 'expired'
              ? 'O arquivo expirou. Edite o rascunho para solicitar uma nova emissão quando houver franquia disponível.'
              : reason === 'unsupported_character'
                ? 'Um caractere não é compatível com o PDF. Revise os textos. Nenhuma unidade foi consumida.'
                : reason === 'page_limit_exceeded'
                  ? 'O orçamento ultrapassa o limite de páginas. Reduza o conteúdo. Nenhuma unidade foi consumida.'
                  : 'Não foi possível gerar o orçamento. Nenhuma unidade foi consumida.',
    );
    if (!this.pending()) this.stop();
  }
  private beginPolling(): void {
    this.stop();
    if (!this.pending()) return;
    this.count = 0;
    this.began = Date.now();
    this.polling.set(true);
    this.schedule(this.options.interval);
  }
  private schedule(delay: number): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.poll();
    }, delay);
  }
  private async poll(): Promise<void> {
    if (!this.polling() || !this.pending()) return;
    if (
      this.count >= this.options.maxRequests ||
      Date.now() - this.began >= this.options.maxDuration
    ) {
      this.stop();
      this.message.set(
        'A geração continua no servidor. A consulta automática foi pausada; consulte o andamento novamente.',
      );
      return;
    }
    if (document.hidden) {
      this.schedule(this.options.interval);
      return;
    }
    const uuid = this.processing()!.id;
    const epoch = this.epoch;
    this.count++;
    try {
      const processing = await this.api.read(uuid);
      if (!this.valid(epoch)) return;
      this.error.set('');
      this.accept(processing);
      if (this.pending()) this.schedule(Math.min(5000, this.options.interval + this.count * 100));
      else void this.refresh();
    } catch (error) {
      if (!this.valid(epoch)) return;
      if (error instanceof HttpErrorResponse && error.status === 429) {
        const wait = this.backoff(error);
        this.message.set('Aguardando para consultar novamente. Sua geração continua no servidor.');
        this.schedule(wait);
      } else {
        this.stop();
        this.failure(error);
      }
    }
  }
  async consult(uuid = this.processing()?.id): Promise<void> {
    if (!uuid || this.inFlight || this.retryBlocked()) return;
    this.inFlight = true;
    const epoch = this.epoch;
    try {
      const processing = await this.api.read(uuid);
      if (this.valid(epoch)) {
        this.error.set('');
        this.accept(processing);
        this.beginPolling();
      }
    } catch (error) {
      if (this.valid(epoch)) this.failure(error);
    } finally {
      this.inFlight = false;
    }
  }
  async download(): Promise<void> {
    const processing = this.processing();
    if (!processing?.result.available || this.downloading() || this.retryBlocked()) return;
    this.downloading.set(true);
    this.error.set('');
    const epoch = this.epoch;
    try {
      const blob = await this.api.download(processing.id);
      if (!this.valid(epoch)) return;
      if (blob.type !== 'application/pdf' || !blob.size) throw new Error('invalid PDF');
      const url = URL.createObjectURL(blob);
      this.urls.add(url);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'orcamento.pdf';
      anchor.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        this.urls.delete(url);
      }, 1000);
    } catch (error) {
      if (this.valid(epoch)) {
        if (error instanceof HttpErrorResponse && error.status === 410)
          this.accept({
            ...processing,
            status: 'expired',
            result: { ...processing.result, available: false },
          });
        else this.failure(error);
      }
    } finally {
      if (this.valid(epoch)) this.downloading.set(false);
    }
  }
  private backoff(error: HttpErrorResponse): number {
    const raw = error.headers?.get('Retry-After');
    const ms =
      raw && /^\d+$/.test(raw) ? Number(raw) * 1000 : raw ? Date.parse(raw) - Date.now() : 5000;
    const wait = Math.max(3000, Math.min(60000, Number.isFinite(ms) ? ms : 5000));
    this.retryBlocked.set(true);
    clearTimeout(this.unblock);
    this.unblock = setTimeout(() => this.retryBlocked.set(false), wait);
    return wait;
  }
  private failure(error: unknown): void {
    const status = error instanceof HttpErrorResponse ? error.status : 0;
    const code =
      error instanceof HttpErrorResponse && !(error.error instanceof Blob)
        ? error.error?.code
        : null;
    if (status === 401 || status === 419) this.loginRequired.set(true);
    if (status === 429) this.backoff(error as HttpErrorResponse);
    this.error.set(
      code === 'free_quota_exhausted'
        ? 'Você já utilizou seu orçamento gratuito de hoje.'
        : code === 'draft_revision_conflict'
          ? 'O rascunho foi alterado em outra aba. Recupere a versão mais recente antes de gerar.'
          : status === 401 || status === 419
            ? 'Entre novamente para continuar. Seu rascunho foi preservado.'
            : status === 429
              ? 'Muitas solicitações. Aguarde alguns segundos antes de tentar novamente.'
              : status === 422
                ? 'Confira os dados do orçamento e sua franquia antes de gerar.'
                : status === 410
                  ? 'Esta emissão expirou. Edite o rascunho para solicitar uma nova emissão.'
                  : status === 503
                    ? 'A geração está temporariamente indisponível. Seu rascunho foi preservado.'
                    : 'Não foi possível confirmar a solicitação. Consulte o andamento ou tente novamente com o mesmo rascunho.',
    );
  }
  private stop(): void {
    clearTimeout(this.timer);
    this.polling.set(false);
  }
}
