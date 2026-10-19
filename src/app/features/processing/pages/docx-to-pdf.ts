import {
  ToolHero,
  ToolWorkspace,
  ToolUploader,
  ToolStatus,
  ToolSecurityNote,
  ToolRelated,
} from './tool-experience';
import { DatePipe, isPlatformBrowser } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  DestroyRef,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  concatMap,
  exhaustMap,
  finalize,
  from,
  last,
  map,
  retry,
  switchMap,
  takeWhile,
  timer,
} from 'rxjs';
import { AnalyticsService } from '../../../core/analytics.service';
import { toolFaqs } from '../../../core/tool-faqs';
import { AuthService } from '../../auth/services/auth.service';
import { Processing, ProcessingFile, ProcessingConfig } from '../models/processing';
import { BillingService, Usage } from '../services/billing.service';
import { ProcessingService } from '../services/processing.service';
import { FileSelectionService } from '../services/file-selection.service';

@Component({
  selector: 'app-docx-to-pdf',
  host: { class: 'tool-app' },
  imports: [
    ToolHero,
    ToolWorkspace,
    ToolUploader,
    ToolStatus,
    ToolSecurityNote,
    ToolRelated,
    RouterLink,
    DatePipe,
  ],
  templateUrl: './docx-to-pdf.html',
  styleUrl: './docx-to-pdf.scss',
})
export class DocxToPdfPage {
  pdfName(name: string | null): string {
    return (name ?? 'documento.docx').replace(/\.docx$/i, '.pdf');
  }
  readonly auth = inject(AuthService);
  private readonly api = inject(ProcessingService);
  private readonly billing = inject(BillingService);
  private readonly selection = inject(FileSelectionService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly analytics = inject(AnalyticsService);
  private readonly destroyRef = inject(DestroyRef);
  readonly files = this.selection.forTool('docx_to_pdf');
  readonly faqs = toolFaqs['/docx-para-pdf'];
  readonly config = signal<ProcessingConfig | null>(null);
  readonly usage = signal<Usage | null>(null);
  readonly processing = signal<Processing | null>(null);
  readonly results = signal<readonly ProcessingFile[]>([]);
  readonly error = signal('');
  readonly selectionErrors = signal<readonly string[]>([]);
  readonly busy = signal(false);
  readonly downloading = signal(false);
  readonly dragging = signal(false);
  readonly authPrompt = signal(false);
  readonly now = signal(Date.now());
  readonly expired = computed(
    () =>
      this.processing()?.status === 'expired' ||
      (!!this.processing()?.expires_at && Date.parse(this.processing()!.expires_at!) <= this.now()),
  );
  readonly finished = computed(() =>
    ['completed', 'failed'].includes(this.processing()?.status ?? ''),
  );
  readonly progress = computed(() => {
    const batch = this.processing();
    return batch?.files_count
      ? Math.round((100 * batch.processed_files_count) / batch.files_count)
      : 0;
  });
  readonly limits = computed(
    () =>
      this.usage()?.limits ?? {
        per_processing: this.config()?.free?.per_processing ?? 0,
        remaining_today: this.config()?.free?.daily ?? 0,
      },
  );
  private restored = false;
  private viewTracked = false;
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  constructor() {
    effect(() => {
      if (this.analytics.choice() === 'granted' && !this.viewTracked) {
        this.viewTracked = true;
        this.analytics.track('tool_view', { tool: 'docx_to_pdf' });
      }
    });
    effect(() => {
      if (this.auth.user() && this.browser)
        untracked(() => {
          this.loadUsage();
          const id = this.route.snapshot.queryParamMap.get('processing');
          if (id && /^[0-9a-f-]{36}$/i.test(id) && !this.restored) {
            this.restored = true;
            this.busy.set(true);
            this.poll(id);
          }
        });
    });
    if (this.browser) {
      this.loadConfig();
      timer(0, 1000)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => {
          this.now.set(Date.now());
          if (this.expired()) {
            this.results.set([]);
            this.busy.set(false);
          }
        });
    }
  }

  loadConfig(): void {
    this.api
      .configuration('docx_to_pdf')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => {
          this.config.set(r.data);
          this.resumeLogin();
        },
        error: () => this.error.set('Não foi possível carregar os limites. Tente novamente.'),
      });
  }
  loadUsage(): void {
    this.billing
      .usage('docx_to_pdf')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => {
          this.usage.set(r.data);
          this.resumeLogin();
        },
        error: () => this.error.set('Não foi possível consultar seu limite. Tente novamente.'),
      });
  }
  private resumeLogin(): void {
    if (
      this.config() &&
      this.usage() &&
      this.selection.continueAfterLogin &&
      this.selection.continueTool === 'docx_to_pdf'
    ) {
      this.selection.continueAfterLogin = false;
      if (this.files().length) this.start();
    }
  }

  select(list: FileList | readonly File[] | null): void {
    if (!list || this.busy() || this.processing() || !this.config()) return;
    const selected = [...this.files()];
    const errors: string[] = [];
    for (const file of Array.from(list)) {
      if (!/\.docx$/i.test(file.name)) {
        errors.push(`${file.name}: envie um arquivo DOCX válido.`);
        continue;
      }
      if (!file.size || file.size > this.config()!.max_file_size_kb * 1024) {
        errors.push(`${file.name}: tamanho não permitido.`);
        continue;
      }
      if (selected.length >= (this.config()!.max_processing_files ?? this.config()!.max_files)) {
        errors.push('Quantidade máxima de documentos por lote atingida.');
        break;
      }
      if (
        selected.reduce((size, f) => size + f.size, file.size) >
        (this.config()!.max_total_size_kb ?? 0) * 1024
      ) {
        errors.push(`${file.name}: o lote excede o tamanho total permitido.`);
        continue;
      }
      selected.push(file);
    }
    this.files.set(selected);
    this.selectionErrors.set(errors);
    this.error.set('');
  }
  drop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    this.select(event.dataTransfer?.files ?? null);
  }
  remove(index: number): void {
    if (!this.busy()) this.files.update((files) => files.filter((_, i) => i !== index));
  }
  login(register = false): void {
    this.selection.continueAfterLogin = true;
    this.selection.continueTool = 'docx_to_pdf';
    void this.router.navigate([register ? '/cadastro' : '/login'], {
      queryParams: { returnTo: '/docx-para-pdf' },
    });
  }
  google(): void {
    this.auth
      .startGoogle('login', '/docx-para-pdf')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => window.location.assign(r.redirect_url),
        error: () => this.error.set('Google indisponível. Você pode entrar com e-mail.'),
      });
  }
  start(): void {
    if (this.busy() || this.processing() || !this.files().length || !this.config()) return;
    if (!this.auth.user()) {
      this.authPrompt.set(true);
      return;
    }
    if (!this.usage()) {
      this.loadUsage();
      this.error.set('Aguarde a consulta do seu limite e tente novamente.');
      return;
    }
    if (
      this.files().length > Math.min(this.limits().per_processing, this.limits().remaining_today)
    ) {
      this.error.set(
        'O lote ultrapassa seu limite disponível. Remova documentos ou consulte os planos. A compra avulsa não está disponível para esta ferramenta.',
      );
      return;
    }
    const files = [...this.files()];
    const groups: File[][] = [];
    let current: File[] = [];
    let size = 0;
    for (const file of files) {
      const requestLimit = (this.config()!.max_request_size_kb ?? 0) * 1024;
      if (file.size > requestLimit) {
        this.error.set('Um documento excede o limite de envio.');
        return;
      }
      if (current.length >= this.config()!.max_files || size + file.size > requestLimit) {
        groups.push(current);
        current = [];
        size = 0;
      }
      current.push(file);
      size += file.size;
    }
    if (current.length) groups.push(current);
    this.busy.set(true);
    this.error.set('');
    this.authPrompt.set(false);
    this.api
      .create('docx_to_pdf')
      .pipe(
        switchMap((r) => {
          this.processing.set(r.data);
          return from(groups).pipe(
            concatMap((group) => this.api.upload(r.data.id, group)),
            last(),
          );
        }),
        switchMap((r) => this.api.start(r.data.id)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (r) => {
          this.processing.set(r.data);
          this.files.set([]);
          this.analytics.trackOnce('processing_started', r.data.id, {
            tool: 'docx_to_pdf',
            file_count: r.data.files_count,
            plan: this.usage()?.plan ?? 'free',
          });
          this.poll(r.data.id);
        },
        error: (e) => {
          this.busy.set(false);
          this.error.set(this.message(e));
        },
      });
  }
  private poll(id: string): void {
    timer(0, 3000)
      .pipe(
        exhaustMap(() => this.api.get(id).pipe(retry({ count: 2, delay: 1000 }))),
        takeWhile(
          (r) =>
            r.data.tool === 'docx_to_pdf' &&
            ['queued', 'processing'].includes(r.data.status) &&
            !this.expired(),
          true,
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (r) => {
          if (r.data.tool !== 'docx_to_pdf') {
            this.busy.set(false);
            this.error.set('Processamento de outra ferramenta.');
            return;
          }
          this.processing.set(r.data);
          this.loadResults();
          if (!['queued', 'processing'].includes(r.data.status)) {
            this.busy.set(false);
            this.loadUsage();
            if (r.data.status === 'completed')
              this.analytics.trackOnce('processing_completed', id, {
                tool: 'docx_to_pdf',
                file_count: r.data.files_count,
                plan: this.usage()?.plan ?? 'free',
                processing_result: r.data.failed_files_count ? 'partial' : 'success',
              });
          }
        },
        error: (e) => {
          this.busy.set(false);
          this.error.set(this.message(e));
        },
      });
  }
  refresh(): void {
    const batch = this.processing();
    if (batch && !this.busy() && !this.expired()) {
      this.busy.set(true);
      this.poll(batch.id);
    }
  }
  loadResults(): void {
    const batch = this.processing();
    if (!batch || this.expired()) return;
    this.api
      .listFiles(batch.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => {
          if (!this.expired() && this.processing()?.id === batch.id) this.results.set(r.data);
        },
        error: (e) => this.error.set(this.message(e)),
      });
  }
  download(file?: ProcessingFile): void {
    const batch = this.processing();
    if (
      !batch ||
      this.expired() ||
      this.downloading() ||
      batch.status !== 'completed' ||
      (file && file.status !== 'completed')
    )
      return;
    this.downloading.set(true);
    const request = file
      ? this.api.pdf(batch.id, file.id)
      : this.api.download(batch.id).pipe(map((response) => response.body));
    request
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.downloading.set(false)),
      )
      .subscribe({
        next: (blob) => {
          if (this.expired() || this.processing()?.id !== batch.id) return;
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = file
            ? (file.original_name ?? 'documento.docx').replace(/\.docx$/i, '.pdf')
            : 'feitoo-documentos-pdf.zip';
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        },
        error: (e) => this.error.set(this.message(e)),
      });
  }
  deleteFiles(): void {
    const batch = this.processing();
    if (!batch || this.busy()) return;
    this.busy.set(true);
    this.api
      .deleteFiles(batch.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.busy.set(false)),
      )
      .subscribe({
        next: (r) => {
          this.processing.set(r.data);
          this.results.set([]);
          this.files.set([]);
          this.loadUsage();
        },
        error: (e) => this.error.set(this.message(e)),
      });
  }
  reset(): void {
    if (!this.busy()) {
      this.processing.set(null);
      this.results.set([]);
      this.error.set('');
      this.selectionErrors.set([]);
    }
  }
  private message(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 401) return 'Entre na sua conta para continuar.';
      if (error.status === 410) {
        this.processing.update((p) => (p ? { ...p, status: 'expired' } : p));
        this.results.set([]);
        return 'Os arquivos expiraram. Selecione os documentos novamente.';
      }
      if (error.status === 422 || error.status === 413)
        return 'Confira os arquivos, seus tamanhos e os limites do seu plano.';
    }
    return 'Não foi possível concluir a operação. Tente novamente.';
  }
}
