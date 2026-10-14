import { toolFaqs } from './tool-faqs';
import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs';
import { LAUNCH_CONFIG } from './launch-config';
import { publicPages, PublicPath, safePage } from './public-pages';

@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly document = inject(DOCUMENT);
  private readonly meta = inject(Meta);
  private readonly title = inject(Title);
  private readonly config = inject(LAUNCH_CONFIG);
  private readonly router = inject(Router);
  start(): void {
    this.apply(this.router.url);
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event) => this.apply(event.urlAfterRedirects));
  }
  apply(url: string): void {
    const path = safePage(url);
    const page = publicPages[path as PublicPath] ?? {
      title: path === '/404' ? 'Página não encontrada | Feitoo' : 'Sua conta | Feitoo',
      description: 'Entre na sua conta Feitoo para continuar.',
    };
    this.title.setTitle(page.title);
    this.meta.updateTag({ name: 'description', content: page.description });
    this.meta.updateTag({
      name: 'robots',
      content: this.config.origin && path in publicPages ? 'index,follow' : 'noindex,follow',
    });
    for (const [property, content] of Object.entries({
      'og:title': page.title,
      'og:description': page.description,
      'og:type': 'website',
      'og:site_name': 'Feitoo',
      'og:locale': 'pt_BR',
    }))
      this.meta.updateTag({ property, content });
    this.meta.updateTag({ name: 'twitter:card', content: 'summary' });
    this.meta.updateTag({ name: 'twitter:title', content: page.title });
    this.meta.updateTag({ name: 'twitter:description', content: page.description });
    this.document.querySelector('link[rel="canonical"]')?.remove();
    this.document.getElementById('feitoo-schema')?.remove();
    this.meta.removeTag('property="og:url"');
    if (this.config.origin && path in publicPages) {
      const canonical = this.config.origin + path;
      const link = this.document.createElement('link');
      link.rel = 'canonical';
      link.href = canonical;
      this.document.head.appendChild(link);
      this.meta.updateTag({ property: 'og:url', content: canonical });
      const schema = this.document.createElement('script');
      schema.id = 'feitoo-schema';
      schema.type = 'application/ld+json';
      const tool = path === '/xml-para-excel' || path === '/produtos-dos-xmls';
      const main =
        path === '/'
          ? { '@type': 'WebSite', name: 'Feitoo', url: canonical, inLanguage: 'pt-BR' }
          : tool
            ? {
                '@type': 'WebApplication',
                name:
                  path === '/xml-para-excel'
                    ? 'Converter XML para Excel'
                    : 'Extrair produtos de XMLs NF-e',
                url: canonical,
                applicationCategory: 'UtilitiesApplication',
                operatingSystem: 'Web',
                description: page.description,
                inLanguage: 'pt-BR',
              }
            : { '@type': 'WebPage', name: page.title, url: canonical };
      const graph: object[] = [main];
      if (path === '/xml-para-excel' || path === '/produtos-dos-xmls') {
        graph.push({
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Feitoo', item: this.config.origin + '/' },
            { '@type': 'ListItem', position: 2, name: main.name, item: canonical },
          ],
        });
        graph.push({
          '@type': 'FAQPage',
          mainEntity: toolFaqs[path].map((faq) => ({
            '@type': 'Question',
            name: faq.question,
            acceptedAnswer: { '@type': 'Answer', text: faq.answer },
          })),
        });
      }
      schema.textContent = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph });
      this.document.head.appendChild(schema);
    }
  }
}
