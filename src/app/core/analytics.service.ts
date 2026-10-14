import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { LAUNCH_CONFIG } from './launch-config';
import { safePage } from './public-pages';

export type AnalyticsEvent =
  | 'pro_offer_viewed'
  | 'pro_checkout_started'
  | 'pro_subscription_activated'
  | 'pro_subscription_failed'
  | 'pro_portal_opened'
  | 'free_limit_reached'
  | 'paywall_viewed'
  | 'single_purchase_started'
  | 'single_purchase_completed'
  | 'single_purchase_failed'
  | 'page_view'
  | 'tool_view'
  | 'files_selected'
  | 'upload_started'
  | 'upload_completed'
  | 'processing_started'
  | 'processing_completed'
  | 'processing_failed'
  | 'result_viewed'
  | 'download_clicked'
  | 'signup_started'
  | 'signup_completed'
  | 'google_signup_completed'
  | 'files_deleted';
export interface EventProperties {
  files_count_bucket?: string;
  package_code?: string;
  amount?: number;
  currency?: string;
  tool?: import('../features/processing/models/processing').ProcessingTool;
  files_count?: number;
  total_size_bucket?: string;
  processing_duration_bucket?: string;
  authenticated?: boolean;
  auth_method?: 'email' | 'google';
  success_count?: number;
  failure_count?: number;
}
type Choice = 'unknown' | 'granted' | 'denied';
type AnalyticsWindow = Window & { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void };
export function sizeBucket(bytes: number): string {
  return bytes < 1048576
    ? 'under_1mb'
    : bytes < 10485760
      ? '1_to_10mb'
      : bytes < 52428800
        ? '10_to_50mb'
        : '50mb_plus';
}
export function durationBucket(ms: number): string {
  return ms < 10000
    ? 'under_10s'
    : ms < 60000
      ? '10_to_60s'
      : ms < 300000
        ? '1_to_5min'
        : '5min_plus';
}
@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly document = inject(DOCUMENT);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly config = inject(LAUNCH_CONFIG);
  private readonly router = inject(Router);
  readonly enabled =
    this.config.analyticsEnabled && /^G-[A-Z0-9]+$/.test(this.config.ga4Id) && !!this.config.origin;
  readonly choice = signal<Choice>('unknown');
  readonly preferences = signal(false);
  private loaded = false;
  initialize(): void {
    if (!this.browser || !this.enabled) return;
    try {
      const saved: unknown = JSON.parse(localStorage.getItem('feitoo-consent-v1') ?? 'null');
      if (
        saved &&
        typeof saved === 'object' &&
        'choice' in saved &&
        'expires' in saved &&
        typeof saved.expires === 'number' &&
        saved.expires > Date.now() &&
        (saved.choice === 'granted' || saved.choice === 'denied')
      )
        this.choice.set(saved.choice);
    } catch {
      /* Unavailable storage leaves consent undecided. */
    }
    if (this.choice() === 'granted') {
      this.load();
      this.track('page_view');
    }
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) this.track('page_view');
    });
  }
  choose(choice: 'granted' | 'denied'): void {
    this.choice.set(choice);
    this.preferences.set(false);
    if (!this.browser) return;
    try {
      localStorage.setItem(
        'feitoo-consent-v1',
        JSON.stringify({ choice, expires: Date.now() + 180 * 86400000 }),
      );
    } catch {
      /* In-memory consent still controls this page. */
    }
    if (choice === 'granted' && this.enabled) {
      this.load();
      this.track('page_view');
    } else {
      const view = this.document.defaultView;
      if (view)
        Object.defineProperty(view, `ga-disable-${this.config.ga4Id}`, {
          value: true,
          writable: true,
          configurable: true,
        });
      this.document.getElementById('feitoo-ga4')?.remove();
      this.loaded = false;
      const host = this.document.location.hostname.split('.');
      for (const part of this.document.cookie.split(';')) {
        const name = part.trim().split('=')[0];
        if (name === '_ga' || name.startsWith('_ga_')) {
          this.document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
          for (let i = 0; i < host.length - 1; i++)
            this.document.cookie = `${name}=; Max-Age=0; path=/; domain=.${host.slice(i).join('.')}; SameSite=Lax`;
        }
      }
    }
  }
  track(event: AnalyticsEvent, properties: EventProperties = {}): void {
    if (!this.browser || !this.enabled || this.choice() !== 'granted') return;
    // Build a new allowlisted payload. Never spread caller objects into GA.
    const payload: Record<string, string | number | boolean> = {
      page_location: this.config.origin + safePage(this.router.url),
      page_referrer: '',
      page_title: 'Feitoo',
    };
    if (properties.tool === 'xml-to-excel' || properties.tool === 'products-from-xml')
      payload['tool'] = properties.tool;
    if (
      ['1_to_20', '21_to_100', '101_to_250', '250_plus'].includes(
        properties.files_count_bucket ?? '',
      )
    )
      payload['files_count_bucket'] = properties.files_count_bucket!;
    if (/^xml_(100|250|500|1000)$/.test(properties.package_code ?? ''))
      payload['package_code'] = properties.package_code!;
    if (
      Number.isInteger(properties.amount) &&
      properties.amount! > 0 &&
      properties.amount! <= 1000000
    )
      payload['amount'] = properties.amount!;
    if (properties.currency === 'brl') payload['currency'] = 'brl';
    if (properties.auth_method === 'email' || properties.auth_method === 'google')
      payload['auth_method'] = properties.auth_method;
    if (typeof properties.authenticated === 'boolean')
      payload['authenticated'] = properties.authenticated;
    for (const key of ['files_count', 'success_count', 'failure_count'] as const) {
      const value = properties[key];
      if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 10000)
        payload[key] = value;
    }
    if (
      ['under_1mb', '1_to_10mb', '10_to_50mb', '50mb_plus'].includes(
        properties.total_size_bucket ?? '',
      )
    )
      payload['total_size_bucket'] = properties.total_size_bucket!;
    if (
      ['under_10s', '10_to_60s', '1_to_5min', '5min_plus'].includes(
        properties.processing_duration_bucket ?? '',
      )
    )
      payload['processing_duration_bucket'] = properties.processing_duration_bucket!;
    (this.document.defaultView as AnalyticsWindow | null)?.gtag?.('event', event, payload);
  }
  private load(): void {
    const view = this.document.defaultView as AnalyticsWindow | null;
    if (!view) return;
    Object.defineProperty(view, `ga-disable-${this.config.ga4Id}`, {
      value: false,
      writable: true,
      configurable: true,
    });
    if (this.loaded) return;
    this.loaded = true;
    view.dataLayer = [];
    const consent = this.choice;
    view.gtag = function (..._args: unknown[]) {
      if (consent() === 'granted') view.dataLayer?.push(arguments);
    };
    view.gtag('consent', 'default', {
      analytics_storage: 'granted',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
    view.gtag('js', new Date());
    view.gtag('config', this.config.ga4Id, {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      page_location: this.config.origin + safePage(this.router.url),
      page_referrer: '',
      page_title: 'Feitoo',
    });
    const script = this.document.createElement('script');
    script.id = 'feitoo-ga4';
    script.async = true;
    script.referrerPolicy = 'no-referrer';
    script.src = `https://www.googletagmanager.com/gtag/js?id=${this.config.ga4Id}`;
    this.document.head.appendChild(script);
  }
}
