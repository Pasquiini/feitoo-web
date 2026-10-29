import { readFileSync, writeFileSync, copyFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
export const paths = [
  '/',
  '/gerador-de-orcamentos',
  '/docx-para-pdf',
  '/xml-para-excel',
  '/xml-para-pdf',
  '/organizar-xml',
  '/analisar-xml',
  '/produtos-dos-xmls',
  '/planos',
  '/seguranca',
  '/privacidade',
  '/termos',
  '/como-converter-xml-nfe-para-excel',
  '/como-extrair-produtos-de-xml-nfe',
];
export function publicAssets(origin, quotationEnabled = false) {
  return {
    sitemap: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${
      origin
        ? paths
            .filter((path) => quotationEnabled || path !== '/gerador-de-orcamentos')
            .map((path) => `<url><loc>${origin + path}</loc></url>`)
            .join('')
        : ''
    }</urlset>\n`,
    robots: origin
      ? `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /sanctum/\nSitemap: ${origin}/sitemap.xml\n`
      : 'User-agent: *\nDisallow: /\n',
  };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const config = JSON.parse(
    readFileSync(new URL('../.angular-launch.json', import.meta.url), 'utf8'),
  );
  const output = new URL(
    '../' + (process.env.FEITOO_ASSET_OUTPUT ?? 'dist/feitoo-web/browser') + '/',
    import.meta.url,
  );
  const image = readFileSync(new URL('og/feitoo-og.png', output));
  assert.ok(
    readdirSync(new URL('og/', output)).every((file) => !/\.(html|pdf|zip)$/i.test(file)),
    'Documentos temporários não devem ser publicados na pasta OG',
  );
  assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'OG deve ser PNG');
  const assets = publicAssets(config.origin, config.quotationEnabled);
  writeFileSync(new URL('robots.txt', output), assets.robots);
  writeFileSync(new URL('sitemap.xml', output), assets.sitemap);
  copyFileSync(new URL('404/index.html', output), new URL('404.html', output));
  const privateShell = new JSDOM(readFileSync(new URL('index.csr.html', output), 'utf8')).window
    .document;
  assert.equal(privateShell.querySelector('meta[name="robots"]').content, 'noindex,follow');
  assert.equal(
    privateShell.querySelectorAll('link[rel="canonical"], #feitoo-schema, h1').length,
    0,
  );
  for (const path of paths) {
    const quotationPreview = path === '/gerador-de-orcamentos' && !config.quotationEnabled;
    const html = readFileSync(
      new URL(path === '/' ? 'index.html' : `${path.slice(1)}/index.html`, output),
      'utf8',
    );
    const document = new JSDOM(html).window.document;
    for (const [selector, expected] of [
      ['meta[property="og:image"]', config.origin + '/og/feitoo-og.png'],
      ['meta[property="og:image:width"]', '1200'],
      ['meta[property="og:image:height"]', '630'],
      ['meta[name="twitter:image"]', config.origin + '/og/feitoo-og.png'],
      ['meta[name="twitter:card"]', 'summary_large_image'],
    ]) {
      assert.equal(
        document.querySelectorAll(selector).length,
        1,
        `Tag social duplicada/ausente: ${path} ${selector}`,
      );
      assert.equal(
        document.querySelector(selector).content,
        expected,
        `Tag social incorreta: ${path} ${selector}`,
      );
    }
    assert.ok(
      document.querySelector('main').textContent.trim().length > 300,
      `HTML sem conteudo: ${path}`,
    );
    assert.equal(document.querySelectorAll('title').length, 1);
    assert.equal(document.querySelectorAll('meta[name="description"]').length, 1);
    assert.equal(document.querySelectorAll('meta[name="robots"]').length, 1);
    if (config.origin)
      assert.equal(document.querySelector('link[rel="canonical"]').href, config.origin + path);
    const contextual = {
      '/docx-para-pdf': ['/seguranca', '/planos'],
      '/xml-para-excel': ['/produtos-dos-xmls', '/analisar-xml'],
      '/xml-para-pdf': ['/xml-para-excel'],
      '/organizar-xml': ['/analisar-xml'],
      '/analisar-xml': ['/produtos-dos-xmls'],
    };
    for (const target of contextual[path] ?? [])
      assert.ok(
        document.querySelector(`.tool-explainer a[href="${target}"]`),
        `Link contextual ausente: ${path} -> ${target}`,
      );
    assert.equal(document.querySelectorAll('h1').length, 1, `H1 deve ser único: ${path}`);
    assert.ok(document.querySelector('h1').textContent.trim(), `H1 vazio: ${path}`);
    for (const property of ['og:title', 'og:description', 'og:type', 'og:site_name'])
      assert.ok(
        document.querySelector(`meta[property="${property}"]`)?.content,
        `${property} ausente: ${path}`,
      );
    for (const name of ['twitter:card', 'twitter:title', 'twitter:description'])
      assert.ok(
        document.querySelector(`meta[name="${name}"]`)?.content,
        `${name} ausente: ${path}`,
      );
    assert.ok(html.includes('name="description"'), `Description ausente: ${path}`);
    assert.ok(html.includes('property="og:title"'), `Open Graph ausente: ${path}`);
    assert.ok(
      html.includes(
        config.origin && !quotationPreview ? 'content="index,follow"' : 'content="noindex,follow"',
      ),
      `Robots incorreto: ${path}`,
    );
    if (config.origin) {
      assert.ok(html.includes(`href="${config.origin + path}"`), `Canonical ausente: ${path}`);
      assert.equal(document.querySelectorAll('link[rel="canonical"]').length, 1);
      assert.equal(document.querySelector('meta[property="og:url"]').content, config.origin + path);
      const graph = JSON.parse(document.getElementById('feitoo-schema').textContent)['@graph'];
      if (path.startsWith('/como-')) {
        const article = graph.find((node) => node['@type'] === 'Article');
        assert.equal(article.headline, document.querySelector('h1').textContent.trim());
        assert.equal(
          article.description,
          document.querySelector('meta[name="description"]').content,
        );
        assert.equal(article.url, config.origin + path);
        assert.equal(article.mainEntityOfPage, config.origin + path);
        assert.equal(article.image, config.origin + '/og/feitoo-og.png');
        assert.equal(article.publisher.name, 'Feitoo');
        const crumbs = graph.find((node) => node['@type'] === 'BreadcrumbList').itemListElement;
        assert.equal(crumbs.length, 3);
        assert.equal(crumbs[2].item, config.origin + path);
        assert.equal(document.querySelector('meta[property="og:type"]').content, 'article');
        assert.ok(document.querySelector('article.guide'));
      }
      if (path === '/') assert.ok(graph.some((node) => node['@type'] === 'WebSite'));
      if (
        (path === '/gerador-de-orcamentos' && !quotationPreview) ||
        path === '/docx-para-pdf' ||
        path === '/xml-para-excel' ||
        path === '/produtos-dos-xmls' ||
        path === '/analisar-xml' ||
        path === '/organizar-xml' ||
        path === '/xml-para-pdf'
      ) {
        assert.ok(graph.some((node) => node['@type'] === 'WebApplication'));
        assert.equal(
          graph.find((node) => node['@type'] === 'WebApplication').name,
          document.querySelector('h1').textContent.trim(),
        );
        const breadcrumbs = graph.find((node) => node['@type'] === 'BreadcrumbList');
        assert.equal(breadcrumbs.itemListElement[1].item, config.origin + path);
        const faqs = graph.find((node) => node['@type'] === 'FAQPage').mainEntity;
        const visible = Array.from(document.querySelectorAll('.tool-explainer details'));
        assert.equal(faqs.length, visible.length);
        for (const [index, faq] of faqs.entries()) {
          assert.equal(visible[index].querySelector('summary').textContent.trim(), faq.name);
          assert.equal(
            visible[index].querySelector('p').textContent.trim(),
            faq.acceptedAnswer.text,
          );
        }
      }
    } else {
      assert.ok(!html.includes('rel="canonical"'), `Canonical inventado: ${path}`);
      assert.equal(document.querySelectorAll('#feitoo-schema').length, 0);
    }
    if (
      path === '/' ||
      path === '/docx-para-pdf' ||
      path === '/xml-para-excel' ||
      path === '/produtos-dos-xmls' ||
      path.startsWith('/como-')
    ) {
      const links = Array.from(document.querySelectorAll('a[href]')).map((link) =>
        link.getAttribute('href'),
      );
      for (const target of ['/xml-para-excel', '/produtos-dos-xmls', '/seguranca', '/planos'])
        if (target !== path)
          assert.ok(links.includes(target), `Link interno ausente: ${path} -> ${target}`);
      if (path === '/xml-para-excel')
        assert.ok(links.includes('/como-converter-xml-nfe-para-excel'));
      if (path === '/produtos-dos-xmls')
        assert.ok(links.includes('/como-extrair-produtos-de-xml-nfe'));
      for (const anchor of document.querySelectorAll('.guide-index a')) {
        const target = new URL(anchor.getAttribute('href'), 'https://feitoo.com.br');
        assert.equal(target.pathname, path, `Índice sai do guia: ${path}`);
        assert.ok(document.getElementById(target.hash.slice(1)), `Âncora ausente: ${path}`);
      }
    }
  }
  const notFound = readFileSync(new URL('404.html', output), 'utf8');
  assert.ok(notFound.includes('content="noindex,follow"'));
  assert.ok(!notFound.includes('rel="canonical"'));
  console.log('robots.txt, sitemap.xml e 404.html gerados.');
}
