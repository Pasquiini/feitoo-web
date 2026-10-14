import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../auth/services/auth.service';
import { HomePage } from './home';

describe('Home tool discovery', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      imports: [HomePage],
      providers: [provideRouter([]), { provide: AuthService, useValue: { user: signal(null) } }],
    }),
  );
  function render() {
    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }
  it('renders only real tools, destinations, plans and security', () => {
    const { element } = render();
    expect(element.querySelectorAll('h1')).toHaveLength(1);
    expect(
      Array.from(element.querySelectorAll('.home-tool-card > a')).map((a) =>
        a.getAttribute('href'),
      ),
    ).toEqual(['/xml-para-excel', '/produtos-dos-xmls']);
    expect(element.querySelectorAll('.workflow-grid li')).toHaveLength(3);
    expect(element.querySelectorAll('.plan-card')).toHaveLength(3);
    expect(element.querySelector('.plan-pro')?.textContent).toContain('R$ 29,90');
    expect(element.querySelector('.security-block a')?.getAttribute('href')).toBe('/seguranca');
    expect(element.querySelectorAll('.final-links a')).toHaveLength(2);
  });
  it('filters through the input using names, descriptions and keywords, ignoring accents and case', () => {
    const { fixture, element } = render();
    const input = element.querySelector<HTMLInputElement>('#tool-search')!;
    for (const [query, count] of [
      ['excel', 2],
      ['xml', 2],
      ['produto', 1],
      ['nota', 2],
      ['nfe', 2],
      ['  CONVERSÃO  ', 1],
      ['produto ncm', 1],
      ['inexistente', 0],
      ['', 2],
    ] as const) {
      input.value = query;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(element.querySelectorAll('.home-tool-card')).toHaveLength(count);
      if (!count)
        expect(element.querySelector('.empty-state')?.textContent).toContain(
          'Nenhuma ferramenta encontrada',
        );
    }
  });
  it('clears the search and keeps focus on the visible field', () => {
    const { fixture, element } = render();
    fixture.componentInstance.query.set('produto');
    fixture.detectChanges();
    element.querySelector<HTMLButtonElement>('.search-field button')!.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.query()).toBe('');
    expect(element.querySelectorAll('.home-tool-card')).toHaveLength(2);
  });
});
