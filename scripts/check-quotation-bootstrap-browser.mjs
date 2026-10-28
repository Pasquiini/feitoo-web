import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { withBrowser } from './browser-smoke.mjs';

const root = resolve('dist/feitoo-web/browser');
const artifacts = resolve('dist/validation/quotation-bootstrap');
await mkdir(artifacts, { recursive: true });
// Existing global styles are plain CSS. Compare with the same tokens and rules
// before the single Bootstrap import, while retaining Angular component styles.
const baseline = (await readFile('src/styles.scss', 'utf8')).replace(
  /@use '\.\/styles\/quotation-bootstrap';\s*/,
  '',
);
assert.ok(!baseline.includes('@use'));
let authenticated = false;
const requests = [];
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path.startsWith('/api/') || path.startsWith('/sanctum/')) {
      requests.push(path);
      res.setHeader('Content-Type', 'application/json');
      if (path === '/api/me' && authenticated)
        return void res.end(
          JSON.stringify({
            data: {
              id: 1,
              name: 'Conta Fictícia',
              email: 'ficticio@example.test',
              has_password: true,
              google_linked: false,
              created_at: '2026-10-28',
            },
          }),
        );
      return void res.writeHead(path === '/api/me' ? 401 : 503).end('{}');
    }
    const file = resolve(root, '.' + path);
    if (file !== root && !file.startsWith(root + '/') && !file.startsWith(root + '\\'))
      return void res.writeHead(403).end();
    const actual = /^\/(login|cadastro|conta)\/?$/.test(path)
      ? resolve(root, 'index.csr.html')
      : extname(file)
        ? file
        : resolve(file, 'index.html');
    const content = await readFile(actual);
    res.setHeader(
      'Content-Type',
      {
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.html': 'text/html',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
      }[extname(actual)] ?? 'application/octet-stream',
    );
    res.end(
      extname(actual) === '.js'
        ? content.toString().replaceAll('https://api.feitoo.com.br', `http://127.0.0.1:${port}`)
        : content,
    );
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const port = server.address().port;
try {
  await withBrowser('quotation-bootstrap', async ({ command, evaluate, waitFor, errors }) => {
    await command('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    });
    const results = [];
    const metrics = `JSON.stringify([...document.querySelectorAll('body, .site-header, .site-footer, h1, nav, .btn, input, select, textarea')].map(e => {
      const s=getComputedStyle(e), r=e.getBoundingClientRect();
      return [e.tagName,e.className,s.color,s.backgroundColor,s.fontFamily,s.fontSize,s.lineHeight,s.padding,s.margin,s.border,s.borderRadius,s.display,...[r.x,r.y,r.width,r.height].map(n=>Math.round(n*100)/100)];
    }))`;
    const paths = [
      '/',
      '/login',
      '/cadastro',
      '/conta',
      '/seguranca',
      '/privacidade',
      '/termos',
      '/planos',
      '/xml-para-excel',
      '/produtos-dos-xmls',
      '/xml-para-pdf',
      '/organizar-xml',
      '/analisar-xml',
      '/docx-para-pdf',
    ];
    for (const path of paths) {
      authenticated = path === '/conta';
      await command('Page.navigate', { url: `http://127.0.0.1:${port}${path}` });
      await waitFor('!!document.querySelector("h1") && !!document.querySelector(".site-footer")');
      await new Promise((done) => setTimeout(done, 250));
      for (const width of [320, 375, 768, 1024, 1440]) {
        await command('Emulation.setDeviceMetricsOverride', {
          width,
          height: 1000,
          deviceScaleFactor: 1,
          mobile: width < 768,
        });
        await evaluate(
          'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
        );
        const withBootstrap = await evaluate(metrics);
        await evaluate(
          `window.globalSheets=[...document.querySelectorAll('link[rel=stylesheet]')]; globalSheets.forEach(e=>e.disabled=true); window.baselineStyle=document.createElement('style'); baselineStyle.textContent=${JSON.stringify(baseline)}; document.head.appendChild(baselineStyle);`,
        );
        await evaluate(
          'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
        );
        const withoutBootstrap = await evaluate(metrics);
        await evaluate('baselineStyle.remove(); globalSheets.forEach(e=>e.disabled=false)');
        await evaluate(
          'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
        );
        const before = JSON.parse(withBootstrap),
          after = JSON.parse(withoutBootstrap);
        const changed = before.findIndex(
          (row, index) => JSON.stringify(row) !== JSON.stringify(after[index]),
        );
        assert.deepEqual(
          changed < 0 ? null : before[changed],
          changed < 0 ? null : after[changed],
          `Global CSS regression: ${path} at ${width}px`,
        );
        assert.equal(
          await evaluate('document.documentElement.scrollWidth > innerWidth'),
          false,
          `${path}: overflow at ${width}`,
        );
        results.push({ path, width, unchanged: true });
      }
    }
    authenticated = false;
    const previousRequests = requests.length;
    await command('Page.navigate', { url: `http://127.0.0.1:${port}/gerador-de-orcamentos` });
    await waitFor(
      '!!document.querySelector("#issue-date")?.value && !document.querySelector("form[inert]")',
    );
    assert.equal(await evaluate('document.querySelectorAll("link[rel=stylesheet]").length'), 1);
    assert.equal(
      await evaluate(
        'getComputedStyle(document.querySelector(".draft-status")).getPropertyValue("--bs-alert-bg").trim().length > 0',
      ),
      true,
    );
    assert.equal(
      await evaluate('getComputedStyle(document.querySelector(".quotation-workbench")).display'),
      'flex',
    );
    assert.equal(await evaluate('document.querySelector(".generate-pdf").disabled'), true);
    assert.equal(await evaluate('!!window.bootstrap || !!window.jQuery'), false);
    assert.equal(
      requests
        .slice(previousRequests)
        .some((path) => /generations|credit-orders|entitlements/.test(path)),
      false,
    );
    assert.deepEqual(errors, []);
    await writeFile(
      resolve(artifacts, 'report.json'),
      JSON.stringify({ results, runtimeErrors: errors }, null, 2),
    );
    console.log(
      `Bootstrap: ${results.length} comparisons against the previous global CSS passed; one stylesheet, scoped components, no JS or jQuery.`,
    );
  });
} finally {
  await new Promise((done) => server.close(done));
}
