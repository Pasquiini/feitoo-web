import { test } from 'node:test';
import assert from 'node:assert/strict';
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
