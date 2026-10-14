import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AnalyticsService, EventProperties } from './analytics.service';
import { LAUNCH_CONFIG } from './launch-config';
import { SubscriptionSummary } from '../features/processing/services/billing.service';

describe('Funnel analytics', () => {
  let service: AnalyticsService;
  let gtag: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: LAUNCH_CONFIG,
          useValue: { origin: 'https://feitoo.com.br', ga4Id: 'G-TEST', analyticsEnabled: true },
        },
      ],
    });
    service = TestBed.inject(AnalyticsService);
    gtag = vi.fn();
    (window as Window & { gtag?: unknown }).gtag = gtag;
  });
  afterEach(() => {
    localStorage.clear();
    document.getElementById('feitoo-ga4')?.remove();
  });
  function grant() {
    service.choose('granted');
    gtag.mockClear();
  }
  it('requires consent and enabled analytics', () => {
    service.track('processing_started', { tool: 'xml-to-excel', file_count: 12, plan: 'free' });
    expect(gtag).not.toHaveBeenCalled();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: LAUNCH_CONFIG,
          useValue: { origin: 'https://feitoo.com.br', ga4Id: 'G-TEST', analyticsEnabled: false },
        },
      ],
    });
    service = TestBed.inject(AnalyticsService);
    service.choose('granted');
    service.track('signup_completed', { auth_method: 'password' });
    expect(gtag).not.toHaveBeenCalled();
  });
  it.each([
    ['xml-to-excel', 'xml_to_excel'],
    ['products-from-xml', 'products_from_xml'],
  ] as const)('maps %s tool view', (tool, expected) => {
    grant();
    service.track('tool_view', { tool });
    expect(gtag).toHaveBeenCalledWith(
      'event',
      'tool_view',
      expect.objectContaining({ tool: expected }),
    );
  });
  it('allowlists processing payload and contains no personal/fiscal/Stripe identifiers', () => {
    grant();
    service.track('processing_started', {
      tool: 'xml-to-excel',
      file_count: 12,
      plan: 'free',
      original_name: 'secret.xml',
      email: 'secret@example.com',
      cnpj: '123456',
      cpf: '123',
      xml: '<xml/>',
      session_id: 'cs_secret',
      customer_id: 'cus_secret',
    } as EventProperties);
    const payload = gtag.mock.calls[0][2];
    expect(payload).toEqual({
      tool: 'xml_to_excel',
      file_count: 12,
      plan: 'free',
      page_location: 'https://feitoo.com.br/',
      page_referrer: '',
      page_title: 'Feitoo',
    });
  });
  it('deduplicates financial confirmation across service reloads and polling', () => {
    grant();
    const props = {
      purchase_type: 'single',
      tool: 'xml-to-excel',
      value: 4.9,
      currency: 'BRL',
    } as const;
    service.trackOnce('single_purchase_completed', 'local-only-purchase', props);
    service.trackOnce('single_purchase_completed', 'local-only-purchase', props);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: LAUNCH_CONFIG,
          useValue: { origin: 'https://feitoo.com.br', ga4Id: 'G-TEST', analyticsEnabled: true },
        },
      ],
    });
    service = TestBed.inject(AnalyticsService);
    service.choice.set('granted');
    service.trackOnce('single_purchase_completed', 'local-only-purchase', props);
    expect(gtag).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(gtag.mock.calls)).not.toContain('local-only-purchase');
  });
  it('requires a checkout followed by backend active Pro and emits once', () => {
    grant();
    const summary: SubscriptionSummary = {
      offer: { amount: 2990, currency: 'brl', per_processing: 100, daily: 100, available: true },
      subscription: {
        status: 'active',
        grants_pro: true,
        current_period_end: null,
        cancel_at_period_end: false,
      },
    };
    service.confirmSubscription(summary);
    expect(gtag).not.toHaveBeenCalled();
    service.beginSubscriptionCheckout();
    service.confirmSubscription({
      ...summary,
      subscription: { ...summary.subscription!, status: 'incomplete' },
    });
    service.confirmSubscription({
      ...summary,
      subscription: { ...summary.subscription!, grants_pro: false },
    });
    expect(gtag).not.toHaveBeenCalled();
    service.confirmSubscription(summary);
    service.confirmSubscription(summary);
    expect(gtag).toHaveBeenCalledTimes(1);
    expect(gtag).toHaveBeenCalledWith(
      'event',
      'subscription_completed',
      expect.objectContaining({
        plan: 'pro',
        purchase_type: 'subscription',
        value: 29.9,
        currency: 'BRL',
      }),
    );
  });
  it('swallows transport and storage failures', () => {
    grant();
    gtag.mockImplementation(() => {
      throw Error('transport');
    });
    expect(() => service.track('signup_completed', { auth_method: 'google' })).not.toThrow();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw Error('storage');
    });
    expect(() => service.trackOnce('single_purchase_completed', 'key', {})).not.toThrow();
    vi.restoreAllMocks();
  });
});
