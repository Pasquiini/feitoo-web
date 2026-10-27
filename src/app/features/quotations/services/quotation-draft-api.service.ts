import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { QuotationEditorValue } from '../models/quotation';
import { RemoteDraft } from './quotation-local.store';
import { AuthService } from '../../auth/services/auth.service';

export interface QuotationDraftSummary {
  uuid: string;
  revision: number;
  number: string;
  customer_name: string;
  template_id: 'classic' | 'modern';
  updated_at: string;
  expires_at: string;
}

@Injectable({ providedIn: 'root' })
export class QuotationDraftApi {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly base = `${environment.apiUrl}/quotations/drafts`;
  private headers(owner = this.auth.user()?.id): Record<string, string> {
    if (!owner || owner !== this.auth.user()?.id) throw new HttpErrorResponse({ status: 401 });
    return { 'X-Quotation-Owner': String(owner) };
  }
  private async csrf(): Promise<Record<string, string>> {
    const owner = this.auth.user()?.id;
    this.headers(owner);
    await firstValueFrom(this.http.get(environment.csrfUrl));
    return this.headers(owner);
  }
  async latest(): Promise<RemoteDraft | null> {
    return (
      await firstValueFrom(
        this.http.get<{ data: RemoteDraft | null }>(this.base, { headers: this.headers() }),
      )
    ).data;
  }
  async list(
    page = 1,
  ): Promise<{
    data: QuotationDraftSummary[];
    meta: { current_page: number; last_page: number; total: number };
  }> {
    return firstValueFrom(
      this.http.get<{
        data: QuotationDraftSummary[];
        meta: { current_page: number; last_page: number; total: number };
      }>(this.base, {
        headers: this.headers(),
        params: { page },
        timeout: 15000,
      }),
    );
  }
  async read(uuid: string): Promise<RemoteDraft> {
    return (
      await firstValueFrom(
        this.http.get<{ data: RemoteDraft }>(`${this.base}/${uuid}`, { headers: this.headers() }),
      )
    ).data;
  }
  async create(payload: QuotationEditorValue, key: string): Promise<RemoteDraft> {
    const headers = await this.csrf();
    return (
      await firstValueFrom(
        this.http.post<{ data: RemoteDraft }>(
          this.base,
          { schema_version: 1, payload },
          { headers: { ...headers, 'Idempotency-Key': key } },
        ),
      )
    ).data;
  }
  async update(remote: RemoteDraft, payload: QuotationEditorValue): Promise<RemoteDraft> {
    const headers = await this.csrf();
    return (
      await firstValueFrom(
        this.http.patch<{ data: RemoteDraft }>(
          `${this.base}/${remote.uuid}`,
          { revision: remote.revision, schema_version: 1, payload },
          { headers },
        ),
      )
    ).data;
  }
  async logo(uuid: string): Promise<Blob> {
    return firstValueFrom(
      this.http.get(`${this.base}/${uuid}/logo`, { responseType: 'blob', headers: this.headers() }),
    );
  }
  async setLogo(remote: RemoteDraft, logo: Blob | null): Promise<RemoteDraft> {
    const headers = await this.csrf();
    if (!logo)
      return (
        await firstValueFrom(
          this.http.delete<{ data: RemoteDraft }>(`${this.base}/${remote.uuid}/logo`, {
            body: { revision: remote.revision },
            headers,
          }),
        )
      ).data;
    // PHP 8.2 parses multipart POST; Laravel routes the method override as PUT.
    const body = new FormData();
    body.set('_method', 'PUT');
    body.set('revision', String(remote.revision));
    body.set('logo', logo, 'logo.png');
    return (
      await firstValueFrom(
        this.http.post<{ data: RemoteDraft }>(`${this.base}/${remote.uuid}/logo`, body, {
          headers,
        }),
      )
    ).data;
  }
  async remove(remote: RemoteDraft): Promise<void> {
    const headers = await this.csrf();
    await firstValueFrom(
      this.http.delete(`${this.base}/${remote.uuid}`, {
        body: { revision: remote.revision },
        headers,
      }),
    );
  }
}
