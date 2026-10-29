import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { environment } from '../../../../environments/environment';
import { AuthPage } from './auth-page';

describe('AuthPage', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'login', component: AuthPage, data: { mode: 'login' } },
          { path: 'cadastro', component: AuthPage, data: { mode: 'register' } },
          { path: '', children: [] },
        ]),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('keeps the quotation return route through login, registration and Google failure', async () => {
    const harness = await RouterTestingHarness.create(
      '/login?returnTo=%2Fgerador-de-orcamentos&google_error=invalid_google',
    );
    expect(harness.routeNativeElement?.textContent).toContain('orçamento');
    expect(harness.routeNativeElement?.querySelector('.auth-back')?.getAttribute('href')).toBe(
      '/gerador-de-orcamentos',
    );
    expect(
      harness.routeNativeElement?.querySelector('.auth-switch a')?.getAttribute('href'),
    ).toContain('returnTo=%2Fgerador-de-orcamentos');
    const page = await harness.navigateByUrl(
      '/cadastro?returnTo=%2Fgerador-de-orcamentos',
      AuthPage,
    );
    page.google();
    http.expectOne(environment.csrfUrl).flush(null);
    const request = http.expectOne(`${environment.apiUrl}/auth/google/start`);
    expect(request.request.body.return_to).toBe('/gerador-de-orcamentos');
    request.flush({}, { status: 503, statusText: 'Unavailable' });
    expect(page.returnTo).toBe('/gerador-de-orcamentos');
    expect(page.error()).toContain('indisponível');
  });

  it('rejects quotation return destinations containing personal query parameters', async () => {
    const harness = await RouterTestingHarness.create(
      '/login?returnTo=%2Fgerador-de-orcamentos%3Fname%3Dprivate',
    );
    expect(harness.routeNativeElement?.querySelector('.auth-back')?.getAttribute('href')).toBe('/');
  });

  it('renders a minimal login form and Google button', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/login', AuthPage);
    expect(harness.routeNativeElement?.textContent).toContain('Continuar com Google');
    expect(harness.routeNativeElement?.querySelector('#name')).toBeNull();
  });

  it('rejects mismatched confirmation locally without sending credentials', async () => {
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl('/cadastro', AuthPage);
    page.form.setValue({
      name: 'Maria',
      email: 'maria@example.com',
      password: 'a-strong-password',
      password_confirmation: 'different-password',
    });
    page.submit();
    expect(page.error()).toBe('As senhas precisam ser iguais.');
    http.expectNone(environment.csrfUrl);
  });

  it('shows invalid login feedback and retains no authenticated user', async () => {
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl('/login', AuthPage);
    page.form.patchValue({ email: 'maria@example.com', password: 'wrong' });
    page.submit();
    http.expectOne(environment.csrfUrl).flush(null);
    http
      .expectOne(`${environment.apiUrl}/auth/login`)
      .flush({}, { status: 422, statusText: 'Unprocessable' });
    expect(page.error()).toBe('E-mail ou senha inválidos.');
    expect(page.busy()).toBe(false);
  });

  it('explains how to safely link an existing password account', async () => {
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl('/login?google_error=account_exists', AuthPage);
    expect(page.error()).toContain('Entre com sua senha');
  });

  it('preserves safe tool context in copy and navigation', async () => {
    const harness = await RouterTestingHarness.create('/login?returnTo=/xml-para-excel');
    expect(harness.routeNativeElement?.textContent).toContain(
      'continuar seu processamento de XMLs',
    );
    expect(harness.routeNativeElement?.querySelector('.auth-back')?.getAttribute('href')).toBe(
      '/xml-para-excel',
    );
    expect(
      harness.routeNativeElement?.querySelector('.auth-switch a')?.getAttribute('href'),
    ).toContain('returnTo=%2Fxml-para-excel');
  });

  it('ignores arbitrary return destinations', async () => {
    const harness = await RouterTestingHarness.create('/login?returnTo=https://outside.example');
    expect(harness.routeNativeElement?.querySelector('.auth-back')?.getAttribute('href')).toBe('/');
  });

  it('preserves account context in login copy and registration link', async () => {
    const harness = await RouterTestingHarness.create('/login?returnTo=/conta');
    expect(harness.routeNativeElement?.textContent).toContain('Entre para acessar sua conta.');
    expect(harness.routeNativeElement?.querySelector('.auth-back')?.getAttribute('href')).toBe(
      '/conta',
    );
    expect(
      harness.routeNativeElement?.querySelector('.auth-switch a')?.getAttribute('href'),
    ).toContain('returnTo=%2Fconta');
  });
  it.each(['/conta/assinatura', '/conta/creditos', '/conta/arquivos', '/conta/perfil'])(
    'preserves the safe account destination %s',
    async (path) => {
      const harness = await RouterTestingHarness.create(
        '/login?returnTo=' + encodeURIComponent(path) + '&session=expired',
      );
      expect(harness.routeNativeElement?.textContent).toContain('Sua sessão expirou');
      expect(harness.routeNativeElement?.textContent).toContain('Entre para acessar sua conta');
      expect(harness.routeNativeElement?.querySelector('.auth-back')?.getAttribute('href')).toBe(
        path,
      );
      http.expectNone(environment.csrfUrl);
    },
  );

  it('toggles password visibility without changing its value or submitting', async () => {
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl('/login', AuthPage);
    page.form.controls.password.setValue('synthetic-password');
    const button = harness.routeNativeElement?.querySelector(
      '.password-toggle',
    ) as HTMLButtonElement;
    button.click();
    harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('#password')?.getAttribute('type')).toBe(
      'text',
    );
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(page.form.controls.password.value).toBe('synthetic-password');
    button.click();
    harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('#password')?.getAttribute('type')).toBe(
      'password',
    );
    http.expectNone(environment.csrfUrl);
  });

  it('shows accessible errors under fields after invalid submission', async () => {
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl('/login', AuthPage);
    page.form.controls.email.setValue('invalid');
    page.submit();
    harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('#email-error')?.textContent).toContain(
      'e-mail válido',
    );
    expect(harness.routeNativeElement?.querySelector('#email')?.getAttribute('aria-invalid')).toBe(
      'true',
    );
    expect(harness.routeNativeElement?.querySelector('#password-error')?.textContent).toBe(
      'Informe sua senha.',
    );
    http.expectNone(environment.csrfUrl);
  });

  it('provides contextual loading and disables the form during login', async () => {
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl('/login', AuthPage);
    page.form.patchValue({ email: 'synthetic@example.test', password: 'synthetic-password' });
    page.submit();
    harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('.auth-submit')?.textContent).toContain(
      'Entrando',
    );
    expect(
      (harness.routeNativeElement?.querySelector('fieldset') as HTMLFieldSetElement).disabled,
    ).toBe(true);
    expect(
      (harness.routeNativeElement?.querySelector('.btn-google') as HTMLButtonElement).disabled,
    ).toBe(true);
    http.expectOne(environment.csrfUrl).flush(null);
    http
      .expectOne(`${environment.apiUrl}/auth/login`)
      .flush({}, { status: 503, statusText: 'Unavailable' });
    harness.detectChanges();
    expect(page.busy()).toBe(false);
    expect(harness.routeNativeElement?.querySelector('[role="alert"]')?.textContent).toContain(
      'Verifique a conexão',
    );
  });

  it('registration retains existing fields and password rules', async () => {
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl('/cadastro', AuthPage);
    page.form.patchValue({
      name: 'Pessoa Teste',
      email: 'synthetic@example.test',
      password: 'short',
      password_confirmation: 'short',
    });
    page.submit();
    harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('#password-error')?.textContent).toContain(
      '12 caracteres',
    );
    expect(
      harness.routeNativeElement?.querySelector('#confirmation')?.getAttribute('autocomplete'),
    ).toBe('new-password');
    expect(harness.routeNativeElement?.querySelectorAll('input').length).toBe(4);
    http.expectNone(environment.csrfUrl);
  });
});
