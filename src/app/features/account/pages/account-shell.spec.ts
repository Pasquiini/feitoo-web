import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { AuthService } from '../../auth/services/auth.service';
import { AccountShell } from './account-shell';

@Component({ template: '<h1>Área da conta</h1>' })
class AreaStub {}

describe('account navigation with return context', () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { user: signal({ id: 1 }) } },
        provideRouter([
          {
            path: 'conta',
            component: AccountShell,
            children: ['', 'assinatura', 'creditos', 'arquivos', 'perfil'].map((path) => ({
              path,
              pathMatch: 'full' as const,
              component: AreaStub,
            })),
          },
        ]),
      ],
    });
  });
  afterEach(() => TestBed.resetTestingModule());
  it.each([
    ['/conta/assinatura?subscription=confirming', '/conta/assinatura'],
    [
      '/conta/creditos?quotation_order=12345678-1234-4234-8234-123456789abc&payment=success',
      '/conta/creditos',
    ],
    ['/conta/perfil?google_error=link_conflict', '/conta/perfil'],
  ])('keeps selected route and aria-current for %s', async (url, path) => {
    const harness = await RouterTestingHarness.create(url);
    await harness.fixture.whenStable();
    expect(
      harness.routeNativeElement
        ?.querySelector('.account-nav [aria-current="page"]')
        ?.getAttribute('href'),
    ).toBe(path);
  });
});
