import { HOME_TOOLS, TOOL_CATEGORIES } from './features/public/home-tools';
import { isPlatformBrowser } from '@angular/common';
import { SeoService } from './core/seo.service';
import { AnalyticsService } from './core/analytics.service';
import { LAUNCH_CONFIG } from './core/launch-config';
import { CookiePreferences } from './core/cookie-preferences';
import { Component, DestroyRef, inject, signal, PLATFORM_ID, afterNextRender } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { finalize } from 'rxjs';
import { environment } from '../environments/environment';
import { AuthService } from './features/auth/services/auth.service';

interface HealthResponse {
  status: 'ok';
  service: 'feitoo-api';
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, CookiePreferences],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  readonly tools = HOME_TOOLS;
  readonly toolCategories = TOOL_CATEGORIES;
  readonly auth = inject(AuthService);
  readonly analytics = inject(AnalyticsService);
  readonly launch = inject(LAUNCH_CONFIG);
  readonly year = new Date().getFullYear();
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly authError = signal('');
  readonly loggingOut = signal(false);
  readonly mobileMenuOpen = signal(false);
  protected readonly development = !environment.production;
  protected readonly apiStatus = signal('Verificando conexão com a API…');

  constructor() {
    inject(SeoService).start();
    const browser = isPlatformBrowser(inject(PLATFORM_ID));
    const http = inject(HttpClient);
    const destroyRef = inject(DestroyRef);
    if (browser)
      this.auth
        .restore()
        .pipe(takeUntilDestroyed(destroyRef))
        .subscribe({
          error: () =>
            this.authError.set('Não foi possível verificar sua sessão. Confira a conexão.'),
        });

    afterNextRender(() => this.analytics.initialize());
    if (browser && this.development) {
      http
        .get<HealthResponse>(`${environment.apiUrl}/health`, { timeout: 5000 })
        .pipe(takeUntilDestroyed(destroyRef))
        .subscribe({
          next: (health) =>
            this.apiStatus.set(
              health.status === 'ok' && health.service === 'feitoo-api'
                ? 'API conectada.'
                : 'Resposta inesperada da API.',
            ),
          error: () => this.apiStatus.set('API indisponível. Verifique o servidor local.'),
        });
    }
  }

  logout(): void {
    if (this.loggingOut()) return;
    this.loggingOut.set(true);
    this.auth
      .logout()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loggingOut.set(false)),
      )
      .subscribe({
        next: () => {
          this.authError.set('');
          void this.router.navigateByUrl('/login');
        },
        error: () => this.authError.set('Não foi possível encerrar a sessão. Tente novamente.'),
      });
  }

  get loginContext(): {
    returnTo:
      | '/docx-para-pdf'
      | '/analisar-xml'
      | '/organizar-xml'
      | '/xml-para-excel'
      | '/xml-para-pdf'
      | '/produtos-dos-xmls'
      | '/gerador-de-orcamentos'
      | '/conta';
  } | null {
    const path = this.router.url.split(/[?#]/)[0];
    return path === '/analisar-xml' ||
      path === '/organizar-xml' ||
      path === '/docx-para-pdf' ||
      path === '/xml-para-pdf' ||
      path === '/xml-para-excel' ||
      path === '/produtos-dos-xmls' ||
      path === '/gerador-de-orcamentos' ||
      path === '/conta'
      ? { returnTo: path }
      : null;
  }

  closeAccountMenu(event: Event): void {
    const menu = (event.target as HTMLElement).closest('details');
    const wasOpen = menu?.open;
    menu?.removeAttribute('open');
    if (event.type === 'keydown' && wasOpen) {
      event.stopPropagation();
      menu?.querySelector('summary')?.focus();
    }
  }

  closeMobileMenu(event: Event): void {
    if (!this.mobileMenuOpen()) return;
    this.mobileMenuOpen.set(false);
    (event.currentTarget as HTMLElement)
      .querySelector<HTMLButtonElement>('.mobile-menu-toggle')
      ?.focus();
  }
}
