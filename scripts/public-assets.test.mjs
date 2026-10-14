import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { publicAssets, paths } from './generate-public-assets.mjs';
test('sitemap lista as sete páginas públicas e a origem configurada', () => {
  const result = publicAssets('https://feitoo.example');
  assert.equal((result.sitemap.match(/<url>/g) ?? []).length, 7);
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
  const redirectIndex = routes.findIndex((route) => route.status === 308);
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
