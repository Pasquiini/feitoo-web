import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { publicAssets, paths } from './generate-public-assets.mjs';
test('assets excluem documentos e templates temporários da pasta OG', () => {
  const config = JSON.parse(readFileSync(new URL('../angular.json', import.meta.url), 'utf8'));
  const assets = config.projects['feitoo-web'].architect.build.options.assets;
  assert.deepEqual(assets.find((asset) => asset.input === 'public').ignore, [
    'og/**/*.html',
    'og/**/*.pdf',
    'og/**/*.zip',
  ]);
});
test('sitemap lista as treze páginas públicas e a origem configurada', () => {
  const result = publicAssets('https://feitoo.example');
  assert.equal((result.sitemap.match(/<url>/g) ?? []).length, 13);
  assert.ok(result.sitemap.includes('/xml-para-pdf'));
  assert.ok(result.sitemap.includes('/docx-para-pdf'));
  assert.ok(result.sitemap.includes('/organizar-xml'));
  assert.ok(result.sitemap.includes('/analisar-xml'));
  assert.ok(result.sitemap.includes('/como-converter-xml-nfe-para-excel'));
  assert.ok(result.sitemap.includes('/como-extrair-produtos-de-xml-nfe'));
  assert.ok(result.sitemap.includes('/produtos-dos-xmls'));
  for (const path of paths)
    assert.ok(result.sitemap.includes(`<loc>https://feitoo.example${path}</loc>`));
  assert.ok(!result.sitemap.includes('/login'));
  assert.ok(!result.sitemap.includes('/cadastro'));
  assert.ok(result.robots.includes('Allow: /'));
});
test('sem domínio nenhum endereço é inventado e robots bloqueia staging', () => {
  assert.ok(!publicAssets('').sitemap.includes('<url>'));
  assert.equal(publicAssets('').robots, 'User-agent: *\nDisallow: /\n');
});
test('Vercel normaliza rotas públicas antes do filesystem e preserva 404 real', () => {
  const { routes } = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const redirectIndex = routes.findIndex(
    (route) => route.status === 308 && route.src.endsWith(')/'),
  );
  assert.ok(
    redirectIndex >= 0 &&
      redirectIndex < routes.findIndex((route) => route.handle === 'filesystem'),
  );
  const redirect = routes[redirectIndex];
  const pattern = new RegExp(`^${redirect.src}$`);
  for (const path of paths.filter((path) => path !== '/')) {
    const match = pattern.exec(path + '/');
    assert.ok(match, `Redirect ausente: ${path}`);
    assert.equal(redirect.headers.Location.replace('$1', match[1]), path);
    assert.ok(!pattern.test(path));
  }
  assert.ok(!pattern.test('/arquivo.js/'));
  assert.equal(routes.at(-1).status, 404);
  assert.equal(routes.at(-1).dest, '/404.html');
});

test('aliases HTML redirecionam antes do filesystem e privados recebem noindex HTTP', () => {
  const { routes } = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const beforeFiles = routes.slice(
    0,
    routes.findIndex((r) => r.handle === 'filesystem'),
  );
  for (const path of paths) {
    const alias = path === '/' ? '/index.html' : path + '/index.html';
    const rule = beforeFiles.find((r) => r.status === 308 && new RegExp(`^${r.src}$`).test(alias));
    assert.ok(rule, alias);
    const match = new RegExp(`^${rule.src}$`).exec(alias);
    assert.equal(rule.headers.Location.replace('$1', match[1]), path);
  }
  for (const path of ['/login', '/cadastro', '/conta']) {
    assert.equal(
      routes.find((r) => r.dest && new RegExp(`^${r.src}$`).test(path)).dest,
      '/index.csr.html',
    );
    assert.ok(
      beforeFiles.some(
        (r) =>
          new RegExp(`^${r.src}$`).test(path) && r.headers?.['X-Robots-Tag'] === 'noindex, follow',
      ),
    );
    assert.ok(!publicAssets('https://feitoo.example').robots.includes(`Disallow: ${path}`));
  }
});
