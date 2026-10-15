import { Component, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { KeyValuePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, catchError, finalize, of, switchMap, timer } from 'rxjs';
import { AnalysisQuery, AnalysisView } from '../models/analysis';
import { ProcessingService } from '../services/processing.service';
import { AnalysisPager } from './analysis-pager';

@Component({
  selector: 'app-xml-analyzer-dashboard', imports: [FormsModule, KeyValuePipe, AnalysisPager],
  templateUrl: './xml-analyzer-dashboard.html', styleUrl: './xml-analyzer-dashboard.scss',
})
export class XmlAnalyzerDashboard {
  readonly id = input.required<string>();
  private readonly api = inject(ProcessingService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly requests = new Subject<{ id: string; query: AnalysisQuery }>();
  readonly view = signal<AnalysisView | null>(null);
  readonly loading = signal(true); readonly error = signal(''); readonly exporting = signal(false);
  readonly query = signal<AnalysisQuery>({ issuer_sort: 'value', document_sort: 'date', direction: 'desc', per_page: 25 });
  constructor() {
    this.requests.pipe(switchMap(({ id, query }) => {
      this.loading.set(true); this.error.set('');
      return timer(250).pipe(switchMap(() => this.api.analysis(id, query).pipe(catchError((error: unknown) => {
        this.view.set(null);
        this.error.set(error instanceof HttpErrorResponse && error.status === 410 ? 'Resultado expirado. Envie um novo lote.' : error instanceof HttpErrorResponse && error.status === 422 ? 'Confira o intervalo e os filtros informados.' : 'Não foi possível carregar a análise. Tente novamente.');
        return of(null);
      }), finalize(() => this.loading.set(false)))));
    }), takeUntilDestroyed(this.destroyRef)).subscribe((response) => { if (response) this.view.set(response.data); });
    effect(() => { const id = this.id(); this.requests.next({ id, query: this.query() }); });
  }
  set<K extends keyof AnalysisQuery>(key: K, value: AnalysisQuery[K]): void {
    this.loading.set(true);
    const pageKeys: readonly string[] = ['document_page', 'product_page', 'issuer_page', 'issue_page'];
    this.query.update((q) => ({ ...q, ...(pageKeys.includes(key) ? {} : { document_page: 1, product_page: 1, issuer_page: 1, issue_page: 1 }), [key]: value }));
  }
  reset(): void { this.loading.set(true); this.query.set({ issuer_sort: 'value', document_sort: 'date', direction: 'desc', per_page: 25 }); }
  retry(): void { this.requests.next({ id: this.id(), query: this.query() }); }
  decimal(value: string | null | undefined, money = false): string {
    if (value == null) return 'Não informado';
    const [integer, fraction = ''] = value.split('.');
    const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${money ? 'R$ ' : ''}${grouped}${fraction ? ',' + fraction.padEnd(money ? 2 : 0, '0') : money ? ',00' : ''}`;
  }
  date(value: string | null | undefined): string { const part = value?.slice(0, 10); return part ? part.split('-').reverse().join('/') : 'Não informada'; }
  status(value: string): string { return ({ included: 'Considerado', duplicate: 'Duplicado ignorado', conflict: 'Conflito excluído', invalid: 'Falha na análise' } as Record<string, string>)[value] ?? value; }
  export(): void {
    if (this.exporting() || this.loading() || !this.view()) return;
    this.exporting.set(true);
    this.api.exportAnalysis(this.id(), this.query()).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.exporting.set(false))).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'feitoo-analise-xml.xlsx'; anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }, error: () => this.error.set('Não foi possível exportar. Confira se o resultado ainda está disponível.'),
    });
  }
}
