import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const root = new URL('../dist/quotation-release/browser/', import.meta.url);
const html = (path) => new JSDOM(readFileSync(new URL(path, root), 'utf8')).window.document;

test('release completa publica ferramenta, modelos, FAQ e descoberta sem dados pessoais', () => {
  const document = html('gerador-de-orcamentos/index.html');
  assert.equal(document.querySelector('meta[name=robots]').content, 'index,follow');
  assert.equal(
    document.querySelector('link[rel=canonical]').href,
    'https://feitoo.com.br/gerador-de-orcamentos',
  );
  assert.equal(document.querySelectorAll('h1').length, 1);
  assert.equal(document.querySelector('#issuer-name').value, '');
  assert.equal(document.querySelector('#issue-date').value, '');
  assert.ok(document.querySelector('.quotation-app').textContent.includes('Clássico'));
  assert.ok(document.querySelector('.quotation-app').textContent.includes('Moderno'));
  const graph = JSON.parse(document.querySelector('#feitoo-schema').textContent)['@graph'];
  assert.ok(graph.some((node) => node['@type'] === 'WebApplication'));
  assert.ok(graph.some((node) => node['@type'] === 'FAQPage'));
  const home = html('index.html');
  assert.equal(home.querySelectorAll('app-tool-card').length, 7);
  assert.ok(home.querySelector('app-tool-card a[href="/gerador-de-orcamentos"]'));
  assert.ok(home.querySelector('#primary-nav a[href="/gerador-de-orcamentos"]'));
  assert.ok(home.querySelector('footer a[href="/gerador-de-orcamentos"]'));
  assert.ok(
    readFileSync(new URL('sitemap.xml', root), 'utf8').includes(
      'https://feitoo.com.br/gerador-de-orcamentos',
    ),
  );
});

test('HTTP permite a rota limpa e mantém noindex em conta, autenticação e contextos privados', () => {
  const { routes } = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const before = routes.slice(
    0,
    routes.findIndex((route) => route.handle === 'filesystem'),
  );
  const headerRules = (path) =>
    before.filter(
      (route) =>
        route.src && new RegExp(`^${route.src}$`).test(path) && route.headers?.['X-Robots-Tag'],
    );
  assert.ok(headerRules('/gerador-de-orcamentos').every((route) => route.has?.length));
  for (const key of ['draft', 'generation', 'quotation_order', 'payment']) {
    assert.ok(
      headerRules('/gerador-de-orcamentos').some((route) =>
        route.has.some((condition) => condition.type === 'query' && condition.key === key),
      ),
    );
  }
  for (const path of [
    '/conta',
    '/conta/assinatura',
    '/conta/creditos',
    '/conta/arquivos',
    '/conta/perfil',
    '/login',
    '/cadastro',
    '/404',
  ]) {
    assert.ok(headerRules(path).some((route) => route.headers['X-Robots-Tag'].includes('noindex')));
  }
  assert.equal(html('index.csr.html').querySelector('meta[name=robots]').content, 'noindex,follow');
});
