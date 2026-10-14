import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { switchMap, tap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { UserResponse } from '../../auth/models/auth';
import { AuthService } from '../../auth/services/auth.service';
import { HistoryResponse, PasswordPayload } from '../models/account';

@Injectable({ providedIn: 'root' })
export class AccountService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  history(page = 1) {
    return this.http.get<HistoryResponse>(`${environment.apiUrl}/processings`, {
      params: { page },
      timeout: 15000,
    });
  }

  profile(name: string) {
    return this.http.get(environment.csrfUrl).pipe(
      switchMap(() =>
        this.http.patch<UserResponse>(`${environment.apiUrl}/account/profile`, { name }),
      ),
      tap((response) => this.auth.updateUser(response.data)),
    );
  }

  password(payload: PasswordPayload) {
    return this.http
      .get(environment.csrfUrl)
      .pipe(
        switchMap(() =>
          this.http.patch<{ message: string }>(`${environment.apiUrl}/account/password`, payload),
        ),
      );
  }
}
