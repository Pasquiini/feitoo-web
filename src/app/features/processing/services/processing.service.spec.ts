import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { Processing } from '../models/processing';
import { ProcessingService } from './processing.service';
import { apiSessionInterceptor } from '../../../core/interceptors/api-session.interceptor';

describe('ProcessingService', () => {
  const baseUrl = `${environment.apiUrl}/processings`;
  const processing: Processing = {
    id: '2900fbad-d9ec-4d68-a093-ef0824a77078',
    tool: 'xml-to-excel',
    status: 'pending',
    files_count: 0,
    processed_files_count: 0,
    successful_files_count: 0,
    failed_files_count: 0,
    total_size: 0,
    started_at: null,
    completed_at: null,
    expires_at: '2026-10-07T23:00:00Z',
    created_at: '2026-10-07T21:00:00Z',
    result: { available: false, file_name: null, size: null, error_message: null },
  };
  let service: ProcessingService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiSessionInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(ProcessingService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function create(): void {
    service.create('xml-to-excel').subscribe();
    const request = http.expectOne(baseUrl);
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.has('Authorization')).toBe(false);
    expect(request.request.body).toEqual({ tool: 'xml-to-excel' });
    request.flush({ data: processing });
  }

  it('uses the authenticated session for creation and query', () => {
    create();
    service.get(processing.id).subscribe((response) => expect(response.data).toEqual(processing));
    const request = http.expectOne(`${baseUrl}/${processing.id}`);
    expect(request.request.headers.has('Authorization')).toBe(false);
    expect(request.request.withCredentials).toBe(true);
    request.flush({ data: processing });
  });

  it('uploads multipart files without overriding the browser boundary', () => {
    create();
    const file = new File(['<root/>'], 'document.xml', { type: 'text/xml' });
    service.upload(processing.id, [file]).subscribe();
    const request = http.expectOne(`${baseUrl}/${processing.id}/files`);
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.has('Content-Type')).toBe(false);
    expect(request.request.headers.has('Authorization')).toBe(false);
    expect(request.request.withCredentials).toBe(true);
    const form = request.request.body as FormData;
    expect(form.getAll('files[]')).toHaveLength(1);
    expect(form.get('files[]')).toEqual(file);
    request.flush({ data: processing });
  });

  it('deletes files using the session', () => {
    create();
    service.deleteFiles(processing.id).subscribe();
    const request = http.expectOne(`${baseUrl}/${processing.id}/files`);
    expect(request.request.method).toBe('DELETE');
    expect(request.request.headers.has('Authorization')).toBe(false);
    expect(request.request.withCredentials).toBe(true);
    request.flush({ data: { ...processing, status: 'expired' } });
  });

  it('starts explicitly and receives queued state through the session', () => {
    service
      .start(processing.id)
      .subscribe((response) => expect(response.data.status).toBe('queued'));
    const request = http.expectOne(`${baseUrl}/${processing.id}/start`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({});
    expect(request.request.withCredentials).toBe(true);
    request.flush(
      { data: { ...processing, status: 'queued' } },
      { status: 202, statusText: 'Accepted' },
    );
  });

  it('lists safe per-file statuses and classified failures', () => {
    const files = [
      {
        id: 'synthetic-file-uuid',
        original_name: 'fixture.xml',
        status: 'failed',
        size: 10,
        processed_at: '2026-10-07T21:30:00Z',
        error_code: 'unsupported_document',
        error_message: 'Documento não suportado.',
      },
    ];
    service.listFiles(processing.id).subscribe((response) => expect(response.data).toEqual(files));
    const request = http.expectOne(`${baseUrl}/${processing.id}/files`);
    expect(request.request.method).toBe('GET');
    expect(request.request.withCredentials).toBe(true);
    request.flush({ data: files });
  });

  it('downloads an authenticated blob and preserves response headers', () => {
    const blob = new Blob(['xlsx']);
    service.download(processing.id).subscribe((response) => {
      expect(response.body).toEqual(blob);
      expect(response.headers.get('Content-Disposition')).toContain('feitoo.xlsx');
    });
    const request = http.expectOne(`${baseUrl}/${processing.id}/result`);
    expect(request.request.responseType).toBe('blob');
    expect(request.request.withCredentials).toBe(true);
    request.flush(blob, {
      headers: { 'Content-Disposition': 'attachment; filename="feitoo.xlsx"' },
    });
  });

  it('queries actual public limits and bounds status request time', () => {
    service.configuration().subscribe((response) => expect(response.data.max_files).toBe(17));
    const configRequest = http.expectOne(`${environment.apiUrl}/tools/xml-to-excel/config`);
    expect(configRequest.request.timeout).toBe(15000);
    configRequest.flush({ data: { max_files: 17, max_file_size_kb: 2048, ttl_minutes: 45 } });
    service.get(processing.id).subscribe();
    const statusRequest = http.expectOne(`${baseUrl}/${processing.id}`);
    expect(statusRequest.request.timeout).toBe(15000);
    statusRequest.flush({ data: processing });
  });

  it('lets the backend reject an unauthenticated session without anonymous tokens', () => {
    service.get(processing.id).subscribe({ error: (error: unknown) => expect(error).toBeTruthy() });
    const request = http.expectOne(`${baseUrl}/${processing.id}`);
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush(null, { status: 401, statusText: 'Unauthorized' });
  });
});
