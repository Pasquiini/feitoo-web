import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../auth/services/auth.service';
import { QuotationGenerationApi, QuotationProcessing } from './quotation-generation-api.service';

describe('quotation issuance transport', () => {
  const user = signal<{ id: number } | null>({ id: 1 });
  let api: QuotationGenerationApi;
  let http: HttpTestingController;
  const csrf = async () => {
    http.expectOne(environment.csrfUrl).flush(null);
    await Promise.resolve();
  };
  beforeEach(() => {
    user.set({ id: 1 });
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { user } },
      ],
    });
    api = TestBed.inject(QuotationGenerationApi);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('posts only revision and technical identifiers with CSRF, account consistency and idempotency', async () => {
    const response = api.generate({ uuid: 'draft-uuid', revision: 4, key: 'idempotent-uuid' });
    await csrf();
    const request = http.expectOne(
      `${environment.apiUrl}/quotations/drafts/draft-uuid/generations`,
    );
    expect(request.request.body).toEqual({ revision: 4 });
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.get('Idempotency-Key')).toBe('idempotent-uuid');
    expect(request.request.headers.get('X-Quotation-Owner')).toBe('1');
    request.flush({ data: {} });
    await response;
  });
  it('does not submit account A content when identity changes during CSRF', async () => {
    const response = api.generate({ uuid: 'draft', revision: 1, key: 'key' });
    const error = expect(response).rejects.toMatchObject({ status: 401 });
    user.set({ id: 2 });
    await csrf();
    await error;
    http.expectNone(`${environment.apiUrl}/quotations/drafts/draft/generations`);
  });
  it('uses private processing/download endpoints and explicit expected attempt on retry', async () => {
    const status = api.read('processing-uuid');
    http.expectOne(`${environment.apiUrl}/processings/processing-uuid`).flush({ data: {} });
    await status;
    const download = api.download('processing-uuid');
    const get = http.expectOne(`${environment.apiUrl}/processings/processing-uuid/result`);
    expect(get.request.responseType).toBe('blob');
    const pdf = new Blob(['%PDF-'], { type: 'application/pdf' });
    get.flush(pdf);
    expect(await download).toBe(pdf);
    const retry = api.retry(
      { id: 'processing-uuid', quotation: { attempt: 3 } } as QuotationProcessing,
      'retry-key',
    );
    await csrf();
    const request = http.expectOne(
      `${environment.apiUrl}/quotations/generations/processing-uuid/retry`,
    );
    expect(request.request.body).toEqual({ attempt: 3 });
    expect(request.request.headers.get('Idempotency-Key')).toBe('retry-key');
    request.flush({ data: {} });
    await retry;
  });
  it('sends an explicit paid source and creates a checkout without a client price or grant', async () => {
    const generation = api.generate({
      uuid: 'draft',
      revision: 5,
      key: 'generate-key',
      source: 'credit',
    });
    await csrf();
    const request = http.expectOne(`${environment.apiUrl}/quotations/drafts/draft/generations`);
    expect(request.request.body).toEqual({ revision: 5, source: 'credit' });
    request.flush({ data: {} });
    await generation;
    const checkout = api.checkout('purchase-key');
    await csrf();
    const buy = http.expectOne(`${environment.apiUrl}/quotations/credit-orders`);
    expect(buy.request.body).toEqual({});
    expect(buy.request.headers.get('Idempotency-Key')).toBe('purchase-key');
    buy.flush({ data: { id: 'order' } });
    expect((await checkout).id).toBe('order');
    const status = api.order('order');
    http
      .expectOne(`${environment.apiUrl}/quotations/credit-orders/order`)
      .flush({ data: { status: 'pending' } });
    expect((await status).status).toBe('pending');
    const list = api.orders(2);
    http
      .expectOne(`${environment.apiUrl}/quotations/credit-orders?page=2`)
      .flush({ data: [], meta: { current_page: 2, last_page: 2 } });
    expect((await list).meta.current_page).toBe(2);
  });
});
