import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsService } from '../../../core/analytics.service';
import { AuthService } from '../../auth/services/auth.service';
import { AnalysisView } from '../models/analysis';
import { Processing } from '../models/processing';
import { BillingService } from '../services/billing.service';
import { ProcessingService } from '../services/processing.service';
import { XmlSelectionService } from '../services/xml-selection.service';
import { XmlToExcelPage } from './xml-to-excel';
import { XmlAnalyzerDashboard } from './xml-analyzer-dashboard';

const issuerId = 'a'.repeat(64);
const view: AnalysisView = {
  notice: 'Status atual na SEFAZ não consultado; tributos destacados não representam recolhimento.', filters: {},
  summary: { documents_count: 1, total_value: '25.00', average_value: '25.00', documents_with_total: 1, documents_without_total: 0, issuers_count: 1, untrusted_issuer_groups: 0, products_count: 1, items_count: 2, period_start: '2026-11-01', period_end: '2026-11-01' },
  audit: { uploaded_files: 5, analyzed_files: 4, considered_documents: 1, duplicates_ignored: 1, conflict_files: 2, conflicting_keys: 1, invalid_files: 1 },
  monthly: [{ month: '2026-11', documents_count: 1, total_value: '25.00', documents_without_total: 0, value_bar: '100', count_bar: '100' }],
  issuer_options: [{ id: issuerId, name: 'Emitente A', document: '12345678000195', trusted: true }],
  issuers: { page: 1, per_page: 25, total: 1, last_page: 1, data: [{ id: issuerId, name: 'Emitente A', document: '12345678000195', trusted: true, documents_count: 1, total_value: '25.00', percentage: '100.00', last_issue_date: '2026-11-01', documents_without_total: 0 }] },
  products: { page: 1, per_page: 25, total: 1, last_page: 1, data: [{ code: '001', product: 'Produto sintético', ncm: '09012100', unit: 'UN', total_quantity: '0.0003', total_value: '25.00', invoice_count: 1, issuer_name: 'Emitente A', issuer_document: '12345678000195', issuer_id: issuerId }] },
  documents: { page: 1, per_page: 25, total: 5, last_page: 2, data: [{ file_id: 'first', file_name: 'nota.xml', included: true, analysis_status: 'included', number: '123', series: '1', access_key: '1'.repeat(44), issued_at: '2026-11-01T00:00:00+14:00', issuer_name: 'Emitente A', recipient_name: null, total_value: '25.00', notes: [] }] },
  taxes: { ICMS: { total: '4.50', documents_with_field: 1, documents_without_field: 0, source: 'total/ICMSTot' }, IPI: { total: null, documents_with_field: 0, documents_without_field: 1, source: 'total/ICMSTot' } },
  inconsistencies: { page: 1, per_page: 25, total: 1, last_page: 1, data: [{ file_name: 'conflict.xml', access_key: '2'.repeat(44), status: 'conflict', message: 'Todos os participantes foram excluídos.' }] },
};
const api = { configuration: vi.fn(), create: vi.fn(), upload: vi.fn(), start: vi.fn(), get: vi.fn(), listFiles: vi.fn(), analysis: vi.fn(), exportAnalysis: vi.fn() };
const user = signal<object | null>({ id: 1 });
const batch: Processing = { id: 'analysis-batch', tool: 'xml-analyzer', status: 'queued', files_count: 5, processed_files_count: 0, successful_files_count: 0, failed_files_count: 0, total_size: 30, started_at: null, completed_at: null, created_at: '2026-10-15', expires_at: '2099-01-01', result: { available: false, file_name: null, size: null, error_message: null } };

beforeEach(() => {
  vi.useFakeTimers(); user.set({ id: 1 });
  api.analysis.mockReturnValue(of({ data: view })); api.exportAnalysis.mockReturnValue(of(new Blob(['xlsx'])));
  api.configuration.mockReturnValue(of({ data: { max_files: 20, max_processing_files: 250, max_file_size_kb: 10240, ttl_minutes: 120, free: { per_processing: 20, daily: 50 }, packages: [], checkout_available: false } }));
  api.create.mockReturnValue(of({ data: { ...batch, status: 'pending', files_count: 0 } }));
  api.upload.mockReturnValue(of({ data: { ...batch, status: 'pending' } })); api.start.mockReturnValue(of({ data: batch }));
  api.get.mockReturnValue(of({ data: { ...batch, status: 'completed', processed_files_count: 5, successful_files_count: 4, failed_files_count: 1, result: { available: true, file_name: 'analysis.xlsx', size: 10, error_message: null } } }));
  api.listFiles.mockReturnValue(of({ data: [] }));
});
afterEach(() => { TestBed.resetTestingModule(); vi.useRealTimers(); vi.clearAllMocks(); });

describe('Analyser shared upload flow', () => {
  async function create() {
    await TestBed.configureTestingModule({ imports: [XmlToExcelPage], providers: [provideRouter([]),
      { provide: ActivatedRoute, useValue: { snapshot: { data: { tool: 'xml-analyzer' }, queryParamMap: new Map() } } },
      { provide: AuthService, useValue: { user } }, { provide: ProcessingService, useValue: api },
      { provide: BillingService, useValue: { usage: () => of({ data: { plan: 'free', limits: { per_processing: 20, daily: 50, remaining_today: 50, used_today: 0, resets_at: '2099-01-01' } } }) } },
      { provide: AnalyticsService, useValue: { choice: signal('denied'), track: vi.fn(), funnel: vi.fn() } },
    ] }).compileComponents();
    const f = TestBed.createComponent(XmlToExcelPage); f.detectChanges(); return f;
  }
  it('selects publicly, isolates files and keeps the analyzer return path on login', async () => {
    user.set(null); const f = await create(); const page = f.componentInstance;
    expect(f.nativeElement.querySelector('h1').textContent.trim()).toBe('Analisador de XMLs Online');
    expect(api.configuration).toHaveBeenCalledWith('xml-analyzer');
    page.add([new File(['<NFe/>'], 'a.xml')]); page.start();
    expect(api.create).not.toHaveBeenCalled(); expect(page.authPrompt()).toBe(true);
    expect(TestBed.inject(XmlSelectionService).forTool('xml-organizer')()).toHaveLength(0);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    page.emailLogin(); expect(navigate).toHaveBeenCalledWith(['/login'], { queryParams: { returnTo: '/analisar-xml' } });
  });
  it('uploads, polls and opens the real dashboard component with duplicate/conflict states', async () => {
    const f = await create(); const page = f.componentInstance;
    page.add([new File(['<NFe/>'], 'a.xml')]); f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Analisar XMLs');
    page.start(); expect(api.create).toHaveBeenCalledWith('xml-analyzer');
    await vi.advanceTimersByTimeAsync(1000); f.detectChanges(); await vi.advanceTimersByTimeAsync(300); f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Sua análise está pronta');
    expect(f.nativeElement.querySelector('app-xml-analyzer-dashboard')).not.toBeNull();
    expect(f.nativeElement.textContent).toContain('cópias idênticas ignoradas');
    expect(f.nativeElement.textContent).toContain('arquivos em conflito');
    expect(f.nativeElement.textContent).toContain('Conclusão parcial');
    expect(f.nativeElement.textContent).toContain('Baixar Excel completo do lote');
    expect(api.analysis).toHaveBeenCalledWith('analysis-batch', expect.any(Object));
  });
});

describe('Analyzer dashboard controls', () => {
  async function create() {
    await TestBed.configureTestingModule({ imports: [XmlAnalyzerDashboard], providers: [{ provide: ProcessingService, useValue: api }] }).compileComponents();
    const f = TestBed.createComponent(XmlAnalyzerDashboard); f.componentRef.setInput('id', 'analysis-batch'); f.detectChanges();
    await vi.advanceTimersByTimeAsync(300); f.detectChanges(); return f;
  }
  it('preserves decimal strings and fiscal dates, uses scoped filters and paginated requests', async () => {
    const f = await create(); const component = f.componentInstance;
    expect(component.decimal('9007199254740993.01', true)).toBe('R$ 9.007.199.254.740.993,01');
    expect(component.date('2026-11-01T00:00:00+14:00')).toBe('01/11/2026');
    expect(f.nativeElement.textContent).toContain('0,0003'); expect(f.nativeElement.textContent).toContain('Não informado');
    expect(f.nativeElement.querySelectorAll('.value-bar')).toHaveLength(1);
    component.set('from', '2026-11-01'); component.set('product_query', 'Produto'); f.detectChanges();
    await vi.advanceTimersByTimeAsync(300); f.detectChanges();
    expect(api.analysis).toHaveBeenLastCalledWith('analysis-batch', expect.objectContaining({ from: '2026-11-01', product_query: 'Produto', document_page: 1 }));
    component.set('document_page', 2); f.detectChanges(); await vi.advanceTimersByTimeAsync(300); f.detectChanges();
    expect(api.analysis).toHaveBeenLastCalledWith('analysis-batch', expect.objectContaining({ document_page: 2 }));
    const objectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:analysis');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    component.export(); expect(api.exportAnalysis).toHaveBeenCalledWith('analysis-batch', expect.objectContaining({ from: '2026-11-01', product_query: 'Produto' }));
    await vi.advanceTimersByTimeAsync(1000); expect(revoke).toHaveBeenCalledWith('blob:analysis');
    objectUrl.mockRestore(); revoke.mockRestore(); click.mockRestore();
  });
  it('discards stale requests and clears fiscal data on expiry', async () => {
    const f = await create(); const pending = new Subject<{ data: AnalysisView }>();
    api.analysis.mockReturnValueOnce(pending);
    f.componentInstance.set('document_query', 'old'); f.detectChanges(); await vi.advanceTimersByTimeAsync(300);
    f.componentInstance.set('document_query', 'new'); f.detectChanges();
    pending.next({ data: { ...view, summary: { ...view.summary, total_value: '999.99' } } });
    await vi.advanceTimersByTimeAsync(300); f.detectChanges();
    expect(f.nativeElement.textContent).not.toContain('999,99');
    api.analysis.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 410 })));
    f.componentInstance.retry(); await vi.advanceTimersByTimeAsync(300); f.detectChanges();
    expect(f.componentInstance.view()).toBeNull();
    expect(f.nativeElement.textContent).toContain('Resultado expirado');
    expect(f.nativeElement.querySelector('table')).toBeNull();
  });
});
