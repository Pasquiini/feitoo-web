import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { HomePage } from './home';
import { launch } from '../../../environments/launch.generated';
import { TOOL_PREFERENCES_KEY } from '../../core/tool-preferences.service';

describe('Home tool discovery', () => {
  beforeEach(() => localStorage.removeItem(TOOL_PREFERENCES_KEY));
  afterEach(() => localStorage.removeItem(TOOL_PREFERENCES_KEY));
  beforeEach(() =>
    TestBed.configureTestingModule({ imports: [HomePage], providers: [provideRouter([])] }),
  );
  function render() {
    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }
  it('shows each enabled tool once, grouped by category, with plans and security links', () => {
    const { element } = render();
    expect(element.querySelectorAll('h1')).toHaveLength(1);
    expect(element.querySelector('h1')?.textContent).toBe(
      'Ferramentas simples para resolver tarefas de verdade.',
    );
    expect(element.textContent).toContain('Documentos');
    expect(element.textContent).toContain('XML e Fiscal');
    expect(
      [...element.querySelectorAll('.home-tool-card > a')].map((a) => a.getAttribute('href')),
    ).toEqual([
      '/xml-para-excel',
      '/produtos-dos-xmls',
      '/xml-para-pdf',
      '/organizar-xml',
      '/analisar-xml',
      '/docx-para-pdf',
      ...(launch.quotationEnabled ? ['/gerador-de-orcamentos'] : []),
    ]);
    expect(element.querySelector('.security-block a')?.getAttribute('href')).toBe('/seguranca');
    expect(element.querySelector('.plans-callout a')?.getAttribute('href')).toBe('/planos');
    expect(
      element.querySelector(
        '.hero-transformations, .featured-tools, .workflow, .final-cta, .home-faq, app-home-plans',
      ),
    ).toBeNull();
    expect(!!element.querySelector('app-tool-card a[href="/gerador-de-orcamentos"]')).toBe(
      launch.quotationEnabled,
    );
    expect(element.querySelector('#tool-search')?.getAttribute('aria-controls')).toBe(
      'tool-results',
    );
  });
  it('searches names, descriptions and keywords regardless of accents and case', () => {
    const { fixture, element } = render();
    const input = element.querySelector<HTMLInputElement>('#tool-search')!;
    for (const [query, count] of [
      ['excel', 4],
      ['word', 1],
      ['docx', 1],
      ['pdf', launch.quotationEnabled ? 3 : 2],
      ['orçamento', launch.quotationEnabled ? 1 : 0],
      ['orcamento', launch.quotationEnabled ? 1 : 0],
      ['xml', 5],
      ['produto', launch.quotationEnabled ? 3 : 2],
      ['nota', 5],
      ['nfe', 5],
      ['  CONVERSÃO  ', 1],
      ['produto ncm', 1],
      ['inexistente', 0],
      ['', launch.quotationEnabled ? 7 : 6],
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
  it('clears the search using its accessible button', () => {
    const { fixture, element } = render();
    fixture.componentInstance.query.set('produto');
    fixture.detectChanges();
    element.querySelector<HTMLButtonElement>('button[aria-label="Limpar busca"]')!.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.query()).toBe('');
    expect(element.querySelectorAll('.home-tool-card')).toHaveLength(
      launch.quotationEnabled ? 7 : 6,
    );
  });
  it('clears with Escape and restores categories and the live result count', () => {
    const { fixture, element } = render();
    const input = element.querySelector<HTMLInputElement>('#tool-search')!;
    input.value = 'word';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(element.querySelectorAll('.tool-category')).toHaveLength(1);
    expect(element.querySelector('.tool-category h3')?.textContent).toBe('Documentos');
    expect(element.querySelector('[role="status"]')?.textContent).toContain(
      '1 ferramenta encontrada',
    );
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(input.value).toBe('');
    expect(element.querySelectorAll('.tool-category')).toHaveLength(
      launch.quotationEnabled ? 3 : 2,
    );
    expect(element.querySelector('[role="status"]')?.textContent).toContain(
      'ferramentas disponíveis',
    );
  });
  it('recovers from empty results while keeping useful links available', () => {
    const { fixture, element } = render();
    fixture.componentInstance.query.set('inexistente');
    fixture.detectChanges();
    expect(element.querySelector('[role="status"]')?.textContent).toContain(
      '0 ferramentas encontradas',
    );
    expect(element.querySelector('.security-block a')).not.toBeNull();
    expect(element.querySelector('.plans-callout a')).not.toBeNull();
    element.querySelector<HTMLButtonElement>('.empty-state button')!.click();
    fixture.detectChanges();
    expect(element.querySelector('.empty-state')).toBeNull();
    expect(fixture.componentInstance.query()).toBe('');
  });
  it('toggles favorites from sibling buttons without navigating or duplicating catalog cards', () => {
    const { fixture, element } = render();
    const star = element.querySelector<HTMLButtonElement>('.favorite-toggle')!;
    expect(star.closest('a')).toBeNull();
    expect(star.getAttribute('aria-pressed')).toBe('false');
    expect(element.querySelector('.tool-shortcuts')).toBeNull();
    star.click();
    fixture.detectChanges();
    expect(star.getAttribute('aria-pressed')).toBe('true');
    expect(element.querySelectorAll('.favorites-list a')).toHaveLength(1);
    expect(element.querySelector('.favorites-list a')?.getAttribute('href')).toBe(
      '/xml-para-excel',
    );
    expect(element.querySelectorAll('.home-tool-card')).toHaveLength(
      launch.quotationEnabled ? 7 : 6,
    );
    expect(fixture.componentInstance.preferences.recent()).toEqual([]);
    element.querySelector<HTMLButtonElement>('.favorites-list button')!.click();
    fixture.detectChanges();
    expect(star.getAttribute('aria-pressed')).toBe('false');
    expect(element.querySelector('.favorites-list')).toBeNull();
  });
});
