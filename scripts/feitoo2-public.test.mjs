import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const root = new URL('../dist/feitoo-web/browser/', import.meta.url);
test('public prerender contains no account balance or personal data', () => {
  for (const route of [
    '',
    'gerador-de-orcamentos/',
    'planos/',
    'docx-para-pdf/',
    'xml-para-excel/',
    'xml-para-pdf/',
    'organizar-xml/',
    'analisar-xml/',
    'produtos-dos-xmls/',
  ]) {
    const document = new JSDOM(readFileSync(new URL(route + 'index.html', root), 'utf8')).window
      .document;
    assert.equal(document.querySelectorAll('main').length, 1, route);
    assert.equal(document.querySelectorAll('h1').length, 1, route);
    assert.equal(document.querySelector('app-navbar-credits'), null, route);
    assert.equal(document.querySelector('.quota-summary'), null, route);
    assert.equal(document.querySelector('.editor-availability'), null, route);
    assert.equal(document.querySelector('.account-name'), null, route);
    assert.equal(document.querySelectorAll('link[rel=canonical]').length, 1, route);
    assert.equal(document.querySelector('meta[name=robots]').content, 'index,follow', route);
  }
});
test('quotation stages and home discovery remain available in the public HTML', () => {
  const home = new JSDOM(readFileSync(new URL('index.html', root), 'utf8')).window.document;
  assert.equal(home.querySelectorAll('.home-tool-card').length, 7);
  assert.equal(home.querySelectorAll('.home-faq details').length, 4);
  const quotation = new JSDOM(
    readFileSync(new URL('gerador-de-orcamentos/index.html', root), 'utf8'),
  ).window.document;
  assert.equal(quotation.querySelectorAll('.editor-steps button').length, 4);
  assert.equal(
    quotation.querySelector('.editor-steps [aria-current]').getAttribute('aria-current'),
    'step',
  );
  assert.equal(quotation.querySelector('#issuer-name').closest('[hidden]'), null);
  assert.ok(quotation.querySelector('#customer-name').closest('[hidden]'));
  const csr = new JSDOM(readFileSync(new URL('index.csr.html', root), 'utf8')).window.document;
  assert.match(csr.querySelector('meta[name=robots]').content, /noindex/);
  assert.equal(csr.querySelector('app-navbar-credits'), null);
});
