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
    expect(element.querySelector('h1')?.textContent).toBe(
      'Ferramentas online para arquivos, documentos e planilhas.',
    );
    expect(element.querySelectorAll('.quick-links a')).toHaveLength(3);
    expect(element.textContent).toContain('Documentos');
    expect(element.textContent).toContain('XML e Fiscal');
    expect(
      Array.from(element.querySelectorAll('.home-tool-card > a')).map((a) =>
        a.getAttribute('href'),
      ),
    ).toEqual([
      '/xml-para-excel',
      '/produtos-dos-xmls',
      '/xml-para-pdf',
      '/organizar-xml',
      '/analisar-xml',
      '/docx-para-pdf',
      '/gerador-de-orcamentos',
    ]);
    expect(element.querySelectorAll('.workflow-grid li')).toHaveLength(3);
    expect(element.querySelectorAll('.plan-card')).toHaveLength(3);
    expect(element.querySelector('.plan-pro')?.textContent).toContain('R$ 29,90');
    expect(element.querySelector('.security-block a')?.getAttribute('href')).toBe('/seguranca');
    expect(element.querySelectorAll('.final-links a')).toHaveLength(2);
    const quotation = element.querySelector('app-tool-card a[href="/gerador-de-orcamentos"]');
    expect(quotation?.textContent).toContain('Grátis para começar');
    expect(quotation?.textContent).toContain('Criar orçamento');
  });
  it('filters through the input using names, descriptions and keywords, ignoring accents and case', () => {
    const { fixture, element } = render();
    const input = element.querySelector<HTMLInputElement>('#tool-search')!;
    for (const [query, count] of [
      ['excel', 4],
      ['word', 1],
      ['docx', 1],
      ['pdf', 3],
      ['orçamento', 1],
      ['orcamento', 1],
      ['xml', 5],
      ['produto', 3],
      ['nota', 5],
      ['nfe', 5],
      ['  CONVERSÃO  ', 1],
      ['produto ncm', 1],
      ['inexistente', 0],
      ['', 7],
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
    expect(element.querySelectorAll('.home-tool-card')).toHaveLength(7);
  });
});
