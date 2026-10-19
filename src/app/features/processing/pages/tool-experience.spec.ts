import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  ToolHero,
  ToolStatus,
  ToolUploader,
  ToolWorkspace,
  ToolVisualState,
  ToolRelated,
} from './tool-experience';

describe('Tool experience presentation', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([])] }));

  it.each([
    ['uploading', 'Enviando'],
    ['queued', 'Na fila'],
    ['processing', 'Em processamento'],
    ['partial', 'Conclusão parcial'],
    ['completed', 'Concluído'],
    ['failed', 'Não concluído'],
    ['expired', 'Indisponível'],
    ['error', 'Atenção ao processamento'],
  ])('announces %s with a textual state and an honest description', (state, label) => {
    const fixture = TestBed.createComponent(ToolStatus);
    fixture.componentRef.setInput('state', state as ToolVisualState);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[role=status]')?.textContent).toContain(label);
    expect(element.querySelector('h2')?.textContent?.trim().length).toBeGreaterThan(5);
    expect(element.querySelector('progress')).toBeNull();
    expect(element.querySelector('[aria-live=polite]')).not.toBeNull();
  });

  it('uses catalog tags without changing the SEO heading', () => {
    const fixture = TestBed.createComponent(ToolHero);
    fixture.componentRef.setInput('path', '/docx-para-pdf');
    fixture.componentRef.setInput('title', 'Converter DOCX para PDF online');
    fixture.componentRef.setInput('subtitle', 'Documentos em PDF.');
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('h1')).toHaveLength(1);
    expect(element.querySelector('h1')?.textContent).toBe('Converter DOCX para PDF online');
    expect(element.querySelectorAll('.tool-hero-tags li')).toHaveLength(3);
  });

  it('updates the uploader selection without claiming a new plan limit', () => {
    const fixture = TestBed.createComponent(ToolUploader);
    fixture.componentRef.setInput('format', 'DOCX');
    fixture.componentRef.setInput('count', 2);
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('2 arquivos na seleção');
    expect(fixture.nativeElement.classList.contains('uploader-disabled')).toBe(true);
    fixture.componentRef.setInput('count', 0);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Comece pelos arquivos');
  });

  it('shows the real workspace count and excludes the current tool from related links', () => {
    const fixture = TestBed.createComponent(ToolWorkspace);
    fixture.componentRef.setInput('name', 'XML para Excel');
    fixture.componentRef.setInput('count', 3);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('3 arquivos');
    const related = TestBed.createComponent(ToolRelated);
    related.componentRef.setInput('path', '/xml-para-excel');
    related.detectChanges();
    expect(related.nativeElement.querySelector('a[href="/xml-para-excel"]')).toBeNull();
    expect(related.nativeElement.querySelectorAll('a')).toHaveLength(3);
  });
});
