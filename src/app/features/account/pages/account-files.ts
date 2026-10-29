import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize, timer } from 'rxjs';
import { ElementRef, Injector, afterNextRender, viewChild } from '@angular/core';
import { AuthService } from '../../auth/services/auth.service';
import { AccountService } from '../services/account.service';
import { HistoryProcessing } from '../models/account';
import { ProcessingService } from '../../processing/services/processing.service';
import { processingTools } from '../../processing/tools';
import { AccountErrors } from '../services/account-errors';
@Component({
  selector: 'app-account-files',
  imports: [DatePipe, RouterLink],
  templateUrl: './account-files.html',
  styleUrl: './account-files.scss',
})
export class AccountFilesPage {
  readonly auth = inject(AuthService);
  private readonly api = inject(AccountService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly errors = inject(AccountErrors);
  private errorText(error: unknown, fallback: string): string {
    return error instanceof HttpErrorResponse ? this.errors.handle(error) : fallback;
  }
  readonly tools = {
    ...processingTools,
    'quotation-generator': { name: 'Orçamento profissional', path: '/gerador-de-orcamentos' },
  };
  private readonly processingApi = inject(ProcessingService);
  private readonly injector = inject(Injector);
  private readonly confirmButton = viewChild<ElementRef<HTMLButtonElement>>('confirmButton');
  private readonly historyTitle = viewChild<ElementRef<HTMLElement>>('historyTitle');
  private deleteTrigger: HTMLButtonElement | null = null;
  readonly loading = signal(false);
  readonly history = signal<readonly HistoryProcessing[]>([]);
  readonly historyError = signal('');
  readonly historyMessage = signal('');
  readonly page = signal(1);
  readonly lastPage = signal(1);
  readonly total = signal(0);
  readonly confirming = signal<HistoryProcessing | null>(null);
  readonly action = signal<{ id: string; kind: 'download' | 'delete' } | null>(null);
  readonly now = signal(Date.now());

  fiscalTotal(value: string): string {
    // Keep decimal digits as text, including values larger than Number's safe range.
    const [whole, fraction = ''] = value.split('.');
    return `R$ ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${fraction.padEnd(2, '0')}`;
  }

  constructor() {
    this.loadHistory();
    timer(15000, 15000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.now.set(Date.now()));
  }
  loadHistory(page = this.page()): void {
    if (this.errors.blocked() || this.loading() || this.action() || this.confirming()) return;
    this.loading.set(true);
    this.historyError.set('');
    this.api
      .history(page)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (response) => {
          this.history.set(response.data);
          this.page.set(response.meta.current_page);
          this.lastPage.set(response.meta.last_page);
          this.total.set(response.meta.total);
          this.now.set(Date.now());
        },
        error: (error) => {
          this.historyError.set(
            this.errorText(
              error,
              'Não foi possível carregar seus processamentos. Tente novamente.',
            ),
          );
        },
      });
  }

  expired(batch: HistoryProcessing): boolean {
    return (
      batch.status === 'expired' || !batch.expires_at || Date.parse(batch.expires_at) <= this.now()
    );
  }

  available(batch: HistoryProcessing): boolean {
    return batch.result.available && !batch.files_deleted && !this.expired(batch);
  }

  status(batch: HistoryProcessing): string {
    if (batch.files_deleted) return 'Arquivos excluídos';
    if (this.expired(batch)) return 'Resultado expirado';
    return {
      pending: 'Aguardando envio',
      uploading: 'Enviando',
      queued: 'Aguardando',
      processing: 'Processando',
      completed: 'Concluído',
      failed: 'Falhou',
      expired: 'Expirado',
    }[batch.status];
  }

  download(batch: HistoryProcessing): void {
    this.now.set(Date.now());
    if (this.errors.blocked() || !this.available(batch) || this.action() || this.confirming())
      return;
    this.historyError.set('');
    this.historyMessage.set('');
    this.action.set({ id: batch.id, kind: 'download' });
    this.processingApi
      .download(batch.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.action.set(null)),
      )
      .subscribe({
        next: (response) => {
          if (!response.body) {
            this.historyError.set('O arquivo não está disponível. Atualize o histórico.');
            return;
          }
          const url = URL.createObjectURL(response.body);
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download =
            /filename="?([^";]+)"?/i.exec(response.headers.get('Content-Disposition') ?? '')?.[1] ??
            batch.result.file_name ??
            'feitoo-xml-para-excel.xlsx';
          anchor.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          this.historyMessage.set('Download iniciado.');
        },
        error: (error) => {
          this.historyError.set(
            this.errorText(
              error,
              'Não foi possível baixar. O resultado pode ter expirado; atualize o histórico.',
            ),
          );
        },
      });
  }

  requestDelete(batch: HistoryProcessing, event: Event): void {
    if (!batch.can_delete_files || this.action() || this.loading()) return;
    this.deleteTrigger = event.currentTarget as HTMLButtonElement;
    this.historyError.set('');
    this.historyMessage.set('');
    this.confirming.set(batch);
    afterNextRender(() => this.confirmButton()?.nativeElement.focus(), { injector: this.injector });
  }

  cancelDelete(): void {
    if (this.action()) return;
    this.confirming.set(null);
    // Wait until Angular removes the disabled state from the original button.
    afterNextRender(() => this.deleteTrigger?.focus(), { injector: this.injector });
  }

  deleteFiles(): void {
    const batch = this.confirming();
    if (this.errors.blocked() || !batch || this.action()) return;
    this.action.set({ id: batch.id, kind: 'delete' });
    this.historyError.set('');
    this.processingApi
      .deleteFiles(batch.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.action.set(null)),
      )
      .subscribe({
        next: () => {
          this.history.update((rows) =>
            rows.map((row) =>
              row.id === batch.id
                ? {
                    ...row,
                    files_deleted: true,
                    can_delete_files: false,
                    status: 'expired',
                    result: { available: false, file_name: null },
                  }
                : row,
            ),
          );
          this.confirming.set(null);
          this.historyMessage.set('Arquivos excluídos. O registro permanece no histórico.');
          this.historyTitle()?.nativeElement.focus();
        },
        error: (error) => {
          this.historyError.set(
            this.errorText(error, 'Não foi possível excluir os arquivos. Tente novamente.'),
          );
        },
      });
  }
}
