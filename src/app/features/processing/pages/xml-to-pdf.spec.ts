import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsService } from '../../../core/analytics.service';
import { AuthService } from '../../auth/services/auth.service';
import { BillingService } from '../services/billing.service';
import { ProcessingService } from '../services/processing.service';
import { XmlSelectionService } from '../services/xml-selection.service';
import { Processing } from '../models/processing';
import { XmlToExcelPage } from './xml-to-excel';

describe('XML to DANFE shared flow', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });
  it('uses PDF configuration, isolated selection, success statuses and authenticated preview', async () => {
    const batch: Processing = {
      id: 'pdf-batch',
      tool: 'xml-to-pdf',
      status: 'completed',
      files_count: 1,
      processed_files_count: 1,
      successful_files_count: 1,
      failed_files_count: 0,
      total_size: 10,
      started_at: null,
      completed_at: null,
      expires_at: '2099-01-01',
      created_at: '2026-10-15',
      result: { available: true, file_name: 'feitoo-danfes.zip', size: 100, error_message: null },
    };
    const file = {
      id: 'input',
      original_name: 'nota.xml',
      status: 'completed' as const,
      size: 10,
      processed_at: null,
      error_code: null,
      error_message: null,
      document: {
        access_key: '1'.repeat(44),
        number: '123',
        series: '1',
        issuer_name: 'Emitente',
        recipient_name: 'Destinatário',
        total_value: '25.00',
        notice: 'Status atual na SEFAZ não consultado.',
      },
    };
    const api = {
      configuration: vi.fn(() =>
        of({
          data: {
            max_files: 20,
            max_processing_files: 250,
            max_file_size_kb: 10240,
            ttl_minutes: 120,
            free: { per_processing: 20, daily: 50 },
            packages: [],
          },
        }),
      ),
      listFiles: vi.fn(() => of({ data: [file] })),
      pdf: vi.fn(() => of(new Blob(['%PDF-test']))),
    };
    const billing = {
      usage: vi.fn(() =>
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
      ),
    };
    await TestBed.configureTestingModule({
      imports: [XmlToExcelPage],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { data: { tool: 'xml-to-pdf' }, queryParamMap: new Map() } },
        },
        { provide: AuthService, useValue: { user: signal({ id: 1 }) } },
        { provide: ProcessingService, useValue: api },
        { provide: BillingService, useValue: billing },
        {
          provide: AnalyticsService,
          useValue: { choice: signal('denied'), track: vi.fn(), funnel: vi.fn() },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(XmlToExcelPage);
    fixture.detectChanges();
    const page = fixture.componentInstance;
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('h1')?.textContent?.trim()).toBe('Converter XML em PDF');
    expect(api.configuration).toHaveBeenCalledWith('xml-to-pdf');
    expect(billing.usage).toHaveBeenCalledWith('xml-to-pdf');
    page.add([new File(['<xml/>'], 'nota.xml')]);
    expect(TestBed.inject(XmlSelectionService).forTool('products-from-xml')()).toHaveLength(0);
    fixture.detectChanges();
    expect(element.textContent).toContain('Gerar DANFE');
    page.processing.set(batch);
    page.state.set('completed');
    page.loadDocumentFiles();
    fixture.detectChanges();
    expect(element.textContent).toContain('Baixar PDFs em ZIP');
    expect(element.textContent).toContain('Visualizar PDF');
    expect(element.textContent).toContain('PDF gerado');
    expect(element.textContent).toContain('Status atual na SEFAZ não consultado');
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:synthetic');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    page.viewDanfe(file);
    fixture.detectChanges();
    expect(api.pdf).toHaveBeenCalledWith('pdf-batch', 'input');
    expect(element.querySelector('iframe')?.getAttribute('src')).toBe('blob:synthetic');
    fixture.destroy();
    expect(revoke).toHaveBeenCalledWith('blob:synthetic');
    create.mockRestore();
    revoke.mockRestore();
  });
});
