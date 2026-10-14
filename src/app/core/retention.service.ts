import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { environment } from '../../environments/environment';
import { LAUNCH_CONFIG } from './launch-config';

@Injectable({ providedIn: 'root' })
export class RetentionService {
  readonly minutes = signal(inject(LAUNCH_CONFIG).ttlMinutes);
  readonly unavailable = signal(false);
  private readonly http = inject(HttpClient);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private requested = false;
  load(): void {
    if (!this.browser || this.requested) return;
    this.requested = true;
    this.http
      .get<{ data: { ttl_minutes: number } }>(`${environment.apiUrl}/tools/xml-to-excel/config`, {
        timeout: 5000,
      })
      .subscribe({
        next: (response) => this.minutes.set(response.data.ttl_minutes),
        error: () => this.unavailable.set(true),
      });
  }
}
