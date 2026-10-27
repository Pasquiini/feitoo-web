import { HttpResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsService } from '../../../core/analytics.service';
import { AuthService } from '../../auth/services/auth.service';
import { Processing } from '../models/processing';
import { BillingService } from '../services/billing.service';
import { ProcessingService } from '../services/processing.service';
import { XmlSelectionService } from '../services/xml-selection.service';
import { XmlToExcelPage } from './xml-to-excel';

describe('Produtos dos XMLs — shared processing page', () => {
  const user = signal<object | null>(null);
  const batch: Processing = {
    id: 'synthetic-products',
    tool: 'products-from-xml',
    status: 'queued',
    files_count: 2,
    processed_files_count: 0,
    successful_files_count: 0,
    failed_files_count: 0,
    total_size: 10,
    started_at: null,
    completed_at: null,
    created_at: '2026-10-01',
    expires_at: '2099-01-01',
    result: { available: false, file_name: null, size: null, error_message: null },
  };
  const preview: NonNullable<Processing['preview']> = {
    summary: {
      successful_documents_count: 2,
      failed_documents_count: 0,
      items_count: 4,
      products_count: 1,
      total_value: '80.00',
      documents_without_total_count: 0,
    },
    notes_preview: [],
    products_preview: [
      {
        code: '001234',
        product: 'Café',
        issuer_document: '00000000000100',
        issuer_name: 'Fornecedor',
        ncm: '09012100',
        unit: 'UN',
        total_quantity: '5.00',
        invoice_count: 2,
        minimum_unit_value: '10.00',
        maximum_unit_value: '20.00',
        average_unit_value: '16.0000000000',
        total_value: '80.00',
      },
    ],
    items_preview: [
      {
        note_number: '001',
        series: '1',
        code: '001234',
        product: 'Café',
        quantity: '2.00',
        unit_value: '10.00',
        total_value: '20.00',
        ncm: '09012100',
        cfop: '5102',
        unit: 'UN',
        issuer_name: 'Fornecedor',
      },
    ],
  };
  const completed: Processing = {
    ...batch,
    status: 'completed',
    processed_files_count: 2,
    successful_files_count: 2,
    preview,
    result: { available: true, file_name: 'products.xlsx', size: 10, error_message: null },
  };
  const api = {
    configuration: vi.fn(),
    create: vi.fn(),
    upload: vi.fn(),
    start: vi.fn(),
    get: vi.fn(),
    download: vi.fn(),
    deleteFiles: vi.fn(),
    listFiles: vi.fn(),
  };
  const billing = {
    usage: vi.fn(),
    checkout: vi.fn(),
    purchase: vi.fn(),
    cancel: vi.fn(),
    redirect: vi.fn(),
  };
  const auth = { user, startGoogle: vi.fn() };
  const track = vi.fn();
  const analytics = { track, trackOnce: track, funnel: track, choice: signal('granted') };
  let fixture: ComponentFixture<XmlToExcelPage>;
  let page: XmlToExcelPage;
  let element: HTMLElement;
  const files = (n = 2) =>
    Array.from({ length: n }, (_, i) => new File(['<xml/>'], `synthetic-${i}.xml`));

  beforeEach(async () => {
    vi.useFakeTimers();
    user.set(null);
    api.configuration.mockReturnValue(
      of({
        data: {
          max_files: 20,
          max_processing_files: 250,
          max_file_size_kb: 10240,
          ttl_minutes: 120,
          free: { per_processing: 20, daily: 50 },
          checkout_available: true,
          packages: [{ code: 'xml_250', files_limit: 250, amount: 690, currency: 'brl' }],
        },
      }),
    );
    api.create.mockReturnValue(of({ data: batch }));
    api.upload.mockReturnValue(of({ data: batch }));
    api.start.mockReturnValue(of({ data: batch }));
    api.get.mockReturnValue(of({ data: completed }));
    api.listFiles.mockReturnValue(of({ data: [] }));
    api.deleteFiles.mockReturnValue(of({ data: { ...batch, status: 'expired' } }));
    billing.usage.mockReturnValue(
      of({
        data: {
          plan: 'free',
          limits: { per_processing: 20, daily: 50, used_today: 0, remaining_today: 50 },
        },
      }),
    );
    await TestBed.configureTestingModule({
      imports: [XmlToExcelPage],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { data: { tool: 'products-from-xml' }, queryParamMap: new Map() } },
        },
        { provide: AuthService, useValue: auth },
        { provide: ProcessingService, useValue: api },
        { provide: BillingService, useValue: billing },
        { provide: AnalyticsService, useValue: analytics },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(XmlToExcelPage);
    page = fixture.componentInstance;
    element = fixture.nativeElement;
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('is public, loads matching limits and allows selecting before authentication', () => {
    expect(element.querySelectorAll('h1')).toHaveLength(1);
    expect(element.querySelector('h1')?.textContent?.trim()).toBe('Extrair produtos de XMLs NF-e');
    expect(api.configuration).toHaveBeenCalledWith('products-from-xml');
    page.add(files());
    fixture.detectChanges();
    page.start();
    fixture.detectChanges();
    expect(page.authPrompt()).toBe(true);
    expect(api.create).not.toHaveBeenCalled();
    expect(element.textContent).toContain('Entre para continuar');
  });

  it('keeps selections separate and returns email login to the correct tool', () => {
    const selection = TestBed.inject(XmlSelectionService);
    selection.files.set(files(1));
    page.add(files(2));
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    page.emailLogin();
    expect(navigate).toHaveBeenCalledWith(['/login'], {
      queryParams: { returnTo: '/produtos-dos-xmls' },
    });
    expect(selection.files().length).toBe(1);
    expect(page.files().length).toBe(2);
    expect(selection.continueTool).toBe('products-from-xml');
  });

  it('uses shared upload, queue polling and product analytics', async () => {
    user.set({ id: 1 });
    fixture.detectChanges();
    page.add(files());
    page.start();
    await vi.advanceTimersByTimeAsync(1000);
    fixture.detectChanges();
    expect(api.create).toHaveBeenCalledWith('products-from-xml');
    expect(api.upload).toHaveBeenCalled();
    expect(api.start).toHaveBeenCalled();
    expect(page.state()).toBe('completed');
    expect(analytics.track).toHaveBeenCalledWith(
      'processing_completed',
      expect.objectContaining({ tool: 'products-from-xml' }),
    );
    expect(billing.usage).toHaveBeenCalledWith('products-from-xml');
  });

  it('switches between bounded consolidated and detailed previews with accessible buttons', () => {
    page.processing.set(completed);
    page.state.set('completed');
    fixture.detectChanges();
    expect(element.textContent).toContain('Produtos diferentes');
    expect(element.textContent).toContain('R$ 80,00');
    expect(element.querySelector('table caption')?.textContent).toContain('consolidados');
    const detailed = [...element.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent?.trim() === 'Detalhado',
    )!;
    detailed.click();
    fixture.detectChanges();
    expect(detailed.getAttribute('aria-pressed')).toBe('true');
    expect(element.querySelector('table')?.textContent).toContain('CFOP');
    expect(element.querySelector('table')?.textContent).toContain('5102');
    expect(element.querySelectorAll('tbody tr').length).toBe(1);
    expect(element.textContent).not.toContain('Preview de notas');
  });

  it('shares Free paywall and recurring Pro offer', () => {
    user.set({ id: 1 });
    fixture.detectChanges();
    page.add(files(147));
    fixture.detectChanges();
    expect(element.textContent).toContain('Escolha até 20 arquivos');
    expect(element.textContent?.replace(/\s+/g, ' ')).toContain('Processar todos por R$');
    expect(element.textContent).toContain('Conhecer o Pro');
  });

  it('uses Pro limits and suppresses a redundant single purchase', () => {
    user.set({ id: 1 });
    fixture.detectChanges();
    page.usage.set({
      plan: 'pro',
      limits: {
        per_processing: 250,
        daily: 500,
        used_today: 0,
        remaining_today: 500,
        resets_at: '',
      },
    });
    page.add(files(147));
    fixture.detectChanges();
    expect(page.needsPurchase()).toBe(false);
    expect(element.querySelector('.paywall')).toBeNull();
    expect(element.textContent).toContain('Feitoo Pro');
  });

  it('uses the existing checkout for the selected products processing', () => {
    user.set({ id: 1 });
    fixture.detectChanges();
    page.add(files(147));
    api.upload.mockReturnValue(of({ data: { ...batch, status: 'pending', files_count: 147 } }));
    billing.checkout.mockReturnValue(
      of({
        data: {
          purchase: { id: 'paid', status: 'pending' },
          checkout_url: 'https://checkout.stripe.com/synthetic',
        },
      }),
    );
    page.buy();
    expect(api.create).toHaveBeenCalledWith('products-from-xml');
    expect(billing.checkout).toHaveBeenCalledWith(batch.id);
    expect(billing.redirect).toHaveBeenCalledWith('https://checkout.stripe.com/synthetic');
  });

  it('shows safe partial failures and all-invalid feedback', () => {
    page.processing.set({ ...completed, failed_files_count: 1 });
    page.state.set('completed');
    fixture.detectChanges();
    expect(element.textContent).toContain('arquivo não pôde ser processado');
    api.get.mockReturnValue(
      of({
        data: {
          ...batch,
          status: 'failed',
          result: {
            ...batch.result,
            error_message: 'Não encontramos NF-es válidas nesses arquivos.',
          },
        },
      }),
    );
    page.state.set('error');
    page.refresh();
    vi.advanceTimersByTime(1000);
    fixture.detectChanges();
    expect(element.textContent).toContain('Não encontramos NF-es válidas');
  });

  it('downloads through the authenticated processing API', () => {
    user.set({ id: 1 });
    fixture.detectChanges();
    page.processing.set(completed);
    page.state.set('completed');
    api.download.mockReturnValue(of(new HttpResponse({ body: new Blob(['synthetic']) })));
    const create = vi.fn(() => 'blob:synthetic');
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: create });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    page.download();
    expect(api.download).toHaveBeenCalledWith(batch.id);
    expect(create).toHaveBeenCalled();
    expect(analytics.track).toHaveBeenCalledWith('download_clicked', { tool: 'products-from-xml' });
  });

  it('surfaces upload errors without generating a result', () => {
    user.set({ id: 1 });
    fixture.detectChanges();
    page.add(files());
    api.upload.mockReturnValue(throwError(() => new Error('synthetic upload failure')));
    page.start();
    fixture.detectChanges();
    expect(page.state()).toBe('error');
    expect(api.start).not.toHaveBeenCalled();
  });
});
