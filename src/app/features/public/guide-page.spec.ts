import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { guidePages } from '../../core/guide-pages';
import { LAUNCH_CONFIG } from '../../core/launch-config';
import { SeoService } from '../../core/seo.service';

describe('Guias públicos do Feitoo', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        { provide: LAUNCH_CONFIG, useValue: { origin: 'https://feitoo.com.br' } },
      ],
    }),
  );

  it('renderiza os dois guias em navegação SPA, com links, índice e schema corretos', async () => {
    const harness = await RouterTestingHarness.create();
    const seo = TestBed.inject(SeoService);
    seo.start();
    for (const [path, guide] of Object.entries(guidePages)) {
      await harness.navigateByUrl(path);
      const element = harness.routeNativeElement!;
      expect(element.querySelectorAll('h1')).toHaveLength(1);
      expect(element.querySelector('h1')?.textContent?.trim()).toBe(guide.headline);
      expect(element.querySelectorAll('h2')).toHaveLength(9);
      for (const target of ['/xml-para-excel', '/produtos-dos-xmls', '/seguranca', '/planos'])
        expect(element.querySelector(`a[href="${target}"]`)).not.toBeNull();
      expect(element.querySelectorAll(`a.btn[href="${guide.toolPath}"]`)).toHaveLength(1);
      for (const link of element.querySelectorAll('.guide-index a')) {
        const target = new URL(link.getAttribute('href')!, 'https://feitoo.com.br');
        expect(target.pathname).toBe(path);
        expect(element.querySelector(target.hash)).not.toBeNull();
      }
      element.querySelector<HTMLAnchorElement>('.guide-index a')!.click();
      await harness.fixture.whenStable();
      expect(TestBed.inject(Router).url).toBe(path + '#passo-a-passo');
      expect(element.textContent).not.toContain('100% seguro');
      expect(document.title).toBe(guide.title);
      expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(
        guide.description,
      );
      expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
        'https://feitoo.com.br' + path,
      );
      expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
        'index,follow',
      );
      expect(document.querySelector('meta[property="og:image"]')?.getAttribute('content')).toBe(
        'https://feitoo.com.br/og/feitoo-og.png',
      );
      expect(document.querySelector('meta[name="twitter:image"]')?.getAttribute('content')).toBe(
        'https://feitoo.com.br/og/feitoo-og.png',
      );
      expect(document.querySelectorAll('#feitoo-schema')).toHaveLength(1);
      const graph = JSON.parse(document.getElementById('feitoo-schema')!.textContent!)['@graph'];
      expect(graph.map((node: { '@type': string }) => node['@type'])).toEqual([
        'Article',
        'BreadcrumbList',
      ]);
      expect(graph[0]).toMatchObject({
        headline: guide.headline,
        description: guide.description,
        mainEntityOfPage: 'https://feitoo.com.br' + path,
        publisher: { '@type': 'Organization', name: 'Feitoo' },
      });
      expect(graph[0].author).toBeUndefined();
      expect(graph[0].datePublished).toBeUndefined();
      expect(graph[1].itemListElement.map((item: { item: string }) => item.item)).toEqual([
        'https://feitoo.com.br/',
        'https://feitoo.com.br' + guide.toolPath,
        'https://feitoo.com.br' + path,
      ]);
    }
  });

  it('mantém guias locais noindex e sem canonical ou schema público', async () => {
    TestBed.overrideProvider(LAUNCH_CONFIG, { useValue: { origin: '' } });
    const harness = await RouterTestingHarness.create();
    const seo = TestBed.inject(SeoService);
    seo.start();
    for (const path of Object.keys(guidePages)) {
      await harness.navigateByUrl(path);
      expect(harness.routeNativeElement?.querySelectorAll('h1')).toHaveLength(1);
      expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
        'noindex,follow',
      );
      expect(document.querySelector('link[rel="canonical"]')).toBeNull();
      expect(document.getElementById('feitoo-schema')).toBeNull();
    }
  });
});
