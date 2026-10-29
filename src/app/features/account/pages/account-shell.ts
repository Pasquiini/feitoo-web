import { Component, DestroyRef, ElementRef, afterNextRender, effect, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  ActivatedRoute,
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { AuthService } from '../../auth/services/auth.service';

@Component({
  selector: 'app-account-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  styleUrl: './account-shell.scss',
  template: `
    <section class="account-shell" aria-label="Minha conta">
      <div class="account-label">MINHA CONTA</div>
      <nav class="account-nav" aria-label="Áreas da minha conta">
        @for (link of links; track link.path) {
          <a
            [routerLink]="link.path"
            routerLinkActive="selected"
            [routerLinkActiveOptions]="{
              paths: 'exact',
              queryParams: 'ignored',
              matrixParams: 'ignored',
              fragment: 'ignored',
            }"
            ariaCurrentWhenActive="page"
            >{{ link.label }}</a
          >
        }
      </nav>
      @if (auth.user()?.id === owner) {
        <router-outlet (activate)="focusPage()" />
      }
    </section>
  `,
})
export class AccountShell {
  readonly auth = inject(AuthService);
  readonly owner = this.auth.user()?.id;
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private focusTimer?: ReturnType<typeof setTimeout>;
  readonly links = [
    { path: '/conta', label: 'Visão geral' },
    { path: '/conta/assinatura', label: 'Assinatura' },
    { path: '/conta/creditos', label: 'Créditos' },
    { path: '/conta/arquivos', label: 'Arquivos' },
    { path: '/conta/perfil', label: 'Perfil' },
  ];
  constructor() {
    effect(() => {
      if (this.auth.user()?.id !== this.owner) {
        const path = this.router.url.split(/[?#]/)[0];
        const order = this.router.parseUrl(this.router.url).queryParams['quotation_order'];
        void this.router.navigate(['/login'], {
          queryParams: {
            returnTo: path,
            session: 'expired',
            ...(path === '/conta/creditos' && /^[0-9a-f-]{36}$/i.test(order ?? '')
              ? { quotation_order: order }
              : {}),
          },
        });
      }
    });
    this.router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.legacy();
        this.focusPage();
      }
    });
    afterNextRender(() => this.legacy());
    inject(DestroyRef).onDestroy(() => clearTimeout(this.focusTimer));
  }
  private legacy(): void {
    if (this.router.url.split(/[?#]/)[0] !== '/conta') return;
    const query = this.route.snapshot.queryParams;
    const fragments: Record<string, string> = {
      'credits-title': 'creditos',
      'buy-credits-title': 'creditos',
      'purchases-title': 'creditos',
      'quotation-credits-title': 'creditos',
      'plan-title': 'assinatura',
      'history-title': 'arquivos',
      'profile-title': 'perfil',
      'security-title': 'perfil',
      'privacy-title': 'perfil',
      'account-overview': '',
      'overview-title': '',
    };
    const fragment = this.route.snapshot.fragment;
    const target = query['subscription']
      ? 'assinatura'
      : query['google_error']
        ? 'perfil'
        : fragment
          ? fragments[fragment]
          : undefined;
    if (target !== undefined && (target || fragment))
      void this.router.navigate([target ? '/conta/' + target : '/conta'], {
        queryParams: query,
        replaceUrl: true,
      });
  }
  focusPage(): void {
    clearTimeout(this.focusTimer);
    this.focusTimer = setTimeout(() => {
      const heading = this.element.nativeElement.querySelector<HTMLElement>('h1');
      heading?.setAttribute('tabindex', '-1');
      heading?.focus({ preventScroll: true });
      this.element.nativeElement
        .querySelector('[aria-current="page"]')
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  }
}
