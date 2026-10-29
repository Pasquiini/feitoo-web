import { HttpErrorResponse, HttpHeaders, HttpResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, NavigationStart, provideRouter, Router } from '@angular/router';
import { of, Subject, throwError, Observable } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthUser } from '../../auth/models/auth';
import { AuthService } from '../../auth/services/auth.service';
import { ProcessingService } from '../../processing/services/processing.service';
import { HistoryProcessing, HistoryResponse } from '../models/account';
import { AccountService } from '../services/account.service';
import { AccountFilesPage } from './account-files';
import {
  BillingService,
  SubscriptionSummary,
  Usage,
} from '../../processing/services/billing.service';

describe('AccountFilesPage', () => {
  const initialUser: AuthUser = {
    id: 1,
    name: 'Maria Silva',
    email: 'maria@example.com',
    google_linked: false,
    has_password: true,
    created_at: '2026-10-08T12:00:00Z',
  };
  const user = signal<AuthUser | null>(initialUser);
  const batch: HistoryProcessing = {
    id: 'batch',
    tool: 'xml-to-excel',
    status: 'completed',
    created_at: '2026-10-08T12:00:00Z',
    expires_at: '2099-01-01T12:00:00Z',
    files_count: 3,
    successful_files_count: 2,
    failed_files_count: 1,
    files_deleted: false,
    can_delete_files: true,
    result: { available: true, file_name: 'result.xlsx' },
  };
  const response: HistoryResponse = {
    data: [batch],
    meta: { current_page: 1, last_page: 1, per_page: 10, total: 1 },
  };
  const api = { history: vi.fn(), profile: vi.fn(), password: vi.fn() };
  const processingApi = { download: vi.fn(), deleteFiles: vi.fn() };
  const auth = { user, clear: vi.fn(() => user.set(null)), startGoogle: vi.fn() };
  let fixture: ComponentFixture<AccountFilesPage>;
  let page: AccountFilesPage;
  let element: HTMLElement;
  const queryParams = new Map<string, string>();
  const pending: SubscriptionSummary = {
    offer: { amount: 2990, currency: 'brl', per_processing: 250, daily: 500, available: true },
    subscription: {
      status: 'incomplete',
      current_period_end: null,
      cancel_at_period_end: false,
      grants_pro: false,
    },
  };
  beforeEach(async () => {
    vi.useFakeTimers();
    queryParams.clear();
    user.set(initialUser);
    api.history.mockReturnValue(of(response));
    api.profile.mockReturnValue(of({ data: { ...initialUser, name: 'Maria Nova' } }));
    api.password.mockReturnValue(of({ message: 'Senha atualizada.' }));
    processingApi.deleteFiles.mockReturnValue(of({ data: {} }));
    await TestBed.configureTestingModule({
      imports: [AccountFilesPage],
      providers: [
        provideRouter([]),
        {
          provide: BillingService,
          useValue: {
            usage: () =>
              of({
                data: {
                  plan: 'free',
                  limits: { per_processing: 20, daily: 50, used_today: 0, remaining_today: 50 },
                },
              }),
            subscription: () =>
              of({
                data: {
                  offer: {
                    amount: 2990,
                    currency: 'brl',
                    per_processing: 250,
                    daily: 500,
                    available: true,
                  },
                  subscription: null,
                },
              }),
            proCheckout: () => of({ data: { url: 'https://checkout.stripe.com/test' } }),
            portal: () => of({ data: { url: 'https://billing.stripe.com/test' } }),
            redirect: vi.fn(),
            portalRedirect: vi.fn(),
            purchases: () => of({ data: [], meta: { current_page: 1, last_page: 1 } }),
          },
        },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: queryParams } } },
        { provide: AuthService, useValue: auth },
        { provide: AccountService, useValue: api },
        { provide: ProcessingService, useValue: processingApi },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AccountFilesPage);
    page = fixture.componentInstance;
    element = fixture.nativeElement;
  });

  it('does not show an error count for a fully successful processing', () => {
    page.history.set([{ ...batch, successful_files_count: 3, failed_files_count: 0 }]);
    fixture.detectChanges();
    expect(element.querySelector('.history-counts')?.textContent).not.toContain('0 com erro');
  });

  it.each([
    ['completed', false, '8742.19', 'R$ 8.742,19'],
    ['expired', false, '8742.19', 'R$ 8.742,19'],
    ['expired', true, '8742.19', 'R$ 8.742,19'],
    ['completed', false, '9007199254740993.29', 'R$ 9.007.199.254.740.993,29'],
    ['completed', false, '0.00', 'R$ 0,00'],
  ] as const)(
    'renders a persisted fiscal total for %s (deleted: %s)',
    (status, deleted, value, formatted) => {
      page.history.set([{ ...batch, status, files_deleted: deleted, total_value: value }]);
      fixture.detectChanges();
      expect(element.querySelector('.history-info')?.textContent).toContain(
        `Total fiscal: ${formatted}`,
      );
    },
  );

  it.each([undefined, null])('omits unavailable fiscal totals (%s)', (value) => {
    page.history.set([{ ...batch, total_value: value }]);
    fixture.detectChanges();
    expect(element.querySelector('.history-info')?.textContent).not.toContain('Total fiscal:');
  });

  it('loads only the requested page and shows history loading and retry states', () => {
    const pending = new Subject<HistoryResponse>();
    api.history.mockReturnValue(pending);
    page.loadHistory(2);
    fixture.detectChanges();
    expect(element.textContent).toContain('Carregando seus processamentos');
    page.loadHistory(2);
    expect(api.history).toHaveBeenCalledTimes(2);
    pending.next({
      ...response,
      meta: { ...response.meta, current_page: 2, last_page: 2, total: 12 },
    });
    pending.complete();
    fixture.detectChanges();
    expect(element.textContent).toContain('Página 2 de 2');
    expect(
      [...element.querySelectorAll<HTMLButtonElement>('.history-pagination button')][1].disabled,
    ).toBe(true);
    api.history.mockReturnValue(throwError(() => new Error('offline')));
    page.loadHistory();
    fixture.detectChanges();
    expect(element.textContent).toContain('Não foi possível carregar');
  });

  it('shows a useful empty state', () => {
    api.history.mockReturnValue(
      of({ data: [], meta: { current_page: 1, last_page: 1, total: 0, per_page: 10 } }),
    );
    page.loadHistory();
    fixture.detectChanges();
    expect(element.textContent).toContain('Você ainda não fez nenhum processamento');
    expect(element.querySelector('.empty-history a')!.getAttribute('href')).toBe('/xml-para-excel');
  });

  it('downloads through the private endpoint and releases the object URL', async () => {
    processingApi.download.mockReturnValue(
      of(
        new HttpResponse({
          body: new Blob(['xlsx']),
          headers: new HttpHeaders({
            'Content-Disposition': 'attachment; filename="private.xlsx"',
          }),
        }),
      ),
    );
    const create = vi.fn(() => 'blob:private');
    const revoke = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: create });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      expect(this.download).toBe('private.xlsx');
    });
    page.download(batch);
    expect(processingApi.download).toHaveBeenCalledWith('batch');
    await vi.advanceTimersByTimeAsync(1000);
    expect(revoke).toHaveBeenCalledWith('blob:private');
    click.mockRestore();
  });

  it('hides download for expired or deleted results and updates expiry without network requests', async () => {
    const short = { ...batch, expires_at: new Date(Date.now() + 1000).toISOString() };
    page.history.set([short]);
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(15000);
    fixture.detectChanges();
    expect(element.textContent).toContain('Resultado expirado');
    expect(element.textContent).not.toContain('Baixar Excel');
    page.download(short);
    expect(processingApi.download).not.toHaveBeenCalled();
    page.history.set([{ ...batch, files_deleted: true, can_delete_files: false }]);
    fixture.detectChanges();
    expect(element.textContent).toContain('Arquivos excluídos');
    expect(element.textContent).not.toContain('Excluir arquivos');
    expect(api.history).toHaveBeenCalledOnce();
  });

  it('requires explicit deletion confirmation, permits cancellation, preserves the history row', () => {
    fixture.detectChanges();
    const remove = [...element.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent?.trim() === 'Excluir arquivos',
    )!;
    remove.click();
    fixture.detectChanges();
    expect(processingApi.deleteFiles).not.toHaveBeenCalled();
    expect(element.textContent).toContain('Esta ação não pode ser desfeita');
    page.cancelDelete();
    expect(page.confirming()).toBeNull();
    fixture.detectChanges();
    remove.click();
    fixture.detectChanges();
    page.deleteFiles();
    fixture.detectChanges();
    expect(processingApi.deleteFiles).toHaveBeenCalledWith('batch');
    expect(page.history()).toHaveLength(1);
    expect(page.history()[0].files_deleted).toBe(true);
    expect(element.textContent).toContain('O registro permanece no histórico');
    expect(element.textContent).not.toContain('Baixar Excel');
  });

  it('keeps confirmation and existing files after deletion failure', () => {
    processingApi.deleteFiles.mockReturnValue(throwError(() => new Error('offline')));
    fixture.detectChanges();
    [...element.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === 'Excluir arquivos')!
      .click();
    page.deleteFiles();
    expect(page.confirming()?.id).toBe('batch');
    expect(page.history()[0].files_deleted).toBe(false);
    expect(page.historyError()).toContain('Não foi possível excluir');
  });

  it('redirects an expired session back to login with account return', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    vi.spyOn(TestBed.inject(Router), 'url', 'get').mockReturnValue('/conta/arquivos');
    api.history.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 401 })));
    page.loadHistory();
    expect(auth.clear).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/login'], {
      queryParams: { returnTo: '/conta/arquivos', session: 'expired' },
    });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.clearAllMocks();
  });
});
