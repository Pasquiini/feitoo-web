import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../auth/services/auth.service';
import { QuotationDraftApi } from './quotation-draft-api.service';
import { createQuotationForm } from './quotation-form';
import { RemoteDraft } from './quotation-local.store';

describe('private quotation draft API contract', () => {
  let api: QuotationDraftApi;
  let http: HttpTestingController;
  const user = signal<{ id: number } | null>({ id: 7 });
  const payload = createQuotationForm().getRawValue();
  const draft: RemoteDraft = {
    uuid: '00000000-0000-4000-8000-000000000001',
    revision: 3,
    schema_version: 1,
    payload,
    logo_checksum: null,
    created_at: '',
    updated_at: '',
    expires_at: '',
  };
  const base = `${environment.apiUrl}/quotations/drafts`;
  const csrf = async () => {
    http.expectOne(environment.csrfUrl).flush(null);
    await Promise.resolve();
  };
  beforeEach(() => {
    user.set({ id: 7 });
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { user } },
      ],
    });
    api = TestBed.inject(QuotationDraftApi);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('imports with CSRF, an idempotency key and the expected account context', async () => {
    const result = api.create(payload, 'opaque-import-key');
    http.expectNone(base);
    await csrf();
    const request = http.expectOne(base);
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.get('X-Quotation-Owner')).toBe('7');
    expect(request.request.headers.get('Idempotency-Key')).toBe('opaque-import-key');
    expect(request.request.body).toEqual({ schema_version: 1, payload });
    request.flush({ data: draft });
    expect(await result).toEqual(draft);
  });
  it('sends the expected revision when updating and deleting', async () => {
    const update = api.update(draft, payload);
    await csrf();
    const request = http.expectOne(base + '/' + draft.uuid);
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body.revision).toBe(3);
    request.flush({ data: { ...draft, revision: 4 } });
    await update;
    const deletion = api.remove(draft);
    await csrf();
    const remove = http.expectOne(base + '/' + draft.uuid);
    expect(remove.request.method).toBe('DELETE');
    expect(remove.request.body).toEqual({ revision: 3 });
    remove.flush(null);
    await deletion;
  });
  it('does not submit an old snapshot if the account changes while CSRF is loading', async () => {
    const creation = api.create(payload, 'key');
    const rejected = expect(creation).rejects.toMatchObject({ status: 401 });
    user.set({ id: 8 });
    await csrf();
    await rejected;
    http.expectNone(base);
  });
  it('uses multipart method override for a private normalized logo and revision for removal', async () => {
    const logo = new Blob(['png'], { type: 'image/png' });
    const put = api.setLogo(draft, logo);
    await csrf();
    const request = http.expectOne(base + '/' + draft.uuid + '/logo');
    expect(request.request.method).toBe('POST');
    expect(request.request.body.get('_method')).toBe('PUT');
    expect(request.request.body.get('revision')).toBe('3');
    expect(request.request.body.get('logo').type).toBe('image/png');
    request.flush({ data: draft });
    await put;
    const deletion = api.setLogo(draft, null);
    await csrf();
    const remove = http.expectOne(base + '/' + draft.uuid + '/logo');
    expect(remove.request.method).toBe('DELETE');
    expect(remove.request.body.revision).toBe(3);
    remove.flush({ data: draft });
    await deletion;
    const get = api.logo(draft.uuid);
    const image = http.expectOne(base + '/' + draft.uuid + '/logo');
    expect(image.request.responseType).toBe('blob');
    image.flush(logo);
    expect(await get).toBe(logo);
  });
  it('reads only private endpoints with opaque identifiers', async () => {
    const latest = api.latest();
    const request = http.expectOne(base);
    expect(request.request.headers.get('X-Quotation-Owner')).toBe('7');
    request.flush({ data: draft });
    await latest;
    const read = api.read(draft.uuid);
    http.expectOne(base + '/' + draft.uuid).flush({ data: draft });
    expect(await read).toEqual(draft);
  });
});
