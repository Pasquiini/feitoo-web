import { AnalyticsService } from '../../../core/analytics.service';
import { HttpResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../auth/services/auth.service';
import { Processing } from '../models/processing';
import { ProcessingService } from '../services/processing.service';
import { XmlSelectionService } from '../services/xml-selection.service';
import { XmlToExcelPage } from './xml-to-excel';
import { BillingService } from '../services/billing.service';

describe('XmlToExcelPage', () => {
  const batch: Processing = {
    id: 'batch',
    tool: 'xml-to-excel',
    status: 'queued',
    files_count: 2,
    processed_files_count: 0,
    successful_files_count: 0,
    failed_files_count: 0,
    total_size: 10,
    started_at: null,
    completed_at: null,
    expires_at: '2027-01-01',
    created_at: '2026-10-08',
    result: { available: false, file_name: null, size: null, error_message: null },
  };
  const user = signal<object | null>({ id: 1 });
  const api = {
    create: vi.fn(),
    upload: vi.fn(),
    start: vi.fn(),
    get: vi.fn(),
    download: vi.fn(),
    configuration: vi.fn(),
    listFiles: vi.fn(),
    deleteFiles: vi.fn(),
  };
  let page: XmlToExcelPage;
  let fixture: ComponentFixture<XmlToExcelPage>;
  const billing = {
    usage: vi.fn(),
    checkout: vi.fn(),
    purchase: vi.fn(),
    cancel: vi.fn(),
    redirect: vi.fn(),
  };

  beforeEach(async () => {
    vi.useFakeTimers();
    user.set({ id: 1 });
    billing.usage.mockReturnValue(
      of({
        data: {
          plan: 'free',
          limits: { per_processing: 20, daily: 50, used_today: 38, remaining_today: 12 },
        },
      }),
    );
    api.create.mockReturnValue(of({ data: batch }));
    api.configuration.mockReturnValue(
      of({ data: { max_files: 20, max_file_size_kb: 10240, ttl_minutes: 120 } }),
    );
    api.listFiles.mockReturnValue(of({ data: [] }));
    api.deleteFiles.mockReturnValue(of({ data: { ...batch, status: 'expired' } }));
    api.upload.mockReturnValue(of({ data: batch }));
    api.start.mockReturnValue(of({ data: batch }));
    api.get.mockReturnValue(
      of({ data: { ...batch, status: 'processing', processed_files_count: 1 } }),
    );
    await TestBed.configureTestingModule({
      imports: [XmlToExcelPage],
      providers: [
        provideRouter([]),
        { provide: BillingService, useValue: billing },
        { provide: AuthService, useValue: { user } },
        { provide: ProcessingService, useValue: api },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(XmlToExcelPage);
    page = fixture.componentInstance;
  });

  const purchase = {
    id: 'purchase',
    processing_id: 'batch',
    status: 'pending' as const,
    files_count: 37,
    files_limit: 100,
    amount: 490,
    currency: 'brl',
    package_code: 'xml_100',
    tool: 'xml-to-excel',
    consumed: false,
    paid_at: null,
    expires_at: '2099-01-01',
    created_at: '2026-10-08',
  };
  it('uploads the whole selected lot before requesting backend Checkout and redirecting', () => {
    page.config.set({
      max_files: 20,
      max_processing_files: 250,
      max_file_size_kb: 10240,
      ttl_minutes: 120,
      packages: [{ code: 'xml_100', files_limit: 100, amount: 490, currency: 'brl' }],
      checkout_available: true,
    });
    page.add(Array.from({ length: 37 }, (_, i) => new File(['xml'], `${i}.xml`)));
    let sent = 0;
    api.upload.mockImplementation((_id, files: File[]) => {
      sent += files.length;
      return of({ data: { ...batch, status: 'pending', files_count: sent } });
    });
    billing.checkout.mockReturnValue(
      of({ data: { purchase, checkout_url: 'https://checkout.stripe.com/c/pay/test' } }),
    );
    page.buy();
    expect(api.upload).toHaveBeenCalledTimes(2);
    expect(billing.checkout).toHaveBeenCalledOnce();
    expect(billing.checkout).toHaveBeenCalledWith('batch');
    expect(billing.redirect).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/test');
    expect(api.start).not.toHaveBeenCalled();
    api.upload.mockReturnValue(of({ data: batch }));
  });

  it('bounds pending payment polling and offers another consultation without starting', async () => {
    page.processing.set({ ...batch, status: 'pending' });
    billing.purchase.mockReturnValue(of({ data: purchase }));
    page.confirmPayment();
    await vi.advanceTimersByTimeAsync(90000);
    expect(billing.purchase).toHaveBeenCalledTimes(45);
    expect(page.paymentBusy()).toBe(false);
    expect(page.paymentMessage()).toContain('consultar novamente');
    expect(api.start).not.toHaveBeenCalled();
  });
  it('keeps login available to guests selecting more than the Free limit', () => {
    user.set(null);
    page.config.set({
      max_files: 20,
      max_processing_files: 250,
      max_file_size_kb: 10240,
      ttl_minutes: 120,
      free: { per_processing: 20, daily: 50 },
    });
    page.add(Array.from({ length: 37 }, (_, i) => new File(['xml'], `${i}.xml`)));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Entre para continuar');
    page.start();
    expect(page.authPrompt()).toBe(true);
    expect(api.create).not.toHaveBeenCalled();
  });

  it('shows contextual daily paywall and requires explicit choice without dropping files', () => {
    page.config.set({
      max_files: 20,
      max_processing_files: 250,
      max_file_size_kb: 10240,
      ttl_minutes: 120,
      free: { per_processing: 20, daily: 50 },
      packages: [{ code: 'xml_100', files_limit: 100, amount: 490, currency: 'brl' }],
      checkout_available: true,
    });
    page.add(Array.from({ length: 37 }, (_, i) => new File(['xml'], `${i}.xml`)));
    fixture.detectChanges();
    page.start();
    expect(api.create).not.toHaveBeenCalled();
    expect(page.files()).toHaveLength(37);
    expect(fixture.nativeElement.textContent).toContain('Processar 12 grátis');
    expect(fixture.nativeElement.textContent).toContain('Assinar Feitoo Pro');
    expect(page.suggestedPackage()?.amount).toBe(490);
    api.upload.mockReturnValue(of({ data: { ...batch, status: 'pending', files_count: 12 } }));
    page.useFree();
    expect(api.upload.mock.calls[0][1]).toHaveLength(12);
    expect(api.start).toHaveBeenCalledWith('batch', 12);
    expect(page.deferredFiles()).toHaveLength(25);
  });

  it('uses Pro limits and hides single purchase when the Pro daily allowance is exhausted', () => {
    page.config.set({
      max_files: 20,
      max_processing_files: 250,
      max_file_size_kb: 10240,
      ttl_minutes: 120,
      free: { per_processing: 20, daily: 50 },
      packages: [{ code: 'xml_100', files_limit: 100, amount: 490, currency: 'brl' }],
      checkout_available: true,
    });
    page.usage.set({
      plan: 'pro',
      limits: {
        per_processing: 250,
        daily: 500,
        used_today: 128,
        remaining_today: 372,
        resets_at: '2099-01-01',
      },
    });
    billing.usage.mockReturnValue(of({ data: page.usage() }));
    page.add(Array.from({ length: 37 }, (_, i) => new File(['xml'], `${i}.xml`)));
    fixture.detectChanges();
    expect(page.needsPurchase()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Feitoo Pro');
    page.usage.update((u) =>
      u ? { ...u, limits: { ...u.limits, used_today: 500, remaining_today: 0 } } : u,
    );
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Assinar Feitoo Pro');
    expect(fixture.nativeElement.textContent).not.toContain('Processar todos por');
    page.buy();
    expect(billing.checkout).not.toHaveBeenCalled();
  });

  it('separates sequential uploads and starts only after the final batch', () => {
    page.config.set({
      max_files: 2,
      max_processing_files: 250,
      max_file_size_kb: 10240,
      ttl_minutes: 120,
      free: { per_processing: 20, daily: 50 },
    });
    let sent = 0;
    api.upload.mockImplementation((_id, files: File[]) => {
      expect(api.start).not.toHaveBeenCalled();
      sent += files.length;
      return of({ data: { ...batch, status: 'pending', files_count: sent } });
    });
    page.add(Array.from({ length: 5 }, (_, i) => new File(['xml'], `${i}.xml`)));
    page.start();
    expect(api.upload).toHaveBeenCalledTimes(3);
    expect(page.uploaded()).toBe(5);
    expect(api.start).toHaveBeenCalledOnce();
    api.upload.mockReturnValue(of({ data: batch }));
  });

  it('uses the purchase response as payment truth and waits for confirmation', async () => {
    const track = vi.spyOn(TestBed.inject(AnalyticsService), 'trackOnce');
    page.processing.set({ ...batch, status: 'pending', files_count: 37 });
    billing.purchase.mockReturnValue(of({ data: purchase }));
    page.confirmPayment();
    await vi.advanceTimersByTimeAsync(1);
    expect(page.paymentMessage()).toContain('Confirmando');
    expect(api.start).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
    billing.purchase.mockReturnValue(of({ data: { ...purchase, status: 'paid' } }));
    await vi.advanceTimersByTimeAsync(2000);
    expect(api.start).toHaveBeenCalledOnce();
    expect(track).toHaveBeenCalledWith(
      'single_purchase_completed',
      purchase.id,
      expect.objectContaining({ purchase_type: 'single', currency: 'BRL' }),
    );
    expect(page.paymentMessage()).toContain('Pagamento confirmado');
  });

  it('does not start after failed or expired payment and limits polling', async () => {
    page.processing.set({ ...batch, status: 'pending' });
    billing.purchase.mockReturnValue(of({ data: { ...purchase, status: 'expired' } }));
    page.confirmPayment();
    await vi.advanceTimersByTimeAsync(1);
    expect(api.start).not.toHaveBeenCalled();
    expect(page.paymentMessage()).toContain('expirado');
    expect(page.paymentBusy()).toBe(false);
  });

  it('requires remote cancellation before starting a free subset', () => {
    page.processing.set({ ...batch, status: 'pending', files_count: 37 });
    page.purchase.set(purchase);
    page.usage.set({
      plan: 'free',
      limits: {
        per_processing: 20,
        daily: 50,
        used_today: 45,
        remaining_today: 5,
        resets_at: '2099-01-01',
      },
    });
    billing.cancel.mockReturnValue(throwError(() => new Error('payment still open')));
    page.useFree();
    expect(api.start).not.toHaveBeenCalled();
    billing.cancel.mockReturnValue(of({ data: { ...purchase, status: 'expired' } }));
    page.useFree();
    expect(api.start).toHaveBeenCalledWith('batch', 5);
  });

  it('shows exhausted Free without a dead subscription action', () => {
    page.usage.set({
      plan: 'free',
      limits: {
        per_processing: 20,
        daily: 50,
        used_today: 50,
        remaining_today: 0,
        resets_at: '2099-01-01',
      },
    });
    page.add([new File(['xml'], 'nfe.xml')]);
    fixture.detectChanges();
    page.usage.set({
      plan: 'free',
      limits: {
        per_processing: 20,
        daily: 50,
        used_today: 50,
        remaining_today: 0,
        resets_at: '2099-01-01',
      },
    });
    fixture.detectChanges();
    expect(page.freeCount()).toBe(0);
    expect(fixture.nativeElement.textContent).toContain('meia-noite');
    page.useFree();
    expect(api.start).not.toHaveBeenCalled();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  const preview = {
    summary: {
      successful_documents_count: 42,
      failed_documents_count: 2,
      items_count: 187,
      total_value: '1234.50',
      documents_without_total_count: 0,
    },
    notes_preview: [
      {
        number: '123',
        series: '001',
        issued_at: '2026-10-01',
        issuer_name: 'Emitente exemplo',
        recipient_name: 'Destinatário exemplo',
        items_count: 2,
        total_value: '1234.50',
      },
    ],
    items_preview: [
      {
        note_number: '123',
        series: '001',
        code: 'ABC',
        product: 'Produto exemplo',
        quantity: '2.0000',
        unit_value: '617.2500',
        total_value: '1234.50',
      },
    ],
  };

  it.each([0, 2])(
    'renders summary and semantic previews with %i failures and working actions',
    (failures) => {
      page.processing.set({
        ...batch,
        status: 'completed',
        successful_files_count: 42,
        failed_files_count: failures,
        preview,
        result: { available: true, file_name: 'result.xlsx', size: 100, error_message: null },
      });
      page.state.set('completed');
      fixture.detectChanges();
      const element: HTMLElement = fixture.nativeElement;
      expect(element.querySelectorAll('table')).toHaveLength(2);
      expect(element.querySelectorAll('th[scope="col"]')).toHaveLength(13);
      expect(element.querySelectorAll('.preview-scroll[tabindex="0"]')).toHaveLength(2);
      expect(element.textContent).toContain('Mostrando 1 de 42 notas');
      expect(element.textContent).toContain('Mostrando 1 de 187 itens');
      expect(element.textContent).toContain('Produto exemplo');
      expect(element.textContent).toContain('R$ 1.234,50');
      const download = vi.spyOn(page, 'download').mockImplementation(() => undefined);
      const remove = vi.spyOn(page, 'deleteFiles').mockImplementation(() => undefined);
      element.querySelector<HTMLButtonElement>('.result-download')!.click();
      [...element.querySelectorAll('button')]
        .find((button) => button.textContent?.trim() === 'Excluir arquivos')!
        .click();
      expect(download).toHaveBeenCalledOnce();
      expect(remove).toHaveBeenCalledOnce();
      page.expired.set(true);
      fixture.detectChanges();
      expect(element.querySelector('table')).toBeNull();
      expect(element.querySelector('.result-download')).toBeNull();
    },
  );

  it('groups notes by persisted reference even when invoice numbers match', () => {
    const first = {
      ...preview.items_preview[0],
      note_reference: 'note-a',
      note_number: '100',
      product: 'Product A',
    };
    const second = { ...first, note_reference: 'note-b', product: 'Product B' };
    page.processing.set({
      ...batch,
      status: 'completed',
      preview: { ...preview, items_preview: [first, second, first] },
    });
    page.state.set('completed');
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(page.itemGroups()).toHaveLength(2);
    expect(page.itemGroups()[0].items).toHaveLength(2);
    expect(element.querySelectorAll('#items-title ~ h3')).toHaveLength(2);
    expect(element.textContent).toContain('NF-e 100 · Série 001');
    expect(element.textContent).toContain('Mostrando 3 de 187 itens. Esta é uma amostra.');
    expect(element.querySelectorAll('.preview-scroll[tabindex="0"]')).toHaveLength(3);
  });

  it('hides preview after deletion and when no document was valid', () => {
    page.processing.set({ ...batch, preview, status: 'failed', failed_files_count: 2 });
    page.state.set('error');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('table')).toBeNull();
    page.state.set('completed');
    page.deleted.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('table')).toBeNull();
  });

  it('formats high precision amounts without floating point rounding', () => {
    expect(page.decimal('123456789012345.1234567890', true)).toBe(
      'R$ 123.456.789.012.345,1234567890',
    );
    expect(page.decimal(null, true)).toBe('Não informado');
  });

  it('selects XMLs, rejects other extensions, counts bytes and removes files', () => {
    page.add([new File(['xml'], 'nfe.XML'), new File(['bad'], 'bad.pdf')]);
    expect(page.files()).toHaveLength(1);
    expect(page.totalSize()).toBe(3);
    expect(page.error()).toContain('.xml');
    expect(page.state()).toBe('files-selected');
    page.remove(0);
    expect(page.files()).toHaveLength(0);
    expect(page.state()).toBe('idle');
  });

  it('shows drag feedback and clears it when leaving the upload area', () => {
    page.dragEnter(new Event('dragenter', { cancelable: true }) as DragEvent);
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('.upload-zone').classList.contains('is-dragging'),
    ).toBe(true);
    page.dragLeave(new Event('dragleave') as DragEvent);
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('.upload-zone').classList.contains('is-dragging'),
    ).toBe(false);
    page.state.set('uploading');
    page.dragEnter(new Event('dragenter') as DragEvent);
    expect(page.dragOver()).toBe(false);
  });

  it('uploads before starting and polls progress', async () => {
    page.add([new File(['xml'], 'nfe.xml')]);
    const selected = page.files();
    page.start();
    expect(api.upload).toHaveBeenCalledWith('batch', selected);
    expect(api.start).toHaveBeenCalledWith('batch');
    expect(page.state()).toBe('queued');
    await vi.advanceTimersByTimeAsync(1000);
    expect(page.state()).toBe('processing');
    expect(page.processing()?.processed_files_count).toBe(1);
  });

  it('finishes with partial errors and stops polling', async () => {
    const track = vi.spyOn(TestBed.inject(AnalyticsService), 'track');
    api.get.mockReturnValue(
      of({
        data: {
          ...batch,
          status: 'completed',
          processed_files_count: 2,
          successful_files_count: 1,
          failed_files_count: 1,
          result: { available: true, file_name: 'result.xlsx', size: 100, error_message: null },
        },
      }),
    );
    page.add([new File(['xml'], 'nfe.xml')]);
    page.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(page.state()).toBe('completed');
    expect(page.processing()?.failed_files_count).toBe(1);
    expect(page.files()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(10000);
    expect(api.get).toHaveBeenCalledTimes(1);
    page.refresh();
    await vi.advanceTimersByTimeAsync(1000);
    const completed = track.mock.calls.filter(([event]) => event === 'processing_completed');
    expect(completed).toHaveLength(1);
    expect(completed[0][1]).toEqual(
      expect.objectContaining({ processing_result: 'partial', plan: 'free' }),
    );
  });

  it('shows safe generation failure and stops polling', async () => {
    api.get.mockReturnValue(
      of({
        data: {
          ...batch,
          status: 'failed',
          result: { ...batch.result, error_message: 'Sem documentos válidos.' },
        },
      }),
    );
    page.add([new File(['xml'], 'nfe.xml')]);
    page.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(page.state()).toBe('error');
    expect(page.error()).toBe('Sem documentos válidos.');
    await vi.advanceTimersByTimeAsync(4000);
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('handles upload failure without starting processing', () => {
    api.upload.mockReturnValue(throwError(() => new Error('offline')));
    page.add([new File(['xml'], 'nfe.xml')]);
    page.start();
    expect(page.state()).toBe('error');
    expect(api.start).not.toHaveBeenCalled();
  });

  it('keeps selection only in memory while requesting login', () => {
    user.set(null);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    page.add([new File(['xml'], 'nfe.xml')]);
    page.start();
    expect(page.authPrompt()).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
    page.emailLogin();
    expect(navigate).toHaveBeenCalledWith(['/login'], {
      queryParams: { returnTo: '/xml-para-excel' },
    });
    expect(TestBed.inject(XmlSelectionService).files()).toHaveLength(1);
    expect(api.create).not.toHaveBeenCalled();
  });

  it('resumes automatically after login without persisting files', () => {
    const selection = TestBed.inject(XmlSelectionService);
    selection.files.set([new File(['xml'], 'nfe.xml')]);
    selection.continueAfterLogin = true;
    const resumed = TestBed.createComponent(XmlToExcelPage).componentInstance;
    expect(api.create).toHaveBeenCalledWith('xml-to-excel');
    expect(resumed.state()).toBe('queued');
    expect(selection.continueAfterLogin).toBe(false);
  });

  it('downloads a blob with backend filename and releases the object URL', async () => {
    page.processing.set({
      ...batch,
      status: 'completed',
      result: { available: true, file_name: 'fallback.xlsx', size: 10, error_message: null },
    });
    api.download.mockReturnValue(
      of(new HttpResponse({ body: new Blob(['xlsx']), headers: undefined })),
    );
    const create = vi.fn().mockReturnValue('blob:test');
    const revoke = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: create });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    page.download();
    expect(api.download).toHaveBeenCalledWith('batch');
    expect(create).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(revoke).toHaveBeenCalledWith('blob:test');
    click.mockRestore();
  });

  it('renders only one page of selected files and provides a real keyboard selector', () => {
    page.config.set({ max_files: 500, max_file_size_kb: 10240, ttl_minutes: 120 });
    page.add(Array.from({ length: 200 }, (_, i) => new File(['xml'], `nfe-${i}.xml`)));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.file-row')).toHaveLength(10);
    const selector = [...fixture.nativeElement.querySelectorAll('button')].find((button) =>
      button.textContent.includes('Selecionar XMLs'),
    );
    expect(selector?.tagName).toBe('BUTTON');
    page.page.set(19);
    expect(page.visibleFiles()[0].name).toBe('nfe-190.xml');
    page.clear();
    expect(page.files()).toHaveLength(0);
    expect(page.page()).toBe(0);
  });

  it('uses server limits and rejects oversized selection without sending it', () => {
    page.config.set({ max_files: 1, max_file_size_kb: 1, ttl_minutes: 30 });
    page.add([new File(['x'], 'one.xml'), new File(['x'], 'two.xml')]);
    expect(page.files()).toHaveLength(0);
    expect(page.error()).toContain('até 1');
    page.add([new File(['x'.repeat(1025)], 'large.xml')]);
    expect(page.files()).toHaveLength(0);
    expect(api.upload).not.toHaveBeenCalled();
  });

  it('waits for configuration before automatically resuming after login', () => {
    const response = new Subject<{
      data: { max_files: number; max_file_size_kb: number; ttl_minutes: number };
    }>();
    api.configuration.mockReturnValue(response);
    const selection = TestBed.inject(XmlSelectionService);
    selection.files.set([new File(['xml'], 'nfe.xml')]);
    selection.continueAfterLogin = true;
    const resumed = TestBed.createComponent(XmlToExcelPage).componentInstance;
    expect(api.create).not.toHaveBeenCalled();
    response.next({ data: { max_files: 20, max_file_size_kb: 10240, ttl_minutes: 120 } });
    expect(resumed.state()).toBe('queued');
  });

  it('shows safe partial-file messages without hiding the download', () => {
    page.processing.set({
      ...batch,
      status: 'completed',
      failed_files_count: 1,
      successful_files_count: 1,
      result: { available: true, file_name: 'result.xlsx', size: 100, error_message: null },
    });
    page.state.set('completed');
    api.listFiles.mockReturnValue(
      of({
        data: [
          {
            id: 'file',
            original_name: 'recusado.xml',
            status: 'failed',
            error_message: 'Documento não suportado.',
          },
        ],
      }),
    );
    page.showFailures();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('recusado.xml');
    expect(fixture.nativeElement.textContent).toContain('Documento não suportado.');
    expect(fixture.nativeElement.textContent).toContain('Baixar Excel');
    expect(fixture.nativeElement.textContent).toContain('Arquivo disponível até');
  });

  it('explains zero valid documents and allows a new selection', async () => {
    api.get.mockReturnValue(
      of({ data: { ...batch, status: 'failed', processed_files_count: 2, failed_files_count: 2 } }),
    );
    page.add([new File(['xml'], 'bad.xml')]);
    page.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(page.error()).toBe('Não encontramos NF-e válidas nesses arquivos.');
    page.reset();
    page.add([new File(['xml'], 'other.xml')]);
    expect(page.state()).toBe('files-selected');
    expect(page.processing()).toBeNull();
  });

  it('deletes the batch and disables further downloads while keeping confirmation', () => {
    page.processing.set({
      ...batch,
      status: 'completed',
      result: { available: true, file_name: 'result.xlsx', size: 100, error_message: null },
    });
    page.state.set('completed');
    page.deleteFiles();
    expect(api.deleteFiles).toHaveBeenCalledWith('batch');
    expect(page.deleted()).toBe(true);
    page.download();
    expect(api.download).not.toHaveBeenCalled();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('foram excluídos');
  });

  it('handles deletion failure without removing a usable result', () => {
    page.processing.set({
      ...batch,
      status: 'completed',
      result: { available: true, file_name: 'result.xlsx', size: 100, error_message: null },
    });
    api.deleteFiles.mockReturnValue(throwError(() => new Error('offline')));
    page.deleteFiles();
    expect(page.deleted()).toBe(false);
    expect(page.processing()?.result.available).toBe(true);
    expect(page.error()).toContain('Não foi possível excluir');
  });

  it('expires the download locally after the reported TTL', async () => {
    api.get.mockReturnValue(
      of({
        data: {
          ...batch,
          status: 'completed',
          expires_at: new Date(Date.now() + 3000).toISOString(),
          result: { available: true, file_name: 'result.xlsx', size: 100, error_message: null },
        },
      }),
    );
    page.add([new File(['xml'], 'nfe.xml')]);
    page.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(page.expired()).toBe(false);
    await vi.advanceTimersByTimeAsync(2000);
    expect(page.expired()).toBe(true);
    page.download();
    expect(api.download).not.toHaveBeenCalled();
  });

  it('renders an all-success result without partial-failure alerts', () => {
    page.processing.set({ ...batch, status: 'completed', successful_files_count: 2 });
    page.state.set('completed');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('2 XMLs processados com sucesso');
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent).not.toContain(
      'não puderam',
    );
  });
});
