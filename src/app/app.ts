import { HOME_TOOLS, TOOL_CATEGORIES } from './features/public/home-tools';
import { isPlatformBrowser } from '@angular/common';
import { SeoService } from './core/seo.service';
import { AnalyticsService } from './core/analytics.service';
import { LAUNCH_CONFIG } from './core/launch-config';
import { CookiePreferences } from './core/cookie-preferences';
import {
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
  PLATFORM_ID,
  afterNextRender,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, finalize } from 'rxjs';
import { environment } from '../environments/environment';
import { AuthService } from './features/auth/services/auth.service';
import { NavbarCredits } from './features/account/components/navbar-credits';
import { ToolPreferencesService } from './core/tool-preferences.service';
import { HomeIcon } from './features/public/home-icon';

interface HealthResponse {
  status: 'ok';
  service: 'feitoo-api';
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, HomeIcon, CookiePreferences, NavbarCredits],
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
  readonly dropdown = signal<'tools' | 'account' | 'credits' | null>(null);
  private readonly header = viewChild<ElementRef<HTMLElement>>('header');
  protected readonly development = !environment.production;
  protected readonly apiStatus = signal('Verificando conexão com a API…');

  constructor() {
    inject(ToolPreferencesService);
    inject(SeoService).start();
    const browser = isPlatformBrowser(inject(PLATFORM_ID));
    const http = inject(HttpClient);
    const destroyRef = inject(DestroyRef);
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(destroyRef),
      )
      .subscribe(() => this.closeMenus());
    effect(() => {
      this.auth.user();
      untracked(() => this.closeMenus());
    });
    afterNextRender(() => {
      const media =
        this.header()?.nativeElement.ownerDocument.defaultView?.matchMedia?.('(max-width: 900px)');
      const closeOnBreakpoint = () => this.closeMenus();
      media?.addEventListener('change', closeOnBreakpoint);
      destroyRef.onDestroy(() => media?.removeEventListener('change', closeOnBreakpoint));
    });
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

  toggleDropdown(menu: 'tools' | 'account' | 'credits'): void {
    if (menu !== 'tools' && !this.auth.user()) return;
    if (menu !== 'tools') this.mobileMenuOpen.set(false);
    this.dropdown.update((current) => (current === menu ? null : menu));
  }

  toggleMobileMenu(): void {
    this.dropdown.set(null);
    this.mobileMenuOpen.update((open) => !open);
  }

  closeMenus(): void {
    this.dropdown.set(null);
    this.mobileMenuOpen.set(false);
  }

  @HostListener('document:click', ['$event'])
  @HostListener('document:focusin', ['$event'])
  closeOutside(event: Event): void {
    const header = this.header()?.nativeElement;
    const target = event.target as Node | null;
    if (!header || !target) return;
    const menu = this.dropdown();
    const region = menu === 'credits' ? 'app-navbar-credits' : `.${menu}-menu`;
    if (menu && !header.querySelector(region)?.contains(target)) this.dropdown.set(null);
    if (
      this.mobileMenuOpen() &&
      !header.querySelector('#primary-nav')?.contains(target) &&
      !header.querySelector('.mobile-menu-toggle')?.contains(target)
    )
      this.mobileMenuOpen.set(false);
  }

  @HostListener('document:keydown.escape', ['$event'])
  closeWithEscape(event: Event): void {
    const selector = this.mobileMenuOpen()
      ? '.mobile-menu-toggle'
      : this.dropdown()
        ? `[data-nav-trigger="${this.dropdown()}"]`
        : null;
    if (!selector) return;
    event.preventDefault();
    event.stopPropagation();
    this.closeMenus();
    this.header()?.nativeElement.querySelector<HTMLElement>(selector)?.focus();
  }
}
