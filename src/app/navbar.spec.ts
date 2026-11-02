import { Component, PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { of, Subject } from 'rxjs';
import { App } from './app';
import { AuthService } from './features/auth/services/auth.service';
import { AuthUser } from './features/auth/models/auth';
import { AnalyticsService } from './core/analytics.service';
import { LAUNCH_CONFIG } from './core/launch-config';
import { QuotationGenerationApi } from './features/quotations/services/quotation-generation-api.service';
import { HOME_TOOLS } from './features/public/home-tools';

@Component({ template: '<h1>Destino de teste</h1>' })
class Destination {}

describe('Global navbar', () => {
  const person: AuthUser = {
    id: 1,
    name: 'Pessoa Teste',
    email: 'private@example.test',
    google_linked: false,
    has_password: true,
    created_at: '2026-10-01',
  };
  const user = signal<AuthUser | null>(null);
  let logoutResult: Subject<unknown>;
  let auth: {
    user: typeof user;
    restore: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
  };
  const entitlements = vi.fn(async () => ({}));
  beforeEach(() => {
    user.set(null);
    logoutResult = new Subject();
    auth = {
      user,
      restore: vi.fn(() => of(user())),
      logout: vi.fn(() => logoutResult.asObservable()),
    };
    entitlements.mockClear();
    TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          ...[
            '',
            'planos',
            'seguranca',
            'conta',
            'login',
            ...HOME_TOOLS.map((tool) => tool.route.slice(1)),
          ].map((path) => ({ path, component: Destination })),
          { path: 'redirect', redirectTo: 'planos', pathMatch: 'full' },
        ]),
        { provide: AuthService, useValue: auth },
        {
          provide: AnalyticsService,
          useValue: { initialize: vi.fn(), preferences: signal(false) },
        },
        { provide: QuotationGenerationApi, useValue: { entitlements } },
        {
          provide: LAUNCH_CONFIG,
          useValue: {
            origin: 'https://feitoo.example',
            contact: '',
            responsible: '',
            ga4Id: '',
            analyticsEnabled: false,
            ttlMinutes: 120,
            quotationEnabled: true,
          },
        },
      ],
    });
  });
  afterEach(() => TestBed.inject(HttpTestingController).verify());
  async function render() {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    for (const request of TestBed.inject(HttpTestingController).match(
      'http://localhost:8000/api/health',
    ))
      request.flush({ status: 'ok', service: 'feitoo-api' });
    await fixture.whenStable();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const button = (selector: string) => element.querySelector<HTMLButtonElement>(selector)!;
    const click = (selector: string) => {
      button(selector).click();
      fixture.detectChanges();
    };
    const escape = () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      fixture.detectChanges();
    };
    return {
      fixture,
      element,
      button,
      click,
      escape,
      app: fixture.componentInstance,
      router: TestBed.inject(Router),
    };
  }
  it('opens tools with synchronized ARIA and the enabled categorized catalog', async () => {
    const { element, button, click } = await render();
    expect(button('[data-nav-trigger="tools"]').getAttribute('aria-expanded')).toBe('false');
    click('[data-nav-trigger="tools"]');
    expect(button('[data-nav-trigger="tools"]').getAttribute('aria-expanded')).toBe('true');
    expect(element.querySelector<HTMLElement>('#tools-dropdown')!.hidden).toBe(false);
    expect(
      [...element.querySelectorAll('.tool-group a')].map((a) => a.getAttribute('href')),
    ).toEqual(HOME_TOOLS.map((tool) => tool.route));
    expect(element.querySelector('a.catalog-link')?.getAttribute('href')).toBe('/#ferramentas');
    expect(element.querySelector('[role="menu"]')).toBeNull();
  });
  it('preserves internal clicks and closes tools on outside click without fighting the trigger', async () => {
    const { fixture, button, click, element } = await render();
    click('[data-nav-trigger="tools"]');
    element
      .querySelector('.tool-group h2')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    expect(button('[data-nav-trigger="tools"]').getAttribute('aria-expanded')).toBe('true');
    element.querySelector('main')!.click();
    fixture.detectChanges();
    expect(button('[data-nav-trigger="tools"]').getAttribute('aria-expanded')).toBe('false');
    click('[data-nav-trigger="tools"]');
    click('[data-nav-trigger="tools"]');
    expect(button('[data-nav-trigger="tools"]').getAttribute('aria-expanded')).toBe('false');
  });
  it('opens account for an authenticated visitor and closes it on outside click', async () => {
    user.set(person);
    const { fixture, element, button, click } = await render();
    click('[data-nav-trigger="account"]');
    expect(element.querySelector<HTMLElement>('#account-dropdown')!.hidden).toBe(false);
    expect(element.querySelector('.account-user')?.textContent).toBe(person.name);
    expect(element.querySelector('#account-dropdown')?.textContent).not.toContain(person.email);
    element
      .querySelector('.account-user')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    expect(button('[data-nav-trigger="account"]').getAttribute('aria-expanded')).toBe('true');
    element.querySelector('main')!.click();
    fixture.detectChanges();
    expect(button('[data-nav-trigger="account"]').getAttribute('aria-expanded')).toBe('false');
  });
  it('coordinates tools, account and the existing credits popover', async () => {
    user.set(person);
    const { app, click, element } = await render();
    click('[data-nav-trigger="tools"]');
    expect(app.dropdown()).toBe('tools');
    click('[data-nav-trigger="account"]');
    expect(app.dropdown()).toBe('account');
    expect(element.querySelector<HTMLElement>('#tools-dropdown')!.hidden).toBe(true);
    click('[data-nav-trigger="credits"]');
    expect(app.dropdown()).toBe('credits');
    expect(element.querySelector<HTMLElement>('#account-dropdown')!.hidden).toBe(true);
    click('[data-nav-trigger="tools"]');
    expect(app.dropdown()).toBe('tools');
    expect(element.querySelector<HTMLElement>('#credit-popover')!.hidden).toBe(true);
    expect(entitlements).toHaveBeenCalledTimes(1);
  });
  it('closes menus on selecting a tool and on a completed plans navigation or redirect', async () => {
    const { fixture, app, click, router, element } = await render();
    click('[data-nav-trigger="tools"]');
    element.querySelector<HTMLAnchorElement>('.tool-group a')!.click();
    await fixture.whenStable();
    expect(router.url).toBe(HOME_TOOLS[0].route);
    expect(app.dropdown()).toBeNull();
    click('[data-nav-trigger="tools"]');
    element.querySelector<HTMLAnchorElement>('#primary-nav > a[href="/planos"]')!.click();
    await fixture.whenStable();
    expect(router.url).toBe('/planos');
    expect(app.dropdown()).toBeNull();
    click('[data-nav-trigger="tools"]');
    await router.navigateByUrl('/redirect');
    expect(app.dropdown()).toBeNull();
    expect(app.mobileMenuOpen()).toBe(false);
  });
  it('closes on account navigation', async () => {
    user.set(person);
    const { fixture, click, app, element, router } = await render();
    click('[data-nav-trigger="account"]');
    element.querySelector<HTMLAnchorElement>('#account-dropdown a')!.click();
    await fixture.whenStable();
    expect(router.url).toBe('/conta');
    expect(app.dropdown()).toBeNull();
  });
  it.each(['tools', 'account', 'credits'] as const)(
    'Escape closes %s and restores focus to its trigger',
    async (menu) => {
      user.set(person);
      const { click, escape, button, app } = await render();
      click(`[data-nav-trigger="${menu}"]`);
      escape();
      expect(app.dropdown()).toBeNull();
      expect(document.activeElement).toBe(button(`[data-nav-trigger="${menu}"]`));
    },
  );
  it('coordinates mobile state and closes the entire mobile navigation with Escape', async () => {
    user.set(person);
    const { click, escape, app, button } = await render();
    click('[data-nav-trigger="account"]');
    click('.mobile-menu-toggle');
    expect(app.dropdown()).toBeNull();
    expect(app.mobileMenuOpen()).toBe(true);
    click('[data-nav-trigger="tools"]');
    escape();
    expect(app.dropdown()).toBeNull();
    expect(app.mobileMenuOpen()).toBe(false);
    expect(document.activeElement).toBe(button('.mobile-menu-toggle'));
    click('.mobile-menu-toggle');
    click('.mobile-menu-toggle');
    expect(app.mobileMenuOpen()).toBe(false);
    click('.mobile-menu-toggle');
    click('[data-nav-trigger="account"]');
    expect(app.mobileMenuOpen()).toBe(false);
    expect(app.dropdown()).toBe('account');
  });
  it('closes mobile on outside click, focus leaving and selecting a destination', async () => {
    const { click, app, fixture, element, router } = await render();
    click('.mobile-menu-toggle');
    element.querySelector('main')!.click();
    fixture.detectChanges();
    expect(app.mobileMenuOpen()).toBe(false);
    click('.mobile-menu-toggle');
    element.querySelector<HTMLElement>('main')!.focus();
    fixture.detectChanges();
    expect(app.mobileMenuOpen()).toBe(false);
    click('.mobile-menu-toggle');
    click('[data-nav-trigger="tools"]');
    element.querySelector<HTMLAnchorElement>('.tool-group a')!.click();
    await fixture.whenStable();
    expect(router.url).toBe(HOME_TOOLS[0].route);
    expect(app.mobileMenuOpen()).toBe(false);
    expect(app.dropdown()).toBeNull();
  });
  it('closes stale menus when session identity changes or expires', async () => {
    user.set(person);
    const { click, app, fixture, element } = await render();
    click('[data-nav-trigger="account"]');
    user.set({ ...person, id: 2, name: 'Outra Pessoa' });
    await fixture.whenStable();
    expect(app.dropdown()).toBeNull();
    click('[data-nav-trigger="account"]');
    user.set(null);
    await fixture.whenStable();
    expect(app.dropdown()).toBeNull();
    expect(element.querySelector('.account-menu')).toBeNull();
    expect(element.querySelector('.account-link')).not.toBeNull();
  });
  it('preserves anonymous login returnTo and omits authenticated controls', async () => {
    const { router, fixture, element } = await render();
    await router.navigateByUrl('/docx-para-pdf?ignored=value');
    await fixture.whenStable();
    expect(element.querySelector('.account-link')?.getAttribute('href')).toBe(
      '/login?returnTo=%2Fdocx-para-pdf',
    );
    expect(element.querySelector('.account-menu')).toBeNull();
    expect(element.querySelector('app-navbar-credits')).toBeNull();
  });
  it('hides credits when the launch flag is disabled without fetching balances', async () => {
    TestBed.overrideProvider(LAUNCH_CONFIG, { useValue: { origin: '', quotationEnabled: false } });
    user.set(person);
    expect((await render()).element.querySelector('app-navbar-credits')).toBeNull();
    expect(entitlements).not.toHaveBeenCalled();
  });
  it('preserves logout loading, prevents duplicate submissions and displays failures', async () => {
    user.set(person);
    const { click, app, button, element, fixture } = await render();
    click('[data-nav-trigger="account"]');
    click('.logout-button');
    expect(app.loggingOut()).toBe(true);
    expect(button('.logout-button').disabled).toBe(true);
    expect(button('.logout-button').textContent).toContain('Saindo');
    app.logout();
    expect(auth.logout).toHaveBeenCalledTimes(1);
    logoutResult.error(new Error('Offline'));
    await fixture.whenStable();
    expect(app.loggingOut()).toBe(false);
    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'Não foi possível encerrar',
    );
  });
  it('closes menus and navigates to login after a successful logout', async () => {
    user.set(person);
    const { click, app, router, fixture } = await render();
    click('[data-nav-trigger="account"]');
    click('.logout-button');
    user.set(null);
    logoutResult.next({});
    logoutResult.complete();
    await fixture.whenStable();
    expect(app.loggingOut()).toBe(false);
    expect(app.dropdown()).toBeNull();
    expect(router.url).toBe('/login');
  });
  it('renders a closed anonymous shell on the server without restoring a browser session', async () => {
    TestBed.overrideProvider(PLATFORM_ID, { useValue: 'server' });
    const { element, app } = await render();
    expect(auth.restore).not.toHaveBeenCalled();
    expect(app.dropdown()).toBeNull();
    expect(app.mobileMenuOpen()).toBe(false);
    expect(element.querySelector<HTMLElement>('#tools-dropdown')!.hidden).toBe(true);
    expect(element.querySelector('.skip-link')?.getAttribute('href')).toBe('#main-content');
  });
});
