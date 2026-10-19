import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const root = new URL('../dist/feitoo-web/browser/', import.meta.url);
const page = (path) => new JSDOM(readFileSync(new URL(path, root), 'utf8')).window.document;
test('production prerender: home and DOCX metadata, schemas and visible FAQ', () => {
  for (const [path, title, h1] of [
    [
      'index.html',
      'Feitoo | Ferramentas Online para XML, Word, PDF e Planilhas',
      'Ferramentas online para arquivos, documentos e planilhas.',
    ],
    [
      'docx-para-pdf/index.html',
      'DOCX para PDF Online | Converter Word em PDF | Feitoo',
      'Converter DOCX para PDF online',
    ],
  ]) {
    const doc = page(path);
    const url = 'https://feitoo.com.br/' + (path.startsWith('docx') ? 'docx-para-pdf' : '');
    assert.equal(doc.title, title);
    assert.equal(doc.querySelectorAll('h1').length, 1);
    assert.equal(doc.querySelector('h1').textContent.trim(), h1);
    assert.equal(doc.querySelectorAll('link[rel="canonical"]').length, 1);
    assert.equal(doc.querySelector('link[rel="canonical"]').href, url);
    assert.equal(doc.querySelector('meta[name="robots"]').content, 'index,follow');
    const description = doc.querySelector('meta[name="description"]').content;
    assert.ok(description.length > 80);
    for (const [selector, value] of [
      ['[property="og:title"]', title],
      ['[property="og:description"]', description],
      ['[property="og:url"]', url],
      ['[property="og:image"]', 'https://feitoo.com.br/og/feitoo-og.png'],
      ['[name="twitter:card"]', 'summary_large_image'],
      ['[name="twitter:title"]', title],
      ['[name="twitter:description"]', description],
      ['[name="twitter:image"]', 'https://feitoo.com.br/og/feitoo-og.png'],
    ])
      assert.equal(doc.querySelector('meta' + selector).content, value);
    assert.equal(doc.querySelectorAll('script[type="application/ld+json"]').length, 1);
    const graph = JSON.parse(doc.querySelector('#feitoo-schema').textContent)['@graph'];
    assert.deepEqual(
      graph.map((node) => node['@type']),
      path.startsWith('docx')
        ? ['WebApplication', 'BreadcrumbList', 'FAQPage']
        : ['WebSite', 'Organization'],
    );
    if (path.startsWith('docx')) {
      const faqs = [...doc.querySelectorAll('.tool-explainer details')].map((entry) => ({
        name: entry.querySelector('summary').textContent.trim(),
        text: entry.querySelector('p').textContent.trim(),
      }));
      assert.equal(faqs.length, 7);
      assert.deepEqual(
        graph[2].mainEntity.map((faq) => ({ name: faq.name, text: faq.acceptedAnswer.text })),
        faqs,
      );
      for (const href of ['/seguranca', '/planos'])
        assert.ok(doc.querySelector(`.tool-explainer a[href="${href}"]`));
    } else assert.ok(doc.querySelector('app-tool-card a[href="/docx-para-pdf"]'));
  }
});
test('private CSR shell retains noindex without home canonical or schema', () => {
  const doc = page('index.csr.html');
  assert.match(doc.querySelector('meta[name="robots"]').content, /noindex/);
  assert.equal(doc.querySelector('link[rel="canonical"]'), null);
  assert.equal(doc.querySelector('#feitoo-schema'), null);
  const sitemap = readFileSync(new URL('sitemap.xml', root), 'utf8');
  assert.ok(sitemap.includes('<loc>https://feitoo.com.br/docx-para-pdf</loc>'));
  for (const path of ['/login', '/cadastro', '/conta']) assert.ok(!sitemap.includes(path));
});
