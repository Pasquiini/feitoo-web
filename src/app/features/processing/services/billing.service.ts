import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { ProcessingTool } from '../models/processing';

export interface Usage {
  plan: 'free' | 'pro';
  limits: {
    per_processing: number;
    daily: number;
    used_today: number;
    remaining_today: number;
    resets_at: string;
  };
}
export interface PurchasePackage {
  code: string;
  files_limit: number;
  amount: number;
  currency: string;
}
export interface Purchase {
  can_resume_processing?: boolean;
  id: string;
  processing_id: string;
  tool: string;
  package_code: string;
  files_limit: number;
  files_count: number;
  amount: number;
  currency: string;
  status: 'pending' | 'paid' | 'failed' | 'expired' | 'refunded';
  consumed: boolean;
  paid_at: string | null;
  expires_at: string;
  created_at: string;
}
@Injectable({ providedIn: 'root' })
export class BillingService {
  redirect(url: string): void {
    const target = new URL(url);
    if (target.protocol !== 'https:' || target.hostname !== 'checkout.stripe.com')
      throw new Error('Invalid Checkout URL');
    window.location.assign(target.href);
  }
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;
  usage(tool?: ProcessingTool) {
    return this.http.get<{ data: Usage }>(`${this.base}/account/usage`, {
      timeout: 15000,
      ...(tool ? { params: { tool } } : {}),
    });
  }
  checkout(id: string) {
    return this.http.post<{ data: { purchase: Purchase; checkout_url: string | null } }>(
      `${this.base}/processings/${encodeURIComponent(id)}/purchase`,
      {},
      { timeout: 45000 },
    );
  }
  purchase(id: string) {
    return this.http.get<{ data: Purchase }>(
      `${this.base}/processings/${encodeURIComponent(id)}/purchase`,
      { timeout: 15000 },
    );
  }
  cancel(id: string) {
    return this.http.post<{ data: Purchase }>(
      `${this.base}/processings/${encodeURIComponent(id)}/purchase/cancel`,
      {},
      { timeout: 75000 },
    );
  }
  subscription() {
    return this.http.get<{ data: SubscriptionSummary }>(`${this.base}/account/subscription`, {
      timeout: 15000,
    });
  }
  proCheckout() {
    return this.http.post<{ data: { url: string } }>(
      `${this.base}/account/subscription/checkout`,
      {},
      { timeout: 60000 },
    );
  }
  portal() {
    return this.http.post<{ data: { url: string } }>(
      `${this.base}/account/subscription/portal`,
      {},
      { timeout: 30000 },
    );
  }
  portalRedirect(url: string): void {
    const target = new URL(url);
    if (target.protocol !== 'https:' || target.hostname !== 'billing.stripe.com')
      throw new Error('Invalid Portal URL');
    window.location.assign(target.href);
  }
  purchases(page = 1) {
    return this.http.get<{ data: Purchase[]; meta: { current_page: number; last_page: number } }>(
      `${this.base}/account/purchases`,
      { params: { page }, timeout: 15000 },
    );
  }
}

export interface SubscriptionSummary {
  offer: {
    amount: number;
    currency: string;
    per_processing: number;
    daily: number;
    available: boolean;
  };
  subscription: {
    status: string;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    grants_pro: boolean;
  } | null;
}
