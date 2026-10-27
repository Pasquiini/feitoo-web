import { HttpResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsService } from '../../../core/analytics.service';
import { AuthService } from '../../auth/services/auth.service';
import { defaultOrganizerOptions, Processing, ProcessingFile } from '../models/processing';
import { BillingService } from '../services/billing.service';
import { ProcessingService } from '../services/processing.service';
import { XmlSelectionService } from '../services/xml-selection.service';
import { XmlToExcelPage } from './xml-to-excel';

describe('Organizador de XMLs shared flow', () => {
  const user = signal<object | null>({ id: 1 });
  const batch: Processing = {
    id: 'organizer-batch',
    tool: 'xml-organizer',
    status: 'queued',
    files_count: 2,
    processed_files_count: 0,
    successful_files_count: 0,
    failed_files_count: 0,
    total_size: 20,
    started_at: null,
    completed_at: null,
    created_at: '2026-10-15',
    expires_at: '2099-01-01',
    result: { available: false, file_name: null, size: null, error_message: null },
    organizer: { options: defaultOrganizerOptions, summary: null },
  };
  const completed: Processing = {
    ...batch,
    status: 'completed',
    processed_files_count: 2,
    successful_files_count: 1,
    failed_files_count: 1,
    result: { available: true, file_name: 'XMLs_Organizados.zip', size: 50, error_message: null },
    organizer: {
      options: defaultOrganizerOptions,
      summary: {
        total_files: 2,
        organized_count: 1,
        invalid_count: 1,
        suppliers_count: 1,
        duplicates_count: 1,
        preserved_count: 2,
        conflicting_keys_count: 1,
        warnings_count: 2,
        duplicate_detection: true,
        documents_by_month: { '2026/10': 1 },
        notice: 'Status atual na SEFAZ não consultado.',
      },
    },
  };
  const outputFiles: readonly ProcessingFile[] = [
    {
      id: 'a',
      original_name: 'nota.xml',
      size: 10,
      status: 'completed',
      processed_at: null,
      error_code: null,
      error_message: null,
      organization: {
        archive_path: '2026/10/NFe_chave.xml',
        folder: '2026/10',
        final_name: 'NFe_chave.xml',
        duplicate_kind: null,
        key_conflict: true,
        notes: ['Conflito de chave.'],
      },
    },
    {
      id: 'b',
      original_name: 'problema.xml',
      size: 10,
      status: 'failed',
      processed_at: null,
      error_code: 'invalid_xml',
      error_message: 'XML inválido.',
      organization: {
        archive_path: 'Arquivos_Com_Problemas/problema.xml',
        folder: 'Arquivos_Com_Problemas',
        final_name: 'problema.xml',
        duplicate_kind: null,
        key_conflict: false,
        notes: ['Original preservado.'],
      },
    },
  ];
  const api = {
    configuration: vi.fn(),
    create: vi.fn(),
    upload: vi.fn(),
    start: vi.fn(),
    get: vi.fn(),
    listFiles: vi.fn(),
    download: vi.fn(),
    deleteFiles: vi.fn(),
  };
  const billing = { usage: vi.fn() };
  let fixture: ComponentFixture<XmlToExcelPage>;
  let page: XmlToExcelPage;
  let element: HTMLElement;
  beforeEach(async () => {
    vi.useFakeTimers();
    user.set({ id: 1 });
    api.configuration.mockReturnValue(
      of({
        data: {
          max_files: 20,
          max_processing_files: 250,
          max_file_size_kb: 10240,
          ttl_minutes: 120,
          free: { per_processing: 20, daily: 50 },
          packages: [],
          checkout_available: false,
        },
      }),
    );
    api.create.mockReturnValue(of({ data: { ...batch, status: 'pending', files_count: 0 } }));
    api.upload.mockReturnValue(of({ data: { ...batch, status: 'pending' } }));
    api.start.mockReturnValue(of({ data: batch }));
    api.get.mockReturnValue(of({ data: completed }));
    api.listFiles.mockReturnValue(of({ data: outputFiles }));
    api.deleteFiles.mockReturnValue(of({ data: { ...batch, status: 'expired' } }));
    api.download.mockReturnValue(of(new HttpResponse({ body: new Blob(['PK']), status: 200 })));
    billing.usage.mockReturnValue(
      of({
        data: {
          plan: 'free',
          limits: {
            per_processing: 20,
            daily: 50,
            used_today: 0,
            remaining_today: 50,
            resets_at: '2099-01-01',
          },
        },
      }),
    );
    await TestBed.configureTestingModule({
      imports: [XmlToExcelPage],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { data: { tool: 'xml-organizer' }, queryParamMap: new Map() } },
        },
        { provide: AuthService, useValue: { user } },
        { provide: ProcessingService, useValue: api },
        { provide: BillingService, useValue: billing },
        {
          provide: AnalyticsService,
          useValue: { choice: signal('denied'), track: vi.fn(), funnel: vi.fn() },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(XmlToExcelPage);
    page = fixture.componentInstance;
    fixture.detectChanges();
    element = fixture.nativeElement;
  });
  afterEach(() => {
    fixture.destroy();
    TestBed.resetTestingModule();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('exposes five criteria, preserves selection and options through email login, supports drop and removal', () => {
    expect(element.querySelector('h1')?.textContent?.trim()).toBe('Organizador de XMLs Online');
    expect(element.querySelectorAll('#organizer-criterion input[type=radio]')).toHaveLength(5);
    expect(element.textContent).toContain('NF-e 55 e NFC-e 65 em UTF-8');
    expect(api.configuration).toHaveBeenCalledWith('xml-organizer');
    expect(billing.usage).toHaveBeenCalledWith('xml-organizer');
    page.drop({
      preventDefault() {},
      dataTransfer: { files: [new File(['<a/>'], 'a.xml'), new File(['<b/>'], 'b.xml')] },
    } as unknown as DragEvent);
    expect(page.files()).toHaveLength(2);
    page.remove(0);
    expect(page.files()[0].name).toBe('b.xml');
    const criterion = element.querySelector<HTMLInputElement>(
      '#organizer-criterion input[value=supplier]',
    )!;
    criterion.click();
    fixture.detectChanges();
    expect(page.organizerOptions().criterion).toBe('supplier');
    expect(TestBed.inject(XmlSelectionService).forTool('xml-to-pdf')()).toHaveLength(0);
    user.set(null);
    page.start();
    expect(api.create).not.toHaveBeenCalled();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    page.emailLogin();
    expect(navigate).toHaveBeenCalledWith(['/login'], {
      queryParams: { returnTo: '/organizar-xml' },
    });
    expect(TestBed.inject(XmlSelectionService).organizerOptions().criterion).toBe('supplier');
  });

  it('sends options, polls progress, presents partial results, duplicates and downloads ZIP', async () => {
    page.organizerOptions.set({
      ...defaultOrganizerOptions,
      criterion: 'issuer_document',
      duplicate_action: 'keep',
    });
    page.add([new File(['<a/>'], 'a.xml'), new File(['<b/>'], 'b.xml')]);
    fixture.detectChanges();
    expect(element.textContent).toContain('Organizar XMLs');
    page.start();
    fixture.detectChanges();
    expect(api.create).toHaveBeenCalledWith(
      'xml-organizer',
      expect.objectContaining({ criterion: 'issuer_document', duplicate_action: 'keep' }),
    );
    expect(api.upload).toHaveBeenCalledWith('organizer-batch', expect.any(Array));
    expect(element.querySelector('fieldset')?.disabled).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    fixture.detectChanges();
    expect(page.state()).toBe('completed');
    expect(element.textContent).toContain('Organização concluída parcialmente');
    expect(element.textContent).toContain('Arquivos duplicados encontrados');
    expect(element.textContent).toContain('mesma chave e conteúdos diferentes');
    expect(element.textContent).toContain('Arquivos_Com_Problemas/problema.xml');
    expect(element.textContent).toContain('Baixar ZIP organizado');
    expect(element.textContent).toContain('Seu ZIP está pronto');
    expect(element.textContent).not.toContain('Seu Excel está pronto');
    expect(element.textContent).not.toContain('Baixar Excel');
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:organizer');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    page.download();
    expect(api.download).toHaveBeenCalledWith('organizer-batch');
    expect(click).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(revoke).toHaveBeenCalledWith('blob:organizer');
    create.mockRestore();
    revoke.mockRestore();
    click.mockRestore();
    page.deleteFiles();
    fixture.detectChanges();
    expect(element.querySelector('app-organizer-result')).toBeNull();
    expect(page.documentFiles()).toHaveLength(0);
  });

  it('blocks a batch above the current allowance and uses the existing plan choices', () => {
    page.usage.set({
      plan: 'free',
      limits: {
        per_processing: 1,
        daily: 1,
        used_today: 0,
        remaining_today: 1,
        resets_at: '2099-01-01',
      },
    });
    page.add([new File(['<a/>'], 'a.xml'), new File(['<b/>'], 'b.xml')]);
    page.start();
    fixture.detectChanges();
    expect(api.create).not.toHaveBeenCalled();
    expect(element.textContent).toContain('Escolha até 1 arquivos');
    expect(element.textContent).toContain('Conhecer o Pro');
    expect(element.textContent).not.toContain('Processar todos por');
  });
});
