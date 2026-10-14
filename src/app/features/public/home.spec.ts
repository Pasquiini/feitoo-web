import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthService } from '../auth/services/auth.service';
import { HomePage } from './home';

describe('Home presentation', () => {
  const user = signal<object | null>(null);
  beforeEach(() => {
    user.set(null);
    TestBed.configureTestingModule({
      imports: [HomePage],
      providers: [provideRouter([]), { provide: AuthService, useValue: { user } }],
    });
  });
  function render() {
    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }
  it('shows the hero, illustrative result and two distinct tool destinations', () => {
    const { element } = render();
    expect(element.querySelectorAll('h1')).toHaveLength(1);
    expect(element.querySelector('h1')?.textContent).toContain('XML em segundos.');
    expect(element.querySelector('figcaption')?.textContent).toContain('Exemplo ilustrativo');
    const tools = Array.from(element.querySelectorAll('.home-tool-card'));
    expect(tools).toHaveLength(2);
    expect(tools.map((card) => card.querySelector('a')?.getAttribute('href'))).toEqual([
      '/xml-para-excel',
      '/produtos-dos-xmls',
    ]);
    expect(tools[0].textContent).not.toContain('PDF');
    expect(tools[1].textContent).toContain('PDF');
    expect(element.querySelectorAll('.workflow-grid li')).toHaveLength(3);
    expect(element.querySelectorAll('.benefits-grid article')).toHaveLength(4);
  });
  it('shows existing plan limits, security and functional section CTAs', () => {
    const { element } = render();
    const plans = element.querySelector('#planos')!;
    expect(plans.querySelectorAll('.plan-card')).toHaveLength(3);
    for (const text of ['20 XMLs', '50 XMLs', '250 XMLs', '500 XMLs', '24 horas', 'Sem assinatura'])
      expect(plans.textContent).toContain(text);
    expect(element.querySelector('.security-block a')?.getAttribute('href')).toBe('/seguranca');
    expect(element.querySelector('.hero-actions a')?.getAttribute('href')).toBe('/xml-para-excel');
    expect(element.querySelector('.hero-actions a:last-child')?.getAttribute('href')).toBe(
      '/#ferramentas',
    );
    expect(element.querySelector('.final-cta a')?.getAttribute('href')).toBe('/#ferramentas');
    expect(
      element.querySelectorAll('app-home-icon svg[aria-hidden="true"]').length,
    ).toBeGreaterThan(10);
  });
  it('offers login with account return for guests and removes login copy when signed in', () => {
    const { fixture, element } = render();
    expect(element.querySelector('.hero-note')?.textContent).toContain('Entre grátis');
    expect(element.querySelector('.plan-pro a')?.getAttribute('href')).toBe('/conta');
    user.set({ id: 1 });
    fixture.detectChanges();
    expect(element.querySelector('.hero-note')?.textContent).toContain('Escolha a ferramenta');
    expect(element.textContent).not.toContain('Entre grátis');
    expect(element.querySelector('.plan-pro a')?.getAttribute('href')).toBe('/conta');
    expect(element.querySelector('.plan-pro a')?.textContent).toContain('Ver Pro na minha conta');
    expect(element.querySelector('a[href="/cadastro"]')).toBeNull();
  });
  it('navigates the primary tool CTA', async () => {
    const { element } = render();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    element.querySelector<HTMLAnchorElement>('.hero-actions a')!.click();
    expect(navigate).toHaveBeenCalled();
    expect(
      router.serializeUrl(navigate.mock.calls[0][0] as import('@angular/router').UrlTree),
    ).toBe('/xml-para-excel');
  });
});
