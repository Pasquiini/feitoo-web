import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../auth/services/auth.service';

export interface QuotationEntitlements {
  source: 'free' | 'pro' | 'credit';
  policy: 'one_per_day_all_accounts' | 'explicit_source';
  credits?: {
    granted: number;
    reserved: number;
    consumed: number;
    revoked: number;
    available: number;
  };
  pro?: {
    active: boolean;
    limit?: number;
    remaining: number;
    reserved?: number;
    consumed?: number;
    period_end?: string;
  };
  offer?: { available: boolean; credits: number; amount: number; code: string; currency: string };
  daily_limit: number;
  reserved: number;
  consumed: number;
  remaining: number;
  resets_at: string;
  enabled: boolean;
  active_processing: string | null;
  latest_processing: string | null;
}
export interface QuotationProcessing {
  id: string;
  tool: 'quotation-generator';
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'expired';
  created_at: string;
  completed_at: string | null;
  expires_at: string;
  quotation: {
    draft_uuid: string;
    revision: number;
    attempt: number;
    reservation_date: string;
    pending_expires_at: string;
    source: 'free' | 'pro' | 'credit';
    consumption_status: 'reserved' | 'consumed' | 'released';
    error_code: string | null;
    retryable: boolean;
  };
  result: {
    available: boolean;
    file_name: string | null;
    size: number | null;
    error_message: string | null;
  };
}
export interface QuotationOrder {
  id: string;
  status: string;
  amount: number;
  credits: number;
  currency: string;
  checkout_url: string | null;
  created_at: string;
  paid_at: string | null;
  refunded_amount: number;
}
@Injectable({ providedIn: 'root' })
export class QuotationGenerationApi {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly base = environment.apiUrl;
  private headers(owner = this.auth.user()?.id): Record<string, string> {
    if (!owner || owner !== this.auth.user()?.id) throw new HttpErrorResponse({ status: 401 });
    return { 'X-Quotation-Owner': String(owner) };
  }
  private async csrf(): Promise<Record<string, string>> {
    const owner = this.auth.user()?.id;
    this.headers(owner);
    await firstValueFrom(this.http.get(environment.csrfUrl, { timeout: 15000 }));
    return this.headers(owner);
  }
  async entitlements(): Promise<QuotationEntitlements> {
    return (
      await firstValueFrom(
        this.http.get<{ data: QuotationEntitlements }>(`${this.base}/quotations/entitlements`, {
          headers: this.headers(),
          timeout: 15000,
        }),
      )
    ).data;
  }
  async generate(context: {
    uuid: string;
    revision: number;
    key: string;
    source?: 'free' | 'pro' | 'credit';
  }): Promise<QuotationProcessing> {
    const headers = { ...(await this.csrf()), 'Idempotency-Key': context.key };
    return (
      await firstValueFrom(
        this.http.post<{ data: QuotationProcessing }>(
          `${this.base}/quotations/drafts/${context.uuid}/generations`,
          { revision: context.revision, ...(context.source ? { source: context.source } : {}) },
          { headers, timeout: 15000 },
        ),
      )
    ).data;
  }
  async checkout(key: string): Promise<QuotationOrder> {
    return (
      await firstValueFrom(
        this.http.post<{ data: QuotationOrder }>(
          `${this.base}/quotations/credit-orders`,
          {},
          {
            headers: { ...(await this.csrf()), 'Idempotency-Key': key },
            timeout: 20000,
          },
        ),
      )
    ).data;
  }
  async order(uuid: string): Promise<QuotationOrder> {
    return (
      await firstValueFrom(
        this.http.get<{ data: QuotationOrder }>(`${this.base}/quotations/credit-orders/${uuid}`, {
          headers: this.headers(),
          timeout: 20000,
        }),
      )
    ).data;
  }
  async orders(
    page = 1,
  ): Promise<{ data: QuotationOrder[]; meta: { current_page: number; last_page: number } }> {
    return await firstValueFrom(
      this.http.get<{ data: QuotationOrder[]; meta: { current_page: number; last_page: number } }>(
        `${this.base}/quotations/credit-orders?page=${page}`,
        { headers: this.headers(), timeout: 15000 },
      ),
    );
  }
  async retry(processing: QuotationProcessing, key: string): Promise<QuotationProcessing> {
    const headers = { ...(await this.csrf()), 'Idempotency-Key': key };
    return (
      await firstValueFrom(
        this.http.post<{ data: QuotationProcessing }>(
          `${this.base}/quotations/generations/${processing.id}/retry`,
          { attempt: processing.quotation.attempt },
          { headers, timeout: 15000 },
        ),
      )
    ).data;
  }
  async read(uuid: string): Promise<QuotationProcessing> {
    return (
      await firstValueFrom(
        this.http.get<{ data: QuotationProcessing }>(`${this.base}/processings/${uuid}`, {
          headers: this.headers(),
          timeout: 15000,
        }),
      )
    ).data;
  }
  download(uuid: string): Promise<Blob> {
    return firstValueFrom(
      this.http.get(`${this.base}/processings/${uuid}/result`, {
        responseType: 'blob',
        headers: this.headers(),
        timeout: 30000,
      }),
    );
  }
}
