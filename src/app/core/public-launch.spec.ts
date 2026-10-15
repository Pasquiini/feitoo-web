import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { RouterTestingHarness } from '@angular/router/testing';
import { Title } from '@angular/platform-browser';
import { AnalyticsService, EventProperties } from './analytics.service';
import { LAUNCH_CONFIG, LaunchConfig } from './launch-config';
import { SeoService } from './seo.service';
import { routes } from '../app.routes';
import { publicPages } from './public-pages';

const config: LaunchConfig = {
  origin: 'https://feitoo.example',
  contact: '',
  responsible: '',
  ga4Id: 'G-TEST123',
  analyticsEnabled: true,
  ttlMinutes: 120,
};
describe('Public launch', () => {
  beforeEach(() => {
    localStorage.clear();
    delete (window as Window & { gtag?: unknown }).gtag;
    document.getElementById('feitoo-ga4')?.remove();
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: LAUNCH_CONFIG, useValue: config },
      ],
    });
  });
  afterEach(() => {
    document.getElementById('feitoo-ga4')?.remove();
    localStorage.clear();
  });
  it('não carrega nem envia analytics antes do consentimento', () => {
    const analytics = TestBed.inject(AnalyticsService);
    analytics.initialize();
    analytics.track('tool_view', { tool: 'xml-to-excel' });
    expect(document.getElementById('feitoo-ga4')).toBeNull();
    expect(analytics.choice()).toBe('unknown');
  });
  it('recusa opcionais sem carregar script', () => {
    const analytics = TestBed.inject(AnalyticsService);
    analytics.choose('denied');
    analytics.track('tool_view');
    expect(document.getElementById('feitoo-ga4')).toBeNull();
    expect(JSON.parse(localStorage.getItem('feitoo-consent-v1')!).choice).toBe('denied');
  });
  it('aceita, carrega uma vez e revoga envio e cookies', () => {
    const analytics = TestBed.inject(AnalyticsService);
    analytics.choose('granted');
    analytics.choose('granted');
    expect(document.querySelectorAll('#feitoo-ga4').length).toBe(1);
    const view = window as unknown as { dataLayer: unknown[][] };
    analytics.track('tool_view');
    const before = view.dataLayer.length;
    document.cookie = '_ga=test; path=/';
    analytics.choose('denied');
    analytics.track('download_clicked');
    expect(view.dataLayer.length).toBe(before);
    expect(document.cookie).not.toContain('_ga=');
    expect(document.getElementById('feitoo-ga4')).toBeNull();
  });
  it('não envia propriedades extras ou buckets com conteúdo sensível', async () => {
    await TestBed.inject(Router).navigateByUrl('/xml-para-excel?email=secret@example.test');
    const analytics = TestBed.inject(AnalyticsService);
    analytics.choose('granted');
    const unsafe = {
      tool: 'xml-to-excel',
      files_count: 2,
      total_size_bucket: 'sensitive.xml',
      email: 'secret@example.test',
      processing_uuid: '123',
      storage_path: '/private',
      access_key: '44digits',
      original_name: 'sensitive.xml',
    } as EventProperties;
    analytics.track('processing_started', unsafe);
    const entries = (window as unknown as { dataLayer: unknown[][] }).dataLayer;
    const payload = JSON.stringify(entries.at(-1));
    expect(payload).toContain('processing_started');
    for (const secret of [
      'secret@example.test',
      'sensitive.xml',
      '/private',
      '44digits',
      'processing_uuid',
      '?email',
    ])
      expect(payload).not.toContain(secret);
  });
  it('analytics desabilitado permanece inerte mesmo com aceitação', () => {
    TestBed.overrideProvider(LAUNCH_CONFIG, { useValue: { ...config, analyticsEnabled: false } });
    const analytics = TestBed.inject(AnalyticsService);
    analytics.initialize();
    analytics.choose('granted');
    analytics.track('tool_view');
    expect(document.getElementById('feitoo-ga4')).toBeNull();
  });
  it('monetization analytics uses consent and only safe purchase properties', () => {
    const analytics = TestBed.inject(AnalyticsService);
    analytics.choose('granted');
    analytics.track('single_purchase_completed', {
      tool: 'xml-to-excel',
      package_code: 'xml_250',
      amount: 690,
      currency: 'brl',
      files_count_bucket: '101_to_250',
      processing_uuid: 'private-processing',
      email: 'private@example.test',
    } as EventProperties);
    const entries = (window as unknown as { dataLayer: unknown[][] }).dataLayer;
    const payload = JSON.stringify(entries.at(-1));
    expect(payload).toContain('single_purchase_completed');
    expect(payload).not.toContain('xml_250');
    expect(payload).not.toContain('690');
    expect(payload).not.toContain('private-processing');
    expect(payload).not.toContain('private@example.test');
    analytics.choose('denied');
    const count = entries.length;
    analytics.track('single_purchase_started', { package_code: 'xml_100' });
    expect(entries.length).toBe(count);
  });
  it('sem Measurement ID não carrega GA4', () => {
    TestBed.overrideProvider(LAUNCH_CONFIG, { useValue: { ...config, ga4Id: '' } });
    const analytics = TestBed.inject(AnalyticsService);
    analytics.choose('granted');
    expect(analytics.enabled).toBe(false);
    expect(document.getElementById('feitoo-ga4')).toBeNull();
  });
  it('metadata e canonical próprios para todas as páginas públicas', () => {
    const seo = TestBed.inject(SeoService);
    for (const [path, page] of Object.entries(publicPages)) {
      seo.apply(path + '?ignored=private');
      expect(TestBed.inject(Title).getTitle()).toBe(page.title);
      expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(
        page.description,
      );
      expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
        config.origin + path,
      );
      expect(document.querySelector('meta[property="og:url"]')?.getAttribute('content')).toBe(
        config.origin + path,
      );
    }
  });
  it('auth e 404 são noindex e não mantêm canonical de outra página', () => {
    const seo = TestBed.inject(SeoService);
    seo.apply('/xml-para-excel');
    seo.apply('/inexistente/private-id');
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
      'noindex,follow',
    );
    expect(document.querySelector('link[rel="canonical"]')).toBeNull();
    expect(document.getElementById('feitoo-schema')).toBeNull();
    seo.apply('/login');
    expect(TestBed.inject(Title).getTitle()).toBe('Sua conta | Feitoo');
  });
  it('aplica imagem OG e Twitter sem duplicar tags nas sete páginas públicas', () => {
    const seo = TestBed.inject(SeoService);
    for (const path of Object.keys(publicPages)) {
      seo.apply(path);
      seo.apply(path + '?source=test');
      for (const [selector, expected] of [
        ['meta[property="og:image"]', config.origin + '/og/feitoo-og.png'],
        ['meta[property="og:image:width"]', '1200'],
        ['meta[property="og:image:height"]', '630'],
        ['meta[name="twitter:image"]', config.origin + '/og/feitoo-og.png'],
        ['meta[name="twitter:card"]', 'summary_large_image'],
      ]) {
        expect(document.querySelectorAll(selector)).toHaveLength(1);
        expect(document.querySelector(selector)?.getAttribute('content')).toBe(expected);
      }
    }
    seo.apply('/login');
    expect(document.querySelector('meta[property="og:image"]')).toBeNull();
    expect(document.querySelector('meta[name="twitter:image"]')).toBeNull();
  });
  it('normaliza barra e query e substitui schema ao navegar entre ferramentas', () => {
    const seo = TestBed.inject(SeoService);
    for (const path of ['/xml-para-excel', '/produtos-dos-xmls'] as const) {
      seo.apply(path + '/?origem=teste');
      expect(document.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
      expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
        config.origin + path,
      );
      expect(document.querySelectorAll('#feitoo-schema')).toHaveLength(1);
      const graph = JSON.parse(document.getElementById('feitoo-schema')!.textContent!)['@graph'];
      expect(graph.map((node: { '@type': string }) => node['@type'])).toEqual([
        'WebApplication',
        'BreadcrumbList',
        'FAQPage',
      ]);
      expect(graph[1].itemListElement[1].item).toBe(config.origin + path);
      expect(document.querySelector('meta[name="twitter:title"]')?.getAttribute('content')).toBe(
        publicPages[path].title,
      );
    }
    seo.apply('/');
    const graph = JSON.parse(document.getElementById('feitoo-schema')!.textContent!)['@graph'];
    expect(graph.map((node: { '@type': string }) => node['@type'])).toEqual(['WebSite']);
  });
  it('build sem domínio não inventa canonical ou indexação', () => {
    TestBed.overrideProvider(LAUNCH_CONFIG, { useValue: { ...config, origin: '' } });
    TestBed.inject(SeoService).apply('/');
    expect(document.querySelector('link[rel="canonical"]')).toBeNull();
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
      'noindex,follow',
    );
  });
  it('home mostra as três ferramentas e navegação funcional', async () => {
    const harness = await RouterTestingHarness.create('/');
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toContain(
      'Ferramentas online para XML, planilhas e arquivos.',
    );
    expect(harness.routeNativeElement?.querySelectorAll('.home-tool-card').length).toBe(5);
    expect(harness.routeNativeElement?.querySelector('a')?.getAttribute('href')).toBe(
      '/xml-para-excel',
    );
  });
  it('segurança comunica retenção, exclusão e limites das garantias', async () => {
    const harness = await RouterTestingHarness.create('/seguranca');
    TestBed.inject(HttpTestingController)
      .expectOne('http://localhost:8000/api/tools/xml-to-excel/config')
      .flush({ data: { ttl_minutes: 120 } });
    const text = harness.routeNativeElement?.textContent;
    expect(text).toContain('120 minutos');
    expect(text).toContain('scheduler');
    expect(text).toContain('autenticação');
  });
  it('privacidade e termos evidenciam responsável pendente', async () => {
    const harness = await RouterTestingHarness.create('/privacidade');
    TestBed.inject(HttpTestingController)
      .expectOne('http://localhost:8000/api/tools/xml-to-excel/config')
      .flush({ data: { ttl_minutes: 120 } });
    expect(harness.routeNativeElement?.textContent).toContain('PENDENTE ANTES DA PUBLICAÇÃO');
    await harness.navigateByUrl('/termos');
    expect(harness.routeNativeElement?.textContent).toContain('aconselhamento fiscal');
  });
  it('404 tem retorno para home e ferramenta sem redirecionar silenciosamente', async () => {
    const harness = await RouterTestingHarness.create('/nao-existe');
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toContain('não existe');
    expect(TestBed.inject(Router).url).toBe('/nao-existe');
    expect(harness.routeNativeElement?.querySelectorAll('a').length).toBe(2);
  });
});
