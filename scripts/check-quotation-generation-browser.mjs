import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { withBrowser } from './browser-smoke.mjs';

const apiRoot = resolve('../feitoo-api');
const token = randomBytes(6).toString('hex');
const privateRoot = resolve(
  apiRoot,
  'storage/app/private/quotation-validation/e2e-phase4-' + token,
).replaceAll('\\', '/');
const artifacts = resolve('dist/validation/quotation-generation');
const root = resolve(process.env.FEITOO_TEST_BROWSER_ROOT ?? 'dist/feitoo-web/browser');
for (const directory of [
  privateRoot,
  artifacts,
  'bootstrap',
  'runtime/framework/views',
  'runtime/framework/sessions',
  'runtime/framework/cache',
  'runtime/logs',
]) {
  await mkdir(
    directory.startsWith('runtime') || directory === 'bootstrap'
      ? resolve(privateRoot, directory)
      : directory,
    { recursive: true },
  );
}
await writeFile(resolve(privateRoot, 'isolated.marker'), token);
await writeFile(resolve(privateRoot, 'database.sqlite'), '');
const php = process.env.FEITOO_PHP_BINARY ?? 'C:/xampp/php/php.exe';
const env = {
  ...process.env,
  APP_ENV: 'local',
  APP_DEBUG: 'false',
  APP_KEY: 'base64:' + randomBytes(32).toString('base64'),
  APP_CONFIG_CACHE: privateRoot + '/bootstrap/config.php',
  APP_PACKAGES_CACHE: privateRoot + '/bootstrap/packages.php',
  APP_SERVICES_CACHE: privateRoot + '/bootstrap/services.php',
  DB_CONNECTION: 'sqlite',
  DB_DATABASE: privateRoot + '/database.sqlite',
  DB_URL: '',
  CACHE_STORE: 'array',
  SESSION_DRIVER: 'file',
  SESSION_SECURE_COOKIE: 'false',
  SESSION_DOMAIN: '',
  BCRYPT_ROUNDS: '4',
  LOG_CHANNEL: 'null',
  MAIL_MAILER: 'array',
  QUOTATION_E2E_ROOT: privateRoot,
  QUOTATION_GENERATION_ENABLED: 'true',
  QUOTATION_PURCHASES_ENABLED: 'false',
  QUOTATION_SANDBOX: 'php',
  QUOTATION_PHP_BINARY: php,
};
const fixture = async (mode) => {
  const process = spawn(
    php,
    ['-d', 'extension=soap', resolve(apiRoot, 'scripts/quotation-e2e.php'), mode],
    { cwd: apiRoot, env, windowsHide: true },
  );
  const chunks = [],
    errors = [];
  process.stdout.on('data', (data) => chunks.push(data));
  process.stderr.on('data', (data) => errors.push(data));
  const exit = await new Promise((done, reject) => {
    process.on('error', reject);
    process.on('exit', done);
  });
  assert.equal(exit, 0, Buffer.concat(errors).toString());
  return JSON.parse(Buffer.concat(chunks).toString());
};
// Reserve a fresh port, with no dependency on a local/operational PHP service.
const temporary = createServer();
await new Promise((done) => temporary.listen(0, '127.0.0.1', done));
const apiPort = temporary.address().port;
await new Promise((done) => temporary.close(done));
let backend;
const requests = [];
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path.startsWith('/api/') || path.startsWith('/sanctum/')) {
    const upstream = request(
      {
        host: '127.0.0.1',
        port: apiPort,
        path: req.url,
        method: req.method,
        headers: { ...req.headers, host: `127.0.0.1:${apiPort}` },
      },
      (response) => {
        requests.push({
          path,
          method: req.method,
          status: response.statusCode,
          private: response.headers['cache-control']?.includes('no-store'),
          csrfPresent: !!req.headers['x-xsrf-token'],
          idempotencyPresent: !!req.headers['idempotency-key'],
        });
        res.writeHead(response.statusCode, response.headers);
        response.pipe(res);
      },
    );
    upstream.on('error', () => res.writeHead(503).end());
    req.pipe(upstream);
    return;
  }
  try {
    const file = resolve(root, '.' + path);
    if (!file.startsWith(root + '/') && !file.startsWith(root + '\\'))
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
env.APP_URL = `http://127.0.0.1:${apiPort}`;
env.FRONTEND_URL = `http://127.0.0.1:${port}`;
env.CORS_ALLOWED_ORIGINS = `http://127.0.0.1:${port}`;
env.SANCTUM_STATEFUL_DOMAINS = `127.0.0.1:${port},127.0.0.1:${apiPort}`;
try {
  await fixture('setup');
  backend = spawn(
    php,
    [
      '-d',
      'extension=soap',
      '-S',
      `127.0.0.1:${apiPort}`,
      resolve(apiRoot, 'scripts/quotation-e2e.php'),
    ],
    { cwd: apiRoot, env, windowsHide: true, stdio: ['ignore', 'ignore', 'ignore'] },
  );
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${apiPort}/up`)).ok) break;
    } catch {}
    await new Promise((done) => setTimeout(done, 100));
  }
  await withBrowser('quotation-generation', async ({ command, evaluate, waitFor, errors }) => {
    const ready = () =>
      waitFor(
        '!!document.querySelector("#quotation-notes") && !document.querySelector("form[inert]")',
      );
    const field = (selector, value) =>
      evaluate(
        `(() => { const e=document.querySelector(${JSON.stringify(selector)}); const step=e.closest('[data-step]')?.dataset.step; if(step) document.querySelectorAll('.editor-steps button')[Number(step)-1].click(); e.value=${JSON.stringify(value)}; e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true})); e.dispatchEvent(new Event('blur')); })()`,
      );
    const click = (text) =>
      evaluate(
        `[...document.querySelectorAll('button,a')].find(e=>e.textContent.trim()===${JSON.stringify(text)}).click()`,
      );
    await command('Page.navigate', { url: `http://127.0.0.1:${port}/gerador-de-orcamentos` });
    await ready();
    await field('#quotation-number', 'E2E-001');
    await field('#issuer-name', 'Prestador E2E Fictício');
    await field('#customer-name', 'Cliente E2E Fictício');
    await field('#item-description-0', 'Serviço de teste inteiramente fictício');
    await field('#item-price-0', '120,00');
    await evaluate('document.querySelectorAll(".editor-steps button")[0].click()');
    await evaluate(
      `(async()=>{ const c=document.createElement('canvas');c.width=40;c.height=20;c.getContext('2d').fillRect(0,0,40,20);const b=await new Promise(r=>c.toBlob(r,'image/png'));const t=new DataTransfer();t.items.add(new File([b],'logo.png',{type:'image/png'}));const e=document.querySelector('#quotation-logo');e.files=t.files;e.dispatchEvent(new Event('change',{bubbles:true}));})()`,
    );
    await waitFor('!!document.querySelector(".logo-selected img")');
    await evaluate('document.querySelectorAll(".editor-steps button")[3].click()');
    await waitFor('!document.querySelector(".editor-finish").hidden');
    await evaluate('document.querySelector(".generate-pdf").focus()');
    assert.equal(await evaluate('document.activeElement.classList.contains("generate-pdf")'), true);
    assert.equal(
      await evaluate('document.activeElement.getAttribute("aria-describedby")'),
      'pdf-policy',
    );
    await command('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13,
      text: '\r',
      unmodifiedText: '\r',
    });
    await command('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13,
    });
    await waitFor(
      'document.querySelector(".quotation-generation").textContent.includes("Entre para gerar")',
    );
    assert.equal(
      await evaluate('!!document.querySelector(".quotation-generation [role=status]")'),
      true,
    );
    assert.equal((await fixture('inspect')).generations, 0);
    await click('Entrar para continuar');
    await waitFor('!!document.querySelector("#email")');
    await field('#email', 'quotation-e2e@example.test');
    await field('#password', 'a-strong-password');
    await evaluate('document.querySelector(".auth-submit").click()');
    await ready();
    await waitFor('document.querySelector(".draft-status").textContent.includes("Rascunho salvo")');
    await evaluate('document.querySelectorAll(".editor-steps button")[3].click()');
    assert.equal(
      await evaluate('document.querySelector("#issuer-name").value'),
      'Prestador E2E Fictício',
    );
    assert.equal(await evaluate('!!document.querySelector(".logo-selected img")'), true);
    assert.equal(
      (await fixture('inspect')).generations,
      0,
      'Login must never generate automatically',
    );
    await evaluate(
      'document.querySelector(".generate-pdf").click(); document.querySelector(".generate-pdf").click()',
    );
    await waitFor('!!document.querySelector(".confirm-generation")');
    assert.equal((await fixture('inspect')).generations, 0, 'Review must not reserve a generation');
    await evaluate(
      'document.querySelector(".confirm-generation").click(); document.querySelector(".confirm-generation")?.click()',
    );
    await waitFor(
      'document.querySelector(".quotation-generation").textContent.includes("na fila")',
    );
    let info = await fixture('inspect');
    assert.equal(info.generations, 1);
    assert.equal(info.jobs, 1);
    assert.equal(info.reserved, 1);
    await field('#issuer-name', 'Alterado após a emissão');
    await waitFor('document.querySelector(".draft-status").textContent.includes("Rascunho salvo")');
    await command('Page.reload');
    await ready();
    await waitFor(
      'document.querySelector(".quotation-generation").textContent.includes("na fila")',
    );
    assert.equal((await fixture('inspect')).generations, 1);
    await fixture('work');
    await waitFor('!!document.querySelector(".download-quotation")');
    info = await fixture('inspect');
    assert.equal(info.status, 'completed');
    assert.equal(info.consumed, 1);
    assert.equal(info.reserved, 0);
    assert.equal(info.download_seconds, 7200);
    assert.equal(info.immutable_issuer, true);
    assert.equal(info.copied_logo, true);
    await evaluate(
      `window.pdfDownloads=[]; const original=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.href.startsWith('blob:') && this.download.endsWith('.pdf')) pdfDownloads.push(fetch(this.href).then(r=>r.arrayBuffer()).then(b=>btoa(String.fromCharCode(...new Uint8Array(b))))); else original.call(this);};`,
    );
    await click('Baixar orçamento em PDF');
    await waitFor('pdfDownloads.length===1');
    await click('Baixar orçamento em PDF');
    await waitFor('pdfDownloads.length===2');
    const downloads = await evaluate('Promise.all(pdfDownloads)');
    assert.equal(downloads[0], downloads[1]);
    const pdf = Buffer.from(downloads[0], 'base64');
    assert.ok(pdf.subarray(0, 5).toString() === '%PDF-');
    assert.ok(pdf.toString().includes('%%EOF'));
    assert.ok(pdf.toString().includes('/Subtype /Image'));
    await writeFile(resolve(artifacts, 'real-quotation.pdf'), pdf);
    assert.equal((await fixture('inspect')).consumed, 1);
    await evaluate('document.querySelector(".generate-pdf").click()');
    await waitFor(
      'document.querySelector(".quotation-app").textContent.includes("Você já utilizou seu orçamento gratuito de hoje.")',
    );
    assert.equal(
      await evaluate(
        '[...document.querySelectorAll("app-quotation-commerce button")].filter(e=>e.textContent.trim().startsWith("Comprar")).every(e=>e.disabled)',
      ),
      true,
      'Exhausting Free must not enable checkout',
    );
    assert.equal((await fixture('inspect')).generations, 1);
    const forbidden = await evaluate(
      `fetch('/api/quotations/drafts/00000000-0000-4000-8000-000000000001/generations',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({revision:1})}).then(r=>r.status)`,
    );
    assert.equal(forbidden, 419, 'Real web CSRF middleware must reject a missing token');
    for (const width of [320, 390, 768, 1440]) {
      await command('Emulation.setDeviceMetricsOverride', {
        width,
        height: 1000,
        deviceScaleFactor: 1,
        mobile: width < 768,
      });
      assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false);
      assert.equal(
        await evaluate('!!document.querySelector(".download-quotation").getAttribute("type")'),
        true,
      );
    }
    await fixture('expire');
    await click('Baixar orçamento em PDF');
    await waitFor(
      'document.querySelector(".quotation-generation").textContent.includes("arquivo expirou")',
    );
    assert.equal(await evaluate('!!document.querySelector(".download-quotation")'), false);
    assert.equal((await fixture('inspect')).consumed, 1);
    await click('Consultar rascunhos salvos');
    await waitFor('document.querySelector(".saved-drafts-list")?.textContent.includes("E2E-001")');
    await click('Novo orçamento');
    await waitFor(
      'document.querySelector("#issuer-name").value === "" && !document.querySelector("form[inert]")',
    );
    await field('#quotation-number', 'E2E-DRAFT-002');
    await waitFor('document.querySelector(".draft-status").textContent.includes("Rascunho salvo")');
    await click('Consultar rascunhos salvos');
    await waitFor('document.querySelectorAll(".saved-drafts-list li").length === 2');
    await evaluate(
      '[...document.querySelectorAll(".saved-drafts-list li")].find(row=>row.textContent.includes("E2E-001")).querySelector("button").click()',
    );
    await waitFor(
      'document.querySelector("#quotation-number").value === "E2E-001" && !document.querySelector("form[inert]")',
    );
    assert.equal(
      await evaluate('document.querySelector("#issuer-name").value'),
      'Alterado após a emissão',
    );
    for (const width of [390, 1440]) {
      await command('Emulation.setDeviceMetricsOverride', {
        width,
        height: 1000,
        deviceScaleFactor: 1,
        mobile: width < 768,
      });
      await evaluate(
        `document.querySelector('.quotation-workbench').scrollIntoView({block:'start'})`,
      );
      const screenshot = await command('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: false,
      });
      await writeFile(
        resolve(artifacts, `launch-${width}.png`),
        Buffer.from(screenshot.data, 'base64'),
      );
    }
    await click('Ver meu histórico de orçamentos e arquivos');
    await waitFor(
      `[...document.querySelectorAll('.history-row a')].some(a=>a.textContent.trim()==='Consultar orçamento')`,
    );
    await waitFor('!!document.querySelector("app-navbar-credits .credit-unit")');
    assert.equal(await evaluate(`document.querySelectorAll('main').length`), 1);
    assert.equal(
      await evaluate(
        `[...document.querySelectorAll('.account-navigation a')].every(a => document.getElementById(a.hash.slice(1)))`,
      ),
      true,
    );
    const uxLayouts = [];
    const captureUx = async (name, widths = [390, 1440]) => {
      for (const width of widths) {
        await command('Emulation.setDeviceMetricsOverride', {
          width,
          height: 1000,
          deviceScaleFactor: 1,
          mobile: width < 768,
        });
        await evaluate(
          name.startsWith('step-')
            ? 'document.querySelector(".quotation-workbench").scrollIntoView({block:"start"})'
            : 'scrollTo(0,0)',
        );
        await new Promise((resolve) => setTimeout(resolve, 80));
        const check = await evaluate(`(() => {
          const visible = e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden';
          return { overflow: document.documentElement.scrollWidth > innerWidth,
            unlabeled: [...document.querySelectorAll('input:not([type=hidden]), select, textarea')].filter(visible).filter(e => !(e.labels?.length || e.getAttribute('aria-label') || e.getAttribute('aria-labelledby'))).length,
            smallTargets: [...document.querySelectorAll('.account-navigation a, app-navbar-credits summary, app-navbar-credits button, .editor-steps button')].filter(visible).filter(e => e.getBoundingClientRect().height < 43).length };
        })()`);
        assert.deepEqual(
          check,
          { overflow: false, unlabeled: 0, smallTargets: 0 },
          JSON.stringify({ name, width, ...check }),
        );
        uxLayouts.push({ name, width, ...check });
        if ([390, 1440].includes(width)) {
          const shot = await command('Page.captureScreenshot', {
            format: 'png',
            captureBeyondViewport: false,
          });
          await writeFile(
            resolve(artifacts, `feitoo2-${name}-${width}.png`),
            Buffer.from(shot.data, 'base64'),
          );
        }
      }
    };
    await captureUx('account', [320, 390, 768, 1440]);
    await evaluate('document.querySelector("app-navbar-credits summary").click()');
    await captureUx('credits');
    await evaluate(
      `document.querySelector('app-navbar-credits details').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`,
    );
    assert.equal(
      await evaluate('document.querySelector("app-navbar-credits details").open'),
      false,
    );
    assert.equal(
      await evaluate('document.activeElement.matches("app-navbar-credits summary")'),
      true,
    );
    await click('Ver pacote de orçamentos');
    await ready();
    await waitFor('!document.querySelector(".editor-finish").hidden');
    assert.equal(
      await evaluate(
        'document.querySelector(".editor-steps [aria-current]").textContent.includes("Revisar")',
      ),
      true,
    );
    await evaluate('document.querySelector(".account-menu a").click()');
    await waitFor('!!document.querySelector(".history-row a")');
    await click('Consultar orçamento');
    await ready();
    await waitFor(
      'document.querySelector(".quotation-generation").textContent.includes("arquivo expirou")',
    );
    assert.equal(
      (await fixture('inspect')).generations,
      1,
      'History navigation and draft management cannot issue a PDF',
    );
    await captureUx('editor');
    for (const step of [1, 2, 3, 4]) {
      await evaluate(`document.querySelectorAll('.editor-steps button')[${step - 1}].click()`);
      await waitFor(
        `document.querySelector('.editor-steps [aria-current]').textContent.includes(${JSON.stringify(String(step))})`,
      );
      await evaluate('document.querySelectorAll(".mobile-view button")[0].click()');
      await captureUx('step-' + step);
    }
    await evaluate(`document.querySelector('a.brand').click()`);
    await waitFor('!!document.querySelector("#tool-search")');
    await captureUx('home', [320, 390, 768, 1440]);
    assert.equal(await evaluate('document.querySelectorAll(".home-faq details").length'), 4);
    assert.equal(
      requests.some(
        (r) =>
          r.method !== 'GET' &&
          /purchase|checkout|credit-orders|stripe|\/start|\/files$/.test(r.path),
      ),
      false,
    );
    assert.ok(
      requests
        .filter((r) => r.path.endsWith('/generations') && r.status === 202)
        .every((r) => r.csrfPresent && r.idempotencyPresent && r.private),
    );
    assert.deepEqual(errors, []);
    await writeFile(
      resolve(artifacts, 'report.json'),
      JSON.stringify(
        {
          realLaravel: true,
          database: 'isolated SQLite file',
          realDatabaseQueue: true,
          realSubprocessPdf: true,
          purchasesDisabled: true,
          keyboardActivation: true,
          labelledGenerationAndLiveStatus: true,
          generationConfirmation: true,
          multipleDraftsAndRecovery: true,
          sharedAccountHistory: true,
          pdfBytes: pdf.length,
          repeatedDownloadIdentical: true,
          downloadWindowSeconds: 7200,
          layouts: 4,
          uxLayouts,
          requests,
          errors,
        },
        null,
        2,
      ),
    );
    console.log(
      'Quotation generation E2E passed: real Sanctum/CSRF, login, IndexedDB, immutable snapshot/logo, database job, subprocess PDF, repeated download, Free limit, expiry and four responsive layouts.',
    );
  });
} finally {
  backend?.kill();
  await new Promise((done) => server.close(done));
}
