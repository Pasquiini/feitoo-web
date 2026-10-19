import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const tools = [
  ['/xml-para-excel', 'Converter XML para Excel'],
  ['/produtos-dos-xmls', 'Extrair produtos de XMLs NF-e'],
  ['/xml-para-pdf', 'Converter XML em PDF'],
  ['/organizar-xml', 'Organizador de XMLs Online'],
  ['/analisar-xml', 'Analisador de XMLs Online'],
  ['/docx-para-pdf', 'Converter DOCX para PDF online'],
];
for (const [path, heading] of tools)
  test(`${path}: prerender preserves SEO and visible FAQ`, () => {
    const document = new JSDOM(
      readFileSync(
        new URL(`../dist/feitoo-web/browser${path}/index.html`, import.meta.url),
        'utf8',
      ),
    ).window.document;
    assert.equal(document.querySelectorAll('h1').length, 1);
    assert.equal(document.querySelector('h1').textContent.trim(), heading);
    assert.equal(
      document.querySelector('link[rel=canonical]').href,
      `https://feitoo.com.br${path}`,
    );
    assert.equal(document.querySelector('meta[name=robots]').content, 'index,follow');
    assert.equal(document.querySelectorAll('script[type="application/ld+json"]').length, 1);
    const graph = JSON.parse(document.querySelector('#feitoo-schema').textContent)['@graph'];
    assert.deepEqual(
      graph.map((node) => node['@type']),
      ['WebApplication', 'BreadcrumbList', 'FAQPage'],
    );
    const visible = [...document.querySelectorAll('.tool-explainer details')].map((entry) => ({
      name: entry.querySelector('summary').textContent.trim(),
      text: entry.querySelector('p').textContent.trim(),
    }));
    assert.deepEqual(
      graph[2].mainEntity.map((entry) => ({ name: entry.name, text: entry.acceptedAnswer.text })),
      visible,
    );
    assert.ok(visible.length >= 5);
    assert.ok(document.querySelector('.tool-workspace app-tool-uploader'));
    assert.ok(document.querySelector('.tool-explainer a[href="/seguranca"]'));
  });
