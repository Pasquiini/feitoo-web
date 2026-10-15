import { toolFaqs } from '../../../core/tool-faqs';
import { OrganizerOptionsPanel } from './organizer-options';
import { OrganizerResultPanel } from './organizer-result';
import { XmlAnalyzerDashboard } from './xml-analyzer-dashboard';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ToolIcon } from './tool-icon';
import { productsPdf } from '../services/products-pdf';
import { AnalyticsService, sizeBucket, durationBucket } from '../../../core/analytics.service';
import { PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal, effect, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  concatMap,
  defer,
  exhaustMap,
  finalize,
  from,
  last,
  of,
  retry,
  switchMap,
  take,
  takeWhile,
  tap,
  throwError,
  timer,
} from 'rxjs';
import { BillingService, Usage, Purchase } from '../services/billing.service';
import { AuthService } from '../../auth/services/auth.service';
import { Processing, ProcessingFile, XmlToExcelConfig } from '../models/processing';
import { ProcessingService } from '../services/processing.service';
import { XmlSelectionService } from '../services/xml-selection.service';
import { processingTools } from '../tools';

type UiState =
  'idle' | 'files-selected' | 'uploading' | 'queued' | 'processing' | 'completed' | 'error';

@Component({
  selector: 'app-xml-to-excel',
  imports: [DatePipe, RouterLink, ToolIcon, OrganizerOptionsPanel, OrganizerResultPanel, XmlAnalyzerDashboard],
  templateUrl: './xml-to-excel.html',
  styleUrl: './xml-to-excel.scss',
})
export class XmlToExcelPage {
  readonly itemGroups = computed(() => {
    const groups = new Map<
      string,
      {
        number: string;
        series: string;
        issuer: string | null;
        items: NonNullable<Processing['preview']>['items_preview'][number][];
      }
    >();
    for (const item of this.processing()?.preview?.items_preview ?? []) {
      const key = item.note_reference ?? JSON.stringify([item.note_number, item.series]);
      const group = groups.get(key) ?? {
        number: item.note_number,
        series: item.series,
        issuer: item.issuer_name ?? null,
        items: [],
      };
      group.items.push(item);
      groups.set(key, group);
    }
    return [...groups.values()];
  });
  readonly auth = inject(AuthService);
  private readonly billing = inject(BillingService);
  private readonly route = inject(ActivatedRoute);
  readonly tool =
    processingTools[
      this.route.snapshot.data?.['tool'] === 'xml-analyzer' ? 'xml-analyzer' : this.route.snapshot.data?.['tool'] === 'xml-organizer'
        ? 'xml-organizer'
        : this.route.snapshot.data?.['tool'] === 'xml-to-pdf'
          ? 'xml-to-pdf'
          : this.route.snapshot.data?.['tool'] === 'products-from-xml'
            ? 'products-from-xml'
            : 'xml-to-excel'
    ];
  readonly faqs = toolFaqs[this.tool.path];
  readonly productsMode = this.tool.id === 'products-from-xml';
  readonly pdfMode = this.tool.id === 'xml-to-pdf';
  readonly organizerMode = this.tool.id === 'xml-organizer';
  readonly analyzerMode = this.tool.id === 'xml-analyzer';
  readonly organizerOptions = inject(XmlSelectionService).organizerOptions;
  readonly pageTitle = this.analyzerMode ? 'Analisador de XMLs Online' : this.organizerMode
    ? 'Organizador de XMLs Online'
    : this.pdfMode
      ? 'Converter XML em PDF'
      : this.productsMode
        ? 'Extrair produtos de XMLs NF-e'
        : 'Converter XML para Excel';
  readonly documentFiles = signal<readonly ProcessingFile[]>([]);
  readonly pdfPreview = signal<SafeResourceUrl | null>(null);
  readonly pdfBusy = signal(false);
  private readonly sanitizer = inject(DomSanitizer);
  private pdfUrl: string | null = null;

  private clearPdf(): void {
    if (this.pdfUrl) URL.revokeObjectURL(this.pdfUrl);
    this.pdfUrl = null;
    this.pdfPreview.set(null);
  }

  viewDanfe(file: ProcessingFile, download = false): void {
    const batch = this.processing();
    if (!batch || this.pdfBusy() || file.status !== 'completed' || this.expired() || this.deleted())
      return;
    this.pdfBusy.set(true);
    this.api
      .pdf(batch.id, file.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.pdfBusy.set(false)),
      )
      .subscribe({
        next: (blob) => {
          if (this.expired() || this.deleted() || this.processing()?.id !== batch.id) return;
          const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
          if (download) {
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `DANFE-${file.document?.access_key ?? file.id}.pdf`;
            anchor.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          } else {
            this.clearPdf();
            this.pdfUrl = url;
            // Trust only an authenticated PDF response represented by a locally created blob URL.
            this.pdfPreview.set(this.sanitizer.bypassSecurityTrustResourceUrl(url));
          }
        },
        error: () => this.error.set('Não foi possível abrir o PDF. O resultado pode ter expirado.'),
      });
  }

  loadDocumentFiles(): void {
    const batch = this.processing();
    if ((!this.pdfMode && !this.organizerMode && !this.analyzerMode) || !batch || this.deleted() || this.expired())
      return;
    this.api
      .listFiles(batch.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => {
          if (!this.deleted() && !this.expired() && this.processing()?.id === batch.id)
            this.documentFiles.set(r.data);
        },
        error: () => this.error.set('Não foi possível consultar os arquivos do lote.'),
      });
  }
  readonly previewMode = signal<'consolidated' | 'detailed'>('consolidated');
  readonly usage = signal<Usage | null>(null);
  readonly paymentBusy = signal(false);
  readonly paymentMessage = signal('');
  readonly purchase = signal<Purchase | null>(null);
  readonly uploaded = signal(0);
  readonly deferredFiles = signal<readonly File[]>([]);
  readonly freeCount = computed(() =>
    Math.min(
      this.files().length || this.processing()?.files_count || 0,
      this.usage()?.limits.remaining_today ??
        this.config()?.free?.daily ??
        this.config()?.max_files ??
        0,
      this.usage()?.limits.per_processing ??
        this.config()?.free?.per_processing ??
        this.config()?.max_files ??
        0,
    ),
  );
  readonly needsPurchase = computed(
    () => (this.files().length || this.processing()?.files_count || 0) > this.freeCount(),
  );
  readonly suggestedPackage = computed(
    () =>
      this.config()?.packages?.find(
        (p) => p.files_limit >= (this.files().length || this.processing()?.files_count || 0),
      ) ?? null,
  );
  private returned = false;
  private paywallTracked = false;
  private awaitingPaidStart = false;
  private readonly analytics = inject(AnalyticsService);
  private beganAt = 0;
  private terminalTracked = false;
  private viewTracked = false;
  private readonly api = inject(ProcessingService);
  private readonly selection = inject(XmlSelectionService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly files = this.selection.forTool(this.tool.id);
  readonly state = signal<UiState>(this.files().length ? 'files-selected' : 'idle');
  readonly processing = signal<Processing | null>(null);
  readonly error = signal('');
  readonly downloading = signal(false);
  readonly deleting = signal(false);
  readonly deleted = signal(false);
  readonly config = signal<XmlToExcelConfig | null>(null);
  readonly configError = signal('');
  readonly authPrompt = signal(false);
  readonly googleBusy = signal(false);
  readonly failedFiles = signal<readonly ProcessingFile[]>([]);
  readonly failuresLoading = signal(false);
  readonly failuresVisible = signal(false);
  readonly failuresError = signal('');
  readonly failurePage = signal(0);
  readonly visibleFailures = computed(() =>
    this.failedFiles().slice(this.failurePage() * 10, (this.failurePage() + 1) * 10),
  );
  readonly page = signal(0);
  readonly pageSize = 10;
  readonly visibleFiles = computed(() =>
    this.files().slice(this.page() * this.pageSize, (this.page() + 1) * this.pageSize),
  );
  readonly pages = computed(() => Math.ceil(this.files().length / this.pageSize));
  readonly totalSize = computed(() => this.files().reduce((sum, file) => sum + file.size, 0));
  readonly busy = computed(
    () =>
      ['uploading', 'queued', 'processing'].includes(this.state()) ||
      this.deleting() ||
      this.paymentBusy(),
  );
  readonly expired = signal(false);
  readonly dragOver = signal(false);
  readonly progress = computed(() => {
    const batch = this.processing();
    return batch?.files_count
      ? Math.round((batch.processed_files_count / batch.files_count) * 100)
      : 0;
  });

  downloadPdf(): void {
    const batch = this.processing();
    if (
      !this.productsMode ||
      this.state() !== 'completed' ||
      !batch?.result.available ||
      !batch.preview ||
      this.expired() ||
      this.deleted() ||
      this.deleting()
    )
      return;
    const url = URL.createObjectURL(productsPdf(batch.preview));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'feitoo-produtos-dos-xmls-resumo.pdf';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  decimal(value: string | null | undefined, money = false): string {
    if (value == null) return 'Não informado';
    // Format decimal strings without converting fiscal values to floating point.
    const [integer, fraction = ''] = value.split('.');
    const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const displayedFraction =
      this.productsMode && money ? fraction.replace(/0+$/, '').padEnd(2, '0') : fraction;
    return `${money ? 'R$ ' : ''}${grouped}${displayedFraction ? ',' + displayedFraction : money ? ',00' : ''}`;
  }
  private expiryTimer: ReturnType<typeof setTimeout> | undefined;
  private usageResetTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    effect(() => {
      if (this.auth.user())
        untracked(() => {
          this.loadUsage();
          const id = this.route.snapshot.queryParamMap.get('processing');
          if (id && /^[0-9a-f-]{36}$/i.test(id) && !this.returned) {
            this.returned = true;
            this.restorePayment(id);
          }
        });
    });
    effect(() => {
      if (
        this.auth.user() &&
        this.needsPurchase() &&
        this.analytics.choice() === 'granted' &&
        !this.paywallTracked
      ) {
        this.paywallTracked = true;
        if (this.usage()?.plan !== 'pro') this.analytics.track('pro_offer_viewed');
        this.analytics.track('free_limit_reached', {
          tool: this.tool.id,
          files_count_bucket: this.countBucket(),
        });
        this.analytics.track('paywall_viewed', {
          tool: this.tool.id,
          files_count_bucket: this.countBucket(),
        });
      }
      if (this.analytics.choice() === 'granted' && !this.viewTracked) {
        this.viewTracked = true;
        this.analytics.track('tool_view', {
          tool: this.tool.id,
          authenticated: !!this.auth.user(),
        });
      }
    });
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      this.loadConfig();
    }
    this.destroyRef.onDestroy(() => {
      this.clearPdf();
      clearTimeout(this.expiryTimer);
      clearTimeout(this.usageResetTimer);
    });
  }

  loadConfig(): void {
    this.configError.set('');
    this.api
      .configuration(this.tool.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.config.set(response.data);
          if (this.awaitingPaidStart) {
            this.awaitingPaidStart = false;
            this.start(undefined, true);
          }
          if (
            this.selection.continueAfterLogin &&
            this.selection.continueTool === this.tool.id &&
            this.auth.user() &&
            this.files().length
          ) {
            this.selection.continueAfterLogin = false;
            this.start();
          }
        },
        error: () =>
          this.configError.set('Não foi possível consultar os limites de envio. Tente novamente.'),
      });
  }

  size(bytes: number): string {
    const unit = bytes >= 1024 * 1024 ? 'MB' : 'KB';
    const value = bytes / (unit === 'MB' ? 1024 * 1024 : 1024);
    return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(value)} ${unit}`;
  }

  select(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.add(Array.from(input.files ?? []));
    input.value = '';
  }

  drop(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(false);
    this.add(Array.from(event.dataTransfer?.files ?? []));
  }

  dragEnter(event: DragEvent): void {
    event.preventDefault();
    if (!this.busy() && !this.processing()) this.dragOver.set(true);
  }

  dragLeave(event: DragEvent): void {
    const zone = event.currentTarget as HTMLElement;
    if (!(event.relatedTarget instanceof Node) || !zone.contains(event.relatedTarget))
      this.dragOver.set(false);
  }

  add(files: readonly File[]): void {
    if (this.busy() || this.processing()) return;
    const limits = this.config();
    const accepted = files.filter((file) => /\.xml$/i.test(file.name));
    if (
      limits &&
      (this.files().length + accepted.length > (limits.max_processing_files ?? limits.max_files) ||
        (limits.max_total_size_kb !== undefined &&
          this.totalSize() + accepted.reduce((sum, file) => sum + file.size, 0) >
            limits.max_total_size_kb * 1024) ||
        accepted.some((file) => file.size > limits.max_file_size_kb * 1024))
    ) {
      this.error.set(
        `Envie até ${limits.max_processing_files ?? limits.max_files} XMLs, com no máximo ${this.size(limits.max_file_size_kb * 1024)} por arquivo.`,
      );
      return;
    }
    this.error.set(accepted.length !== files.length ? 'Selecione somente arquivos .xml.' : '');
    this.files.update((current) => [...current, ...accepted]);
    this.state.set(this.files().length ? 'files-selected' : 'idle');
    this.processing.set(null);
    this.page.set(0);
    if (accepted.length)
      this.analytics.track('files_selected', {
        tool: this.tool.id,
        files_count: this.files().length,
        total_size_bucket: sizeBucket(this.totalSize()),
        authenticated: !!this.auth.user(),
      });
  }

  remove(index: number): void {
    if (this.busy() || this.processing()) return;
    this.files.update((files) => files.filter((_, i) => i !== index));
    this.state.set(this.files().length ? 'files-selected' : 'idle');
    this.page.set(Math.min(this.page(), Math.max(0, this.pages() - 1)));
  }

  clear(): void {
    if (this.busy()) return;
    this.files.set([]);
    this.page.set(0);
    this.authPrompt.set(false);
    this.selection.continueAfterLogin = false;
    this.error.set('');
    this.state.set('idle');
  }

  reset(): void {
    if (this.busy() || this.downloading()) return;
    const remaining = this.deferredFiles();
    this.clear();
    this.files.set(remaining);
    this.deferredFiles.set([]);
    this.state.set(remaining.length ? 'files-selected' : 'idle');
    this.purchase.set(null);
    this.paymentMessage.set('');
    this.paywallTracked = false;
    this.processing.set(null);
    this.clearPdf();
    this.documentFiles.set([]);
    this.failedFiles.set([]);
    this.failuresVisible.set(false);
    this.failuresError.set('');
    this.deleted.set(false);
    this.expired.set(false);
    clearTimeout(this.expiryTimer);
  }

  emailLogin(): void {
    this.selection.continueAfterLogin = true;
    this.selection.continueTool = this.tool.id;
    void this.router.navigate(['/login'], { queryParams: { returnTo: this.tool.path } });
  }

  google(): void {
    if (this.googleBusy()) return;
    this.googleBusy.set(true);
    this.auth
      .startGoogle('login', this.tool.path)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.googleBusy.set(false)),
      )
      .subscribe({
        next: (response) => window.location.assign(response.redirect_url),
        error: () => this.error.set('Google indisponível. Você pode entrar com e-mail.'),
      });
  }

  start(freeFilesCount?: number, paid = false): void {
    if (this.busy() || (!this.files().length && this.processing()?.status !== 'pending')) return;
    if (!this.auth.user()) {
      this.selection.continueAfterLogin = true;
      this.selection.continueTool = this.tool.id;
      this.authPrompt.set(true);
      return;
    }
    const limits = this.config();
    if (!limits) {
      if (paid) this.awaitingPaidStart = true;
      this.error.set('Aguarde a consulta dos limites de envio.');
      return;
    }
    if (!paid && freeFilesCount === undefined && this.needsPurchase()) {
      if (!this.paywallTracked && this.analytics.choice() === 'granted') {
        this.paywallTracked = true;
        this.analytics.track('free_limit_reached', {
          tool: this.tool.id,
          files_count_bucket: this.countBucket(),
        });
        this.analytics.track('paywall_viewed', {
          tool: this.tool.id,
          files_count_bucket: this.countBucket(),
        });
      }
      return;
    }
    if (
      this.files().length > (limits.max_processing_files ?? limits.max_files) ||
      this.files().some((file) => file.size > limits.max_file_size_kb * 1024)
    ) {
      this.error.set(
        'A seleção excede os limites de envio informados. Remova arquivos antes de continuar.',
      );
      return;
    }
    this.authPrompt.set(false);
    this.beganAt = Date.now();
    this.terminalTracked = false;
    this.analytics.track('upload_started', {
      tool: this.tool.id,
      files_count: this.files().length,
      total_size_bucket: sizeBucket(this.totalSize()),
      authenticated: true,
    });
    this.state.set('uploading');
    this.error.set('');
    const selected = this.files();
    const chosen = freeFilesCount === undefined ? selected : selected.slice(0, freeFilesCount);
    if (!this.processing() && freeFilesCount !== undefined)
      this.deferredFiles.set(selected.slice(freeFilesCount));
    this.prepare(chosen)
      .pipe(
        switchMap((response) => {
          this.analytics.track('upload_completed', {
            tool: this.tool.id,
            files_count: response.data.files_count,
          });
          return freeFilesCount !== undefined
            ? this.api.start(response.data.id, freeFilesCount)
            : this.api.start(response.data.id);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          this.analytics.funnel('processing_started', {
            tool: this.tool.id,
            file_count: response.data.files_count,
            plan: this.usage()?.plan ?? 'free',
          });
          this.files.set([]);
          this.update(response.data);
          this.loadUsage();
          this.poll(response.data.id);
        },
        error: (error: unknown) => {
          this.loadUsage();
          this.fail(
            error instanceof HttpErrorResponse && error.status === 413
              ? 'O lote excede o tamanho total aceito pelo servidor. Envie menos arquivos por vez.'
              : error instanceof HttpErrorResponse && error.status === 422
                ? 'Confira os XMLs e os limites de upload. O lote não foi iniciado.'
                : 'Não foi possível iniciar. Tente novamente.',
          );
          if (
            error instanceof HttpErrorResponse &&
            ['purchase_required', 'usage_limit_exceeded', 'payment_pending'].includes(
              error.error?.code,
            )
          )
            this.state.set('files-selected');
        },
      });
  }

  price(amount: number, currency = 'brl'): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(amount / 100);
  }

  loadUsage(): void {
    if (!this.auth.user()) return;
    this.billing
      .usage(this.productsMode || this.pdfMode || this.organizerMode || this.analyzerMode ? this.tool.id : undefined)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => {
          this.usage.set(r.data);
          clearTimeout(this.usageResetTimer);
          const delay = Date.parse(r.data.limits.resets_at) - Date.now();
          if (delay > 0 && delay < 2147483647)
            this.usageResetTimer = setTimeout(() => this.loadUsage(), delay + 1000);
        },
        error: () =>
          this.paymentMessage.set(
            'Não foi possível consultar seu saldo gratuito. O servidor validará o limite ao iniciar.',
          ),
      });
  }

  private countBucket(): string {
    const count = this.files().length || this.processing()?.files_count || 0;
    return count <= 20
      ? '1_to_20'
      : count <= 100
        ? '21_to_100'
        : count <= 250
          ? '101_to_250'
          : '250_plus';
  }

  private prepare(files: readonly File[]) {
    if (this.processing())
      return this.processing()!.files_count < files.length
        ? throwError(() => new Error('incomplete_upload'))
        : of({ data: this.processing()! });
    this.uploaded.set(0);
    return (
      this.organizerMode
        ? this.api.create(this.tool.id, this.organizerOptions())
        : this.api.create(this.tool.id)
    ).pipe(
      switchMap((r) => {
        this.processing.set(r.data);
        const batches: File[][] = [];
        let current: File[] = [];
        let bytes = 0;
        for (const file of files) {
          if (
            current.length >= (this.config()?.max_files ?? 20) ||
            bytes + file.size > (this.config()?.max_request_size_kb ?? 30720) * 1024
          ) {
            batches.push(current);
            current = [];
            bytes = 0;
          }
          current.push(file);
          bytes += file.size;
        }
        if (current.length) batches.push(current);
        return from(batches).pipe(
          concatMap((batch) =>
            defer(() => this.api.upload(r.data.id, batch)).pipe(
              retry({
                count: 2,
                delay: (error: unknown) =>
                  error instanceof HttpErrorResponse && error.status === 429
                    ? timer(
                        Math.min(
                          60000,
                          Math.max(1000, Number(error.headers.get('Retry-After') ?? 60) * 1000),
                        ),
                      )
                    : throwError(() => error),
              }),
              tap((response) => {
                this.processing.set(response.data);
                this.uploaded.update((n) => n + batch.length);
              }),
            ),
          ),
          last(),
          takeUntilDestroyed(this.destroyRef),
        );
      }),
    );
  }

  buy(): void {
    if (this.usage()?.plan === 'pro') return;
    if (
      this.busy() ||
      !this.auth.user() ||
      !this.suggestedPackage() ||
      !this.config()?.checkout_available
    )
      return;
    this.paymentBusy.set(true);
    this.state.set('uploading');
    this.error.set('');
    this.prepare(this.files())
      .pipe(
        // Only the final batch may create Checkout.
        takeWhile((response) => response.data.files_count < this.files().length, true),
        finalize(() => this.paymentBusy.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          if (response.data.files_count < this.files().length) return;
          this.billing
            .checkout(response.data.id)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
              next: (r) => {
                this.purchase.set(r.data.purchase);
                this.analytics.track('single_purchase_started', {
                  tool: this.tool.id,
                  files_count_bucket: this.countBucket(),
                  package_code: r.data.purchase.package_code,
                  amount: r.data.purchase.amount,
                  currency: r.data.purchase.currency,
                });
                this.state.set('files-selected');
                if (r.data.checkout_url?.startsWith('https://checkout.stripe.com/'))
                  this.billing.redirect(r.data.checkout_url);
                else this.confirmPayment(response.data.id);
              },
              error: () => {
                this.state.set('files-selected');
                this.error.set(
                  'Não foi possível abrir o pagamento. Seus arquivos não foram processados.',
                );
              },
            });
        },
        error: () =>
          this.fail(
            'Não foi possível enviar o lote. Os arquivos ainda não foram processados. Exclua o envio incompleto e tente novamente.',
          ),
      });
  }

  private restorePayment(id: string): void {
    this.paymentBusy.set(true);
    this.paymentMessage.set('Consultando seu pagamento…');
    this.api
      .get(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => {
          this.paymentBusy.set(false);
          if (r.data.tool !== this.tool.id) {
            void this.router.navigate([processingTools[r.data.tool].path], {
              queryParams: this.route.snapshot.queryParams,
            });
            return;
          }
          this.processing.set(r.data);
          if (this.organizerMode && r.data.organizer)
            this.organizerOptions.set(r.data.organizer.options);
          if (r.data.status !== 'pending') {
            this.update(r.data);
            if (['queued', 'processing'].includes(r.data.status)) this.poll(id);
            return;
          }
          this.state.set('files-selected');
          if (this.organizerMode || this.analyzerMode) {
            this.paymentMessage.set('Seu envio foi recuperado. Você pode iniciar a organização.');
            return;
          }
          if (this.route.snapshot.queryParamMap.get('payment') === 'cancelled') {
            this.paymentMessage.set(
              'Pagamento não concluído. Seus arquivos ainda não foram processados.',
            );
            this.billing
              .purchase(id)
              .pipe(takeUntilDestroyed(this.destroyRef))
              .subscribe({
                next: (p) => this.purchase.set(p.data),
                error: () => this.error.set('Não foi possível consultar a compra.'),
              });
          } else this.confirmPayment(id);
        },
        error: () => {
          this.paymentBusy.set(false);
          this.fail(
            'Não foi possível recuperar este envio. Entre na conta que enviou os arquivos.',
          );
        },
      });
  }

  confirmPayment(id = this.processing()?.id): void {
    if (!id || this.paymentBusy()) return;
    this.paymentBusy.set(true);
    this.paymentMessage.set('Confirmando seu pagamento…');
    timer(0, 2000)
      .pipe(
        take(45),
        exhaustMap(() => this.billing.purchase(id)),
        takeWhile((r) => r.data.status === 'pending', true),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.paymentBusy.set(false)),
      )
      .subscribe({
        next: (r) => {
          this.purchase.set(r.data);
          if (r.data.status === 'paid') {
            this.paymentBusy.set(false);
            this.paymentMessage.set('Pagamento confirmado. Processando seus XMLs…');
            this.analytics.trackOnce('single_purchase_completed', r.data.id, {
              purchase_type: 'single',
              tool: this.tool.id,
              value: r.data.amount / 100,
              currency: 'BRL',
            });
            this.start(undefined, true);
          } else if (r.data.status !== 'pending') {
            this.paymentMessage.set(
              r.data.status === 'expired'
                ? 'Pagamento expirado. Seus arquivos não foram processados.'
                : 'Pagamento não confirmado. Tente novamente.',
            );
            this.analytics.track('single_purchase_failed', {
              tool: this.tool.id,
              package_code: r.data.package_code,
            });
          }
        },
        error: () =>
          this.paymentMessage.set(
            'Não foi possível confirmar agora. Consulte novamente ou veja sua conta.',
          ),
        complete: () => {
          if (this.purchase()?.status === 'pending')
            this.paymentMessage.set(
              'A confirmação ainda não chegou. Você pode consultar novamente.',
            );
        },
      });
  }

  useFree(): void {
    if (this.busy() || this.freeCount() < 1) return;
    const id = this.processing()?.id;
    if (!id || !this.purchase()) {
      this.start(this.freeCount());
      return;
    }
    this.paymentBusy.set(true);
    this.billing
      .cancel(id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.paymentBusy.set(false)),
      )
      .subscribe({
        next: (r) => {
          this.purchase.set(r.data);
          this.paymentBusy.set(false);
          this.start(this.freeCount());
        },
        error: () =>
          this.error.set(
            'Não foi possível encerrar o Checkout. Consulte a confirmação antes de continuar.',
          ),
      });
  }

  private poll(id: string): void {
    timer(1000, 2000)
      .pipe(
        take(300),
        exhaustMap(() => this.api.get(id)),
        takeWhile((response) => ['queued', 'processing'].includes(response.data.status), true),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => this.update(response.data),
        error: () => this.fail('Não foi possível consultar o processamento.'),
        complete: () => {
          if (this.busy())
            this.fail('A consulta atingiu o tempo limite. Você pode consultar novamente.');
        },
      });
  }

  refresh(): void {
    const processing = this.processing();
    if (!processing || this.busy()) return;
    this.state.set('processing');
    this.error.set('');
    this.poll(processing.id);
  }

  private update(processing: Processing): void {
    this.processing.set(processing);
    if (this.organizerMode && processing.organizer)
      this.organizerOptions.set(processing.organizer.options);
    if (this.pdfMode || this.organizerMode || this.analyzerMode) this.loadDocumentFiles();
    if (processing.status === 'completed') {
      if (!this.terminalTracked) {
        this.terminalTracked = true;
        const properties = {
          tool: this.tool.id,
          files_count: processing.files_count,
          success_count: processing.successful_files_count,
          failure_count: processing.failed_files_count,
          processing_duration_bucket: durationBucket(Date.now() - this.beganAt),
        };
        this.analytics.funnel('processing_completed', {
          tool: this.tool.id,
          file_count: processing.files_count,
          plan: this.usage()?.plan ?? 'free',
          processing_result: processing.failed_files_count > 0 ? 'partial' : 'success',
        });
        this.analytics.track('result_viewed', properties);
      }
      this.state.set('completed');
      this.files.set([]);
      this.watchExpiry(processing);
      if (this.pdfMode || this.organizerMode || this.analyzerMode) this.loadUsage();
    } else if (processing.status === 'queued' || processing.status === 'processing') {
      this.state.set(processing.status);
    } else {
      if ((this.organizerMode || this.analyzerMode) && processing.status === 'failed') this.loadUsage();
      if (processing.status === 'failed' && !this.terminalTracked) {
        this.terminalTracked = true;
        this.analytics.track('processing_failed', {
          tool: this.tool.id,
          success_count: processing.successful_files_count,
          failure_count: processing.failed_files_count,
        });
      }
      this.files.set([]);
      this.fail(
        processing.status === 'expired'
          ? 'O prazo dos arquivos terminou. Selecione outros XMLs para continuar.'
          : processing.successful_files_count === 0 && processing.processed_files_count > 0
            ? 'Não encontramos NF-e válidas nesses arquivos.'
            : (processing.result.error_message ?? 'Processamento indisponível ou expirado.'),
      );
    }
  }

  private watchExpiry(processing: Processing): void {
    clearTimeout(this.expiryTimer);
    const remaining = processing.expires_at ? Date.parse(processing.expires_at) - Date.now() : 0;
    this.expired.set(!processing.result.available || remaining <= 0);
    if (remaining > 0)
      this.expiryTimer = setTimeout(
        () => {
          this.expired.set(true);
          this.clearPdf();
          this.documentFiles.set([]);
        },
        Math.min(remaining, 2147483647),
      );
  }

  showFailures(): void {
    const batch = this.processing();
    if (!batch || !batch.failed_files_count || this.failuresLoading()) return;
    this.failuresVisible.set(true);
    this.failuresError.set('');
    this.failuresLoading.set(true);
    this.api
      .listFiles(batch.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.failuresLoading.set(false)),
      )
      .subscribe({
        next: (response) => {
          if (this.deleted()) return;
          this.failurePage.set(0);
          this.failedFiles.set(response.data.filter((file) => file.status === 'failed'));
        },
        error: () =>
          this.failuresError.set('Não foi possível consultar os arquivos. Tente novamente.'),
      });
  }

  deleteFiles(): void {
    const batch = this.processing();
    if (!batch || this.busy() || this.downloading()) return;
    this.deleting.set(true);
    this.error.set('');
    this.api
      .deleteFiles(batch.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.deleting.set(false)),
      )
      .subscribe({
        next: () => {
          clearTimeout(this.expiryTimer);
          this.analytics.track('files_deleted', { tool: this.tool.id });
          this.deleted.set(true);
          this.clearPdf();
          this.documentFiles.set([]);
          this.processing.update((current) => (current ? { ...current, preview: null } : null));
          this.expired.set(true);
          this.failedFiles.set([]);
          this.failuresVisible.set(false);
          this.files.set([]);
        },
        error: () => this.error.set('Não foi possível excluir agora. Tente novamente.'),
      });
  }

  download(): void {
    const processing = this.processing();
    if (
      !processing?.result.available ||
      this.downloading() ||
      this.expired() ||
      this.deleted() ||
      this.deleting()
    )
      return;
    this.analytics.track('download_clicked', { tool: this.tool.id });
    this.downloading.set(true);
    this.api
      .download(processing.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.downloading.set(false)),
      )
      .subscribe({
        next: (response) => {
          if (!response.body) return;
          const disposition = response.headers.get('Content-Disposition') ?? '';
          const fileName =
            /filename="?([^";]+)"?/i.exec(disposition)?.[1] ??
            processing.result.file_name ??
            `feitoo-${this.tool.path.slice(1)}.xlsx`;
          const url = URL.createObjectURL(response.body);
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = fileName;
          anchor.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        },
        error: () => this.error.set('Não foi possível baixar. O resultado pode ter expirado.'),
      });
  }

  private fail(message: string): void {
    this.error.set(message);
    this.state.set('error');
  }
}
