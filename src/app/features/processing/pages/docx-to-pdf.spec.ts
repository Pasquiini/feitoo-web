import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, ActivatedRoute, convertToParamMap } from '@angular/router';
import { HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { AnalyticsService } from '../../../core/analytics.service';
import { AuthService } from '../../auth/services/auth.service';
import { Processing, ProcessingFile, XmlToExcelConfig } from '../models/processing';
import { BillingService } from '../services/billing.service';
import { ProcessingService } from '../services/processing.service';
import { XmlSelectionService } from '../services/xml-selection.service';
import { DocxToPdfPage } from './docx-to-pdf';

describe('DOCX para PDF', () => {
  const config: XmlToExcelConfig = {
    max_files: 3,
    max_processing_files: 20,
    max_file_size_kb: 10240,
    max_request_size_kb: 30720,
    max_total_size_kb: 40960,
    ttl_minutes: 120,
    free: { per_processing: 3, daily: 6 },
  };
  const usage = {
    data: {
      plan: 'free',
      limits: {
        per_processing: 3,
        daily: 6,
        used_today: 0,
        remaining_today: 6,
        resets_at: new Date(Date.now() + 86400000).toISOString(),
      },
    },
  };
  const batch = (status: Processing['status'] = 'queued', partial = false): Processing => ({
    id: '12345678-1234-4234-8234-123456789abc',
    tool: 'docx_to_pdf',
    status,
    files_count: 2,
    processed_files_count: status === 'completed' ? 2 : 0,
    successful_files_count: status === 'completed' ? (partial ? 1 : 2) : 0,
    failed_files_count: partial ? 1 : 0,
    total_size: 100,
    started_at: null,
    completed_at: null,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 7200000).toISOString(),
    result: {
      available: status === 'completed',
      file_name: 'feitoo-documentos-pdf.zip',
      size: 100,
      error_message: null,
    },
  });
  const ready: ProcessingFile = {
    id: 'input-id',
    original_name: 'exemplo.docx',
    status: 'completed',
    size: 100,
    processed_at: null,
    error_code: null,
    error_message: null,
  };
  let api: {
    configuration: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    upload: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    listFiles: ReturnType<typeof vi.fn>;
    pdf: ReturnType<typeof vi.fn>;
    download: ReturnType<typeof vi.fn>;
    deleteFiles: ReturnType<typeof vi.fn>;
  };
  let auth: {
    user: ReturnType<typeof signal<null | { id: number }>>;
    startGoogle: ReturnType<typeof vi.fn>;
  };
  let analytics: {
    choice: ReturnType<typeof signal<'granted' | 'denied'>>;
    track: ReturnType<typeof vi.fn>;
    trackOnce: ReturnType<typeof vi.fn>;
  };
  beforeEach(() => {
    vi.useFakeTimers();
    api = {
      configuration: vi.fn(() => of({ data: config })),
      create: vi.fn(() => of({ data: batch('pending') })),
      upload: vi.fn(() => of({ data: batch('pending') })),
      start: vi.fn(() => of({ data: batch() })),
      get: vi.fn(() => of({ data: batch('completed') })),
      listFiles: vi.fn(() => of({ data: [ready] })),
      pdf: vi.fn(() => of(new Blob(['%PDF-1.4']))),
      download: vi.fn(() => of(new HttpResponse({ body: new Blob(['PK']) }))),
      deleteFiles: vi.fn(() => of({ data: batch('expired') })),
    };
    auth = {
      user: signal<null | { id: number }>({ id: 1 }),
      startGoogle: vi.fn(() => of({ redirect_url: 'https://accounts.google.com/test' })),
    };
    analytics = {
      choice: signal<'granted' | 'denied'>('granted'),
      track: vi.fn(),
      trackOnce: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [DocxToPdfPage],
      providers: [
        provideRouter([]),
        { provide: ProcessingService, useValue: api },
        { provide: BillingService, useValue: { usage: vi.fn(() => of(usage)) } },
        { provide: AuthService, useValue: auth },
        { provide: AnalyticsService, useValue: analytics },
      ],
    });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  function render() {
    const fixture = TestBed.createComponent(DocxToPdfPage);
    fixture.detectChanges();
    return {
      fixture,
      page: fixture.componentInstance,
      element: fixture.nativeElement as HTMLElement,
    };
  }
  const docx = (name = 'exemplo.docx') =>
    new File(['synthetic zip'], name, {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });

  it('renderiza ferramenta, FAQ real e links públicos com H1 único', () => {
    const { element } = render();
    expect(element.querySelector('h1')?.textContent).toBe('Converter DOCX para PDF online');
    expect(element.querySelectorAll('h1')).toHaveLength(1);
    expect(element.querySelector<HTMLInputElement>('#docx-files')?.multiple).toBe(true);
    expect(element.querySelectorAll('.tool-explainer details')).toHaveLength(7);
    expect(element.querySelector('.tool-explainer a[href="/seguranca"]')).not.toBeNull();
  });
  it('aceita vários DOCX, informa formato inválido e remove seleção', () => {
    const { page, fixture, element } = render();
    page.select([docx(), docx('segundo.docx'), docx('antigo.doc'), docx('macro.docm')]);
    fixture.detectChanges();
    expect(page.files()).toHaveLength(2);
    expect(page.selectionErrors()).toHaveLength(2);
    element.querySelector<HTMLButtonElement>('.document-list button')!.click();
    expect(page.files()).toHaveLength(1);
  });
  it('recebe drag/drop e respeita limites de tamanho e quantidade', () => {
    const { page } = render();
    const preventDefault = vi.fn();
    page.drop({ preventDefault, dataTransfer: { files: [docx()] } } as unknown as DragEvent);
    expect(preventDefault).toHaveBeenCalled();
    expect(page.files()).toHaveLength(1);
    page.config.set({ ...config, max_file_size_kb: 0 });
    page.select([docx()]);
    expect(page.selectionErrors()).toHaveLength(1);
    expect(page.files()).toHaveLength(1);
    page.config.set({ ...config, max_processing_files: 1 });
    page.select([docx()]);
    expect(page.files()).toHaveLength(1);
    expect(page.selectionErrors()[0]).toContain('Quantidade');
  });
  it('não processa sem login e preserva seleção no retorno de login/cadastro', async () => {
    auth.user.set(null);
    const { page } = render();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    page.select([docx()]);
    page.start();
    expect(page.authPrompt()).toBe(true);
    expect(api.create).not.toHaveBeenCalled();
    page.login(true);
    expect(navigate).toHaveBeenCalledWith(['/cadastro'], {
      queryParams: { returnTo: '/docx-para-pdf' },
    });
    expect(TestBed.inject(XmlSelectionService).forTool('docx_to_pdf')()).toHaveLength(1);
    expect(TestBed.inject(XmlSelectionService).continueTool).toBe('docx_to_pdf');
  });
  it('respeita o saldo Free sem oferecer compra avulsa', () => {
    const { page } = render();
    page.select(Array.from({ length: 4 }, () => docx()));
    page.start();
    expect(api.create).not.toHaveBeenCalled();
    expect(page.error()).toContain('limite');
  });
  it('cria, envia, enfileira, consulta status, exibe sucesso e analytics permitidos', async () => {
    const { page, fixture, element } = render();
    page.select([docx(), docx('dois.docx')]);
    page.start();
    expect(api.create).toHaveBeenCalledWith('docx_to_pdf');
    expect(api.upload).toHaveBeenCalled();
    expect(api.start).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    fixture.detectChanges();
    expect(page.busy()).toBe(false);
    expect(element.textContent).toContain('Conversão concluída');
    expect(analytics.trackOnce).toHaveBeenCalledWith('processing_completed', expect.any(String), {
      tool: 'docx_to_pdf',
      file_count: 2,
      plan: 'free',
      processing_result: 'success',
    });
    expect(JSON.stringify(analytics.trackOnce.mock.calls)).not.toContain('exemplo.docx');
  });
  it('mantém polling até terminal e mostra falhas parciais por documento', async () => {
    api.get
      .mockReturnValueOnce(of({ data: batch('processing') }))
      .mockReturnValue(of({ data: batch('completed', true) }));
    api.listFiles.mockReturnValue(
      of({
        data: [
          ready,
          {
            ...ready,
            id: 'failed-id',
            original_name: 'falha.docx',
            status: 'failed',
            error_message: 'Não foi possível converter este documento para PDF.',
          },
        ],
      }),
    );
    const { page, fixture, element } = render();
    page.select([docx()]);
    page.start();
    await vi.advanceTimersByTimeAsync(1);
    expect(page.busy()).toBe(true);
    await vi.advanceTimersByTimeAsync(3000);
    fixture.detectChanges();
    expect(element.textContent).toContain('1 de 2 arquivos convertidos');
    expect(element.textContent).toContain('Não foi possível converter');
    expect(element.querySelectorAll('.document-list button')).toHaveLength(1);
    expect(element.querySelector('.document-list .file-name')?.textContent?.trim()).toBe(
      'exemplo.pdf',
    );
    expect(element.querySelector('.tool-status')?.getAttribute('data-state')).toBe('partial');
    expect(analytics.trackOnce).toHaveBeenCalledWith(
      'processing_completed',
      expect.any(String),
      expect.objectContaining({ processing_result: 'partial' }),
    );
  });
  it('trata falha total, erros de rede e indisponibilidade sem expor detalhes internos', async () => {
    api.get.mockReturnValue(of({ data: batch('failed') }));
    const { page } = render();
    page.select([docx()]);
    page.start();
    await vi.advanceTimersByTimeAsync(1);
    expect(page.finished()).toBe(true);
    expect(page.busy()).toBe(false);
    page.reset();
    api.create.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 503, error: 'sensitive stderr' })),
    );
    page.select([docx()]);
    page.start();
    expect(page.error()).not.toContain('sensitive');
    expect(page.busy()).toBe(false);
  });
  it('baixa PDF e ZIP, exclui arquivos e impede download expirado', async () => {
    const { page } = render();
    page.select([docx()]);
    page.start();
    await vi.advanceTimersByTimeAsync(1);
    const create = vi.fn(() => 'blob:synthetic');
    const revoke = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { value: create, configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: revoke, configurable: true });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    page.download(ready);
    expect(api.pdf).toHaveBeenCalledWith(batch().id, ready.id);
    page.download();
    expect(api.download).toHaveBeenCalledWith(batch().id);
    page.deleteFiles();
    expect(page.results()).toHaveLength(0);
    expect(page.expired()).toBe(true);
    const calls = api.pdf.mock.calls.length;
    page.download(ready);
    expect(api.pdf).toHaveBeenCalledTimes(calls);
    await vi.advanceTimersByTimeAsync(1000);
    expect(revoke).toHaveBeenCalled();
  });
  it('restaura um processamento do histórico pela rota pública sem incluir ID no canonical', async () => {
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: { snapshot: { queryParamMap: convertToParamMap({ processing: batch().id }) } },
    });
    const { page } = render();
    await vi.advanceTimersByTimeAsync(1);
    expect(page.processing()?.id).toBe(batch().id);
    expect(api.create).not.toHaveBeenCalled();
  });
});
