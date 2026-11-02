import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { LAUNCH_CONFIG } from './core/launch-config';
import { launch } from '../environments/launch.generated';
import { HOME_TOOLS, TOOL_CATEGORIES } from './features/public/home-tools';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: LAUNCH_CONFIG, useValue: { ...launch, quotationEnabled: false } },
      ],
    }).compileComponents();
  });

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  function respondToHealth(): void {
    TestBed.inject(HttpTestingController)
      .expectOne('http://localhost:8000/api/me')
      .flush(null, { status: 401, statusText: 'Unauthorized' });
    const request = TestBed.inject(HttpTestingController).expectOne(
      'http://localhost:8000/api/health',
    );
    expect(request.request.method).toBe('GET');
    request.flush({ status: 'ok', service: 'feitoo-api' });
  }

  it('shares the complete categorized catalog and restores dropdown keyboard focus', async () => {
    const fixture = TestBed.createComponent(App);
    respondToHealth();
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const menu = element.querySelector<HTMLElement>('.tools-menu')!;
    expect([...menu.querySelectorAll('section h2')].map((h) => h.textContent)).toEqual(
      TOOL_CATEGORIES,
    );
    expect(menu.querySelectorAll('section a')).toHaveLength(HOME_TOOLS.length);
    expect(menu.querySelector('a[href="/docx-para-pdf"]')).not.toBeNull();
    const trigger = menu.querySelector<HTMLButtonElement>('.nav-trigger')!;
    trigger.click();
    fixture.detectChanges();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    respondToHealth();
    expect(app).toBeTruthy();
  });

  it('should render title', async () => {
    const fixture = TestBed.createComponent(App);
    respondToHealth();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.brand')?.textContent).toBe('feitoo.');
    expect(compiled.querySelector('[role="status"]')?.textContent).toBe('API conectada.');
  });

  it('should handle an unavailable API without blocking the screen', async () => {
    const fixture = TestBed.createComponent(App);
    TestBed.inject(HttpTestingController)
      .expectOne('http://localhost:8000/api/me')
      .flush(null, { status: 401, statusText: 'Unauthorized' });
    TestBed.inject(HttpTestingController)
      .expectOne('http://localhost:8000/api/health')
      .flush(null, { status: 503, statusText: 'Service Unavailable' });
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.brand')?.textContent).toBe('feitoo.');
    expect(compiled.querySelector('[role="status"]')?.textContent).toContain('API indisponível');
  });

  it('keeps guest account access, plans and footer destinations', async () => {
    const fixture = TestBed.createComponent(App);
    respondToHealth();
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('#primary-nav a[href="/planos"]')?.textContent).toBe('Planos');
    expect(element.querySelector('.header-account a')?.getAttribute('href')).toBe('/login');
    for (const href of [
      '/xml-para-excel',
      '/produtos-dos-xmls',
      '/planos',
      '/seguranca',
      '/privacidade',
      '/termos',
      '/conta',
    ])
      expect(element.querySelector(`footer a[href="${href}"]`)).not.toBeNull();
  });

  it('toggles the mobile menu and closes it with Escape, restoring focus', async () => {
    const fixture = TestBed.createComponent(App);
    respondToHealth();
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const toggle = element.querySelector<HTMLButtonElement>('.mobile-menu-toggle')!;
    toggle.click();
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(element.querySelector('#primary-nav')?.classList.contains('is-open')).toBe(true);
    element
      .querySelector('#primary-nav')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    fixture.detectChanges();
    element.querySelector<HTMLAnchorElement>('#primary-nav a')!.click();
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('shows the account menu and direct account footer link after session restoration', async () => {
    const fixture = TestBed.createComponent(App);
    TestBed.inject(HttpTestingController)
      .expectOne('http://localhost:8000/api/me')
      .flush({
        data: {
          id: 1,
          name: 'Pessoa Teste',
          email: 'synthetic@example.test',
          google_linked: false,
          has_password: true,
          created_at: '2026-10-14',
        },
      });
    TestBed.inject(HttpTestingController)
      .expectOne('http://localhost:8000/api/health')
      .flush({ status: 'ok', service: 'feitoo-api' });
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.account-name')?.textContent).toBe('Minha conta');
    expect(element.querySelector('.account-menu a')?.getAttribute('href')).toBe('/conta');
    expect(element.querySelector('.account-link')).toBeNull();
    expect(element.querySelector('footer a[href="/conta"]')).not.toBeNull();
    TestBed.inject(HttpTestingController).expectNone(
      'http://localhost:8000/api/quotations/entitlements',
    );
    expect(element.querySelector('app-navbar-credits')).toBeNull();
  });
});
