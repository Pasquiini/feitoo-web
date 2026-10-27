import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { publicAssets } from './generate-public-assets.mjs';

const html = readFileSync(
  new URL('../dist/feitoo-web/browser/gerador-de-orcamentos/index.html', import.meta.url),
  'utf8',
);
const document = new JSDOM(html).window.document;
test('quotation editor prerenders safely with accurate metadata and the explicit Free policy', () => {
  assert.equal(document.title, 'Gerador de Orçamentos Online Grátis | Feitoo');
  assert.equal(
    document.querySelector('meta[name=description]').content,
    'Crie orçamentos profissionais para serviços e produtos. Adicione clientes, valores, descontos e personalize o modelo do documento.',
  );
  assert.equal(document.querySelector('meta[name=robots]').content, 'noindex,follow');
  assert.equal(
    document.querySelector('link[rel=canonical]').href,
    'https://feitoo.com.br/gerador-de-orcamentos',
  );
  assert.equal(document.querySelectorAll('h1').length, 1);
  assert.ok(document.querySelector('form input#issuer-name'));
  assert.equal(document.querySelector('#issuer-name').value, '');
  assert.equal(document.querySelector('#issue-date').value, '');
  assert.equal(document.querySelector('.generate-pdf').disabled, true);
  assert.ok(document.querySelector('#pdf-policy').textContent.includes('franquia Free'));
  const graph = JSON.parse(document.querySelector('#feitoo-schema').textContent)['@graph'];
  assert.deepEqual(
    graph.map((entry) => entry['@type']),
    ['WebPage'],
  );
  assert.ok(!html.includes('FAQPage'));
  assert.ok(!html.includes('WebApplication'));
});
test('editor remains outside public discovery until backend generation is integrated', () => {
  assert.ok(!publicAssets('https://feitoo.com.br').sitemap.includes('/gerador-de-orcamentos'));
  const home = new JSDOM(
    readFileSync(new URL('../dist/feitoo-web/browser/index.html', import.meta.url), 'utf8'),
  ).window.document;
  assert.equal(home.querySelector('a[href="/gerador-de-orcamentos"]'), null);
  const { routes } = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const index = routes.findIndex((route) => route.handle === 'filesystem');
  const before = routes.slice(0, index);
  assert.ok(
    before.some(
      (route) =>
        new RegExp(`^${route.src}$`).test('/gerador-de-orcamentos') &&
        route.headers?.['X-Robots-Tag'] === 'noindex, follow',
    ),
  );
  for (const alias of ['/gerador-de-orcamentos/', '/gerador-de-orcamentos/index.html']) {
    const rule = before.find(
      (route) => route.status === 308 && new RegExp(`^${route.src}$`).test(alias),
    );
    assert.ok(rule, alias);
    const match = new RegExp(`^${rule.src}$`).exec(alias);
    assert.equal(rule.headers.Location.replace('$1', match[1]), '/gerador-de-orcamentos');
  }
});
