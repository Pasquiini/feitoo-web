import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { BillingService } from './billing.service';

describe('BillingService', () => {
  let api: BillingService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(BillingService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });
  it('requests Checkout without sending price, capacity or metadata', () => {
    api.checkout('batch').subscribe();
    const request = http.expectOne(`${environment.apiUrl}/processings/batch/purchase`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({});
    request.flush({ data: { purchase: {}, checkout_url: 'https://checkout.stripe.com/test' } });
  });
  it('consults private usage and purchases with backend pagination', () => {
    api.usage().subscribe();
    http.expectOne(`${environment.apiUrl}/account/usage`).flush({ data: {} });
    api.purchases(2).subscribe();
    http.expectOne(`${environment.apiUrl}/account/purchases?page=2`).flush({ data: [], meta: {} });
  });
  it('rejects external or insecure redirects', () => {
    expect(() => api.redirect('https://checkout.stripe.com.evil.test/pay')).toThrow();
    expect(() => api.redirect('http://checkout.stripe.com/pay')).toThrow();
  });
});
