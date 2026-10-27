import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { AuthService } from '../../auth/services/auth.service';
import { QuotationDraftCoordinator } from './quotation-draft.coordinator';
import {
  QuotationGenerationCoordinator,
  quotationPolling,
} from './quotation-generation.coordinator';
import {
  QuotationEntitlements,
  QuotationGenerationApi,
  QuotationProcessing,
} from './quotation-generation-api.service';

describe('quotation issuance coordination', () => {
  const user = signal<{ id: number } | null>({ id: 1 });
  const quota: QuotationEntitlements = {
    source: 'free',
    policy: 'one_per_day_all_accounts',
    daily_limit: 1,
    remaining: 1,
    reserved: 0,
    consumed: 0,
    enabled: true,
    resets_at: '2026-10-24T00:00:00-03:00',
    active_processing: null,
    latest_processing: null,
  };
  const context = { uuid: 'draft-1', revision: 3, key: 'persistent-key' };
  const queued = (): QuotationProcessing => ({
    id: 'processing-1',
    tool: 'quotation-generator',
    status: 'queued',
    created_at: '',
    completed_at: null,
    expires_at: new Date(Date.now() + 86400000).toISOString(),
    quotation: {
      draft_uuid: 'draft-1',
      revision: 3,
      attempt: 1,
      reservation_date: '2026-10-22',
      pending_expires_at: '',
      source: 'free',
      consumption_status: 'reserved',
      retryable: false,
      error_code: null,
    },
    result: { available: false, file_name: null, size: null, error_message: null },
  });
  const completed = (): QuotationProcessing => ({
    ...queued(),
    status: 'completed',
    quotation: { ...queued().quotation, consumption_status: 'consumed' },
    result: { available: true, file_name: 'orcamento.pdf', size: 100, error_message: null },
  });
  const failed = (): QuotationProcessing => ({
    ...queued(),
    status: 'failed',
    quotation: {
      ...queued().quotation,
      consumption_status: 'released',
      error_code: 'render_failed',
      retryable: true,
    },
  });
  let api: {
    entitlements: ReturnType<typeof vi.fn<() => Promise<typeof quota>>>;
    generate: ReturnType<typeof vi.fn>;
    read: ReturnType<typeof vi.fn>;
    retry: ReturnType<typeof vi.fn>;
    download: ReturnType<typeof vi.fn>;
  };
  let draft: { generationContext: ReturnType<typeof vi.fn> };
  let service: QuotationGenerationCoordinator;
  let options: { interval: number; maxRequests: number; maxDuration: number };
  let createUrl: ReturnType<typeof vi.fn>;
  let revokeUrl: ReturnType<typeof vi.fn>;
  let originalCreate: PropertyDescriptor | undefined;
  let originalRevoke: PropertyDescriptor | undefined;
  const settle = async () => {
    TestBed.tick();
    for (let i = 0; i < 15; i++) await Promise.resolve();
  };
  beforeEach(async () => {
    vi.useFakeTimers();
    user.set({ id: 1 });
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    originalCreate = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
    originalRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
    createUrl = vi.fn(() => 'blob:test-pdf');
    revokeUrl = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createUrl });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeUrl });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    options = { interval: 10, maxRequests: 3, maxDuration: 1000 };
    api = {
      entitlements: vi.fn(async () => quota),
      generate: vi.fn(async () => queued()),
      read: vi.fn(async () => queued()),
      retry: vi.fn(async () => queued()),
      download: vi.fn(async () => new Blob(['%PDF-'], { type: 'application/pdf' })),
    };
    draft = { generationContext: vi.fn(async () => context) };
    TestBed.configureTestingModule({
      providers: [
        QuotationGenerationCoordinator,
        { provide: AuthService, useValue: { user } },
        { provide: QuotationGenerationApi, useValue: api },
        { provide: QuotationDraftCoordinator, useValue: draft },
        { provide: quotationPolling, useValue: options },
      ],
    });
    service = TestBed.inject(QuotationGenerationCoordinator);
    service.start();
    await settle();
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    vi.useRealTimers();
    if (originalCreate) Object.defineProperty(URL, 'createObjectURL', originalCreate);
    else Reflect.deleteProperty(URL, 'createObjectURL');
    if (originalRevoke) Object.defineProperty(URL, 'revokeObjectURL', originalRevoke);
    else Reflect.deleteProperty(URL, 'revokeObjectURL');
  });
  it('requires login and never generates automatically after successful authentication', async () => {
    user.set(null);
    await settle();
    await service.generate();
    expect(service.loginRequired()).toBe(true);
    expect(draft.generationContext).not.toHaveBeenCalled();
    user.set({ id: 1 });
    await settle();
    expect(api.generate).not.toHaveBeenCalled();
  });
  it('serializes a duplicate click before synchronization and uses the saved idempotency context', async () => {
    let finish!: (value: typeof context) => void;
    draft.generationContext.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const first = service.generate();
    await service.generate();
    expect(service.sending()).toBe(true);
    finish(context);
    await first;
    expect(api.generate).toHaveBeenCalledExactlyOnceWith(context);
    expect(service.pending()).toBe(true);
  });
  it('does not emit an unsynchronized or conflicting draft', async () => {
    draft.generationContext.mockResolvedValue(null);
    await service.generate();
    expect(api.generate).not.toHaveBeenCalled();
    expect(service.error()).toContain('sincronize');
  });
  it('shows queued, processing and completed states with bounded polling', async () => {
    api.read
      .mockResolvedValueOnce({ ...queued(), status: 'processing' })
      .mockResolvedValueOnce(completed());
    await service.generate();
    expect(service.message()).toContain('fila');
    await vi.advanceTimersByTimeAsync(10);
    expect(service.message()).toContain('Gerando');
    await vi.advanceTimersByTimeAsync(110);
    expect(service.processing()?.result.available).toBe(true);
    expect(service.polling()).toBe(false);
    expect(api.read).toHaveBeenCalledTimes(2);
    expect(api.generate).toHaveBeenCalledTimes(1);
  });
  it('stops polling at the budget and lets the user consult without submitting another job', async () => {
    await service.generate();
    await vi.advanceTimersByTimeAsync(1500);
    expect(service.polling()).toBe(false);
    expect(service.message()).toContain('pausada');
    expect(api.read.mock.calls.length).toBeLessThanOrEqual(3);
    api.read.mockResolvedValue(completed());
    await service.consult();
    expect(service.processing()?.status).toBe('completed');
    expect(api.generate).toHaveBeenCalledTimes(1);
  });
  it('backs off using Retry-After on 429 and resumes within the polling budget', async () => {
    options.maxDuration = 20000;
    api.read
      .mockRejectedValueOnce(
        new HttpErrorResponse({ status: 429, headers: new HttpHeaders({ 'Retry-After': '3' }) }),
      )
      .mockResolvedValueOnce(completed());
    await service.generate();
    await vi.advanceTimersByTimeAsync(10);
    expect(service.retryBlocked()).toBe(true);
    await vi.advanceTimersByTimeAsync(2999);
    expect(api.read).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(service.processing()?.status).toBe('completed');
    expect(service.retryBlocked()).toBe(false);
  });
  it('pauses requests in a hidden tab', async () => {
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    await service.generate();
    await vi.advanceTimersByTimeAsync(300);
    expect(api.read).not.toHaveBeenCalled();
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    await vi.advanceTimersByTimeAsync(10);
    expect(api.read).toHaveBeenCalledTimes(1);
  });
  it('retains the issuance after a network error and can consult again', async () => {
    api.read.mockRejectedValueOnce(new HttpErrorResponse({ status: 0 }));
    await service.generate();
    await vi.advanceTimersByTimeAsync(10);
    expect(service.error()).toContain('confirmar');
    expect(service.processing()?.id).toBe('processing-1');
    expect(service.polling()).toBe(false);
    api.read.mockResolvedValue(completed());
    await service.consult();
    expect(service.processing()?.status).toBe('completed');
  });
  it('shows the daily limit and its reset time without offering checkout', async () => {
    api.generate.mockRejectedValue(
      new HttpErrorResponse({ status: 422, error: { code: 'free_quota_exhausted' } }),
    );
    await service.generate();
    expect(service.error()).toBe('Você já utilizou seu orçamento gratuito de hoje.');
    expect(service.entitlements()?.resets_at).toBe(quota.resets_at);
  });
  it('explains revision conflicts without overwriting the draft', async () => {
    api.generate.mockRejectedValue(
      new HttpErrorResponse({ status: 409, error: { code: 'draft_revision_conflict' } }),
    );
    await service.generate();
    expect(service.error()).toContain('outra aba');
    expect(service.processing()).toBeNull();
  });
  it.each([401, 419])(
    'preserves the saved context when the generation session expires (%i)',
    async (status) => {
      api.generate.mockRejectedValue(new HttpErrorResponse({ status }));
      await service.generate();
      expect(service.error()).toContain('rascunho foi preservado');
      expect(api.generate).toHaveBeenCalledWith(context);
    },
  );
  it('downloads the same private PDF again without creating or reserving an issuance', async () => {
    service.processing.set(completed());
    await service.download();
    await service.download();
    expect(api.download).toHaveBeenCalledTimes(2);
    expect(api.generate).not.toHaveBeenCalled();
    expect(createUrl).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(revokeUrl).toHaveBeenCalledTimes(2);
  });
  it('marks an expired download and removes the available action', async () => {
    service.processing.set(completed());
    api.download.mockRejectedValue(new HttpErrorResponse({ status: 410 }));
    await service.download();
    expect(service.processing()?.result.available).toBe(false);
    expect(service.message()).toContain('expirou');
  });
  it('never exposes a pending account A download after a switch to account B', async () => {
    service.processing.set(completed());
    let finish!: (blob: Blob) => void;
    api.download.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const work = service.download();
    user.set({ id: 2 });
    await settle();
    finish(new Blob(['PDF'], { type: 'application/pdf' }));
    await work;
    expect(createUrl).not.toHaveBeenCalled();
    expect(service.processing()).toBeNull();
  });
  it('retries an explicitly failed issuance with the same retry key after an ambiguous response', async () => {
    service.processing.set(failed());
    api.retry.mockRejectedValueOnce(new HttpErrorResponse({ status: 0 }));
    await service.retry();
    await service.retry();
    expect(api.retry.mock.calls[0][1]).toBe(api.retry.mock.calls[1][1]);
    expect(service.processing()?.status).toBe('queued');
    expect(api.generate).not.toHaveBeenCalled();
  });
  it('restores an active server issuance after refresh without automatically generating', async () => {
    api.entitlements.mockResolvedValue({
      ...quota,
      active_processing: 'processing-1',
    } as typeof quota);
    await service.refresh();
    expect(api.read).toHaveBeenCalledWith('processing-1');
    expect(service.polling()).toBe(true);
    expect(api.generate).not.toHaveBeenCalled();
  });
});
