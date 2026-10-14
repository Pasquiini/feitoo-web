import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
export const paths = [
  '/',
  '/xml-para-excel',
  '/produtos-dos-xmls',
  '/planos',
  '/seguranca',
  '/privacidade',
  '/termos',
];
export function publicAssets(origin) {
  return {
    sitemap: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${origin ? paths.map((path) => `<url><loc>${origin + path}</loc></url>`).join('') : ''}</urlset>\n`,
    robots: origin
      ? `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /sanctum/\nDisallow: /conta\nDisallow: /login\nDisallow: /cadastro\nDisallow: /404\nSitemap: ${origin}/sitemap.xml\n`
      : 'User-agent: *\nDisallow: /\n',
  };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const config = JSON.parse(
    readFileSync(new URL('../.angular-launch.json', import.meta.url), 'utf8'),
  );
  const output = new URL('../dist/feitoo-web/browser/', import.meta.url);
  const assets = publicAssets(config.origin);
  writeFileSync(new URL('robots.txt', output), assets.robots);
  writeFileSync(new URL('sitemap.xml', output), assets.sitemap);
  copyFileSync(new URL('404/index.html', output), new URL('404.html', output));
  for (const path of paths) {
    const html = readFileSync(
      new URL(path === '/' ? 'index.html' : `${path.slice(1)}/index.html`, output),
      'utf8',
    );
    assert.ok(html.includes('<h1'), `Conteúdo não prerenderizado: ${path}`);
    assert.ok(html.includes('name="description"'), `Description ausente: ${path}`);
    assert.ok(html.includes('property="og:title"'), `Open Graph ausente: ${path}`);
    assert.ok(
      html.includes(config.origin ? 'content="index,follow"' : 'content="noindex,follow"'),
      `Robots incorreto: ${path}`,
    );
    if (config.origin)
      assert.ok(html.includes(`href="${config.origin + path}"`), `Canonical ausente: ${path}`);
    else assert.ok(!html.includes('rel="canonical"'), `Canonical inventado: ${path}`);
  }
  const notFound = readFileSync(new URL('404.html', output), 'utf8');
  assert.ok(notFound.includes('content="noindex,follow"'));
  assert.ok(!notFound.includes('rel="canonical"'));
  console.log('robots.txt, sitemap.xml e 404.html gerados.');
}
