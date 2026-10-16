// Local smoke check of the production build with synthetic API responses only.
// No real credentials, fiscal XML, OAuth provider or backend database is used.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

const root = resolve('dist/feitoo-web/browser');
const artifacts = resolve('dist/validation');
const launch = JSON.parse(await readFile('.angular-launch.json', 'utf8'));
await mkdir(artifacts, { recursive: true });
const batch = {
  id: 'synthetic-batch',
  tool: 'xml-to-excel',
  status: 'queued',
  files_count: 2,
  processed_files_count: 0,
  successful_files_count: 0,
  failed_files_count: 0,
  total_size: 20,
  started_at: null,
  completed_at: null,
  created_at: new Date().toISOString(),
  expires_at: new Date(Date.now() + 7200000).toISOString(),
  result: { available: false, file_name: null, size: null, error_message: null },
};
let loggedIn = false;
let polls = 0;
let rejectLoginOnce = false;
let accountUser = {
  id: 1,
  name: 'Pessoa Teste',
  email: 'synthetic@example.test',
  google_linked: true,
  has_password: true,
  created_at: '2026-10-08T12:00:00Z',
};
let accountPassword = 'synthetic-password';
let emptyHistory = false;
let accountDownloads = 0;
let accountDeletes = 0;
let dailyUsed = 0;
let accountVisual = null;
let subscriptionScenario = null;
let subscriptionRequests = [];
let subscriptionAccountRequests = [];
const billingId = '12345678-1234-4234-8234-123456789abc';
let paymentStatus = 'pending';
let billingStarts = 0;
const accountRows = Array.from({ length: 12 }, (_, i) => ({
  id: 'account-' + i,
  tool: 'xml-to-excel',
  created_at: new Date(Date.now() - i * 60000).toISOString(),
  expires_at: new Date(Date.now() + (i === 1 || i === 2 ? -60000 : 7200000)).toISOString(),
  status: i === 1 || i === 2 ? 'expired' : i === 3 ? 'failed' : i === 4 ? 'queued' : 'completed',
  files_count: 3,
  successful_files_count: i === 3 ? 0 : 2,
  failed_files_count: i === 3 ? 3 : 1,
  total_value: i === 0 ? '8742.19' : i === 1 ? '9007199254740993.29' : null,
  files_deleted: i === 2,
  can_delete_files: i !== 2,
  result: { available: ![1, 2, 3, 4].includes(i), file_name: 'synthetic-account.xlsx' },
}));
async function jsonBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString() || '{}');
}
const server = createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  if (path.startsWith('/api/') || path === '/sanctum/csrf-cookie') {
    if (subscriptionScenario) subscriptionAccountRequests.push(path);
    response.setHeader('Content-Type', 'application/json');
    let body = { data: batch };
    if (path === '/api/me') {
      response.statusCode = loggedIn ? 200 : 401;
      body = {
        data: accountUser,
      };
    } else if (path.endsWith('/config')) {
      body = {
        data: {
          max_files: 20,
          max_processing_files: 250,
          max_file_size_kb: 10240,
          ttl_minutes: 120,
          max_processing_items: 4000,
          max_total_size_kb: 40960,
          free: { per_processing: 20, daily: 50 },
          packages: [
            { code: 'xml_100', files_limit: 100, amount: 490, currency: 'brl' },
            { code: 'xml_250', files_limit: 250, amount: 690, currency: 'brl' },
          ],
          checkout_available: true,
        },
      };
    } else if (path === '/api/account/subscription') {
      if (subscriptionScenario) {
        subscriptionRequests.push(Date.now());
        if (subscriptionScenario === 'limited') {
          response.writeHead(429, { 'Retry-After': '3' });
          response.end(
            JSON.stringify({ message: 'Muitas requisições. Tente novamente mais tarde.' }),
          );
          return;
        }
      }
      body = {
        data: {
          offer: {
            amount: 2990,
            currency: 'brl',
            per_processing: 250,
            daily: 500,
            available: true,
          },
          subscription:
            subscriptionScenario === 'activation'
              ? {
                  status: subscriptionRequests.length >= 3 ? 'active' : 'incomplete',
                  grants_pro: subscriptionRequests.length >= 3,
                  current_period_end: '2026-11-09T12:00:00Z',
                  cancel_at_period_end: false,
                }
              : (accountVisual?.subscription ?? null),
        },
      };
    } else if (path === '/api/account/usage') {
      body = {
        data: {
          plan:
            accountVisual?.pro ||
            (subscriptionScenario === 'activation' && subscriptionRequests.length >= 3)
              ? 'pro'
              : 'free',
          limits: {
            per_processing:
              accountVisual?.pro ||
              (subscriptionScenario === 'activation' && subscriptionRequests.length >= 3)
                ? 250
                : 20,
            daily:
              accountVisual?.pro ||
              (subscriptionScenario === 'activation' && subscriptionRequests.length >= 3)
                ? 500
                : 50,
            used_today: accountVisual?.used ?? dailyUsed,
            remaining_today: accountVisual
              ? (accountVisual.pro ? 500 : 50) - accountVisual.used
              : 50 - dailyUsed,
            resets_at: new Date(Date.now() + 86400000).toISOString(),
          },
        },
      };
    } else if (path === '/api/account/purchases') {
      body = { data: accountVisual?.purchases ?? [], meta: { current_page: 1, last_page: 1 } };
    } else if (path === '/api/processings' && request.method === 'POST') {
      const input = await jsonBody(request);
      assert.ok(['xml-to-excel', 'products-from-xml'].includes(input.tool));
      batch.tool = input.tool;
      polls = 0;
      body = { data: batch };
    } else if (path === `/api/processings/${billingId}/purchase`) {
      body = {
        data: {
          id: 'synthetic-purchase',
          processing_id: billingId,
          tool: 'xml-to-excel',
          package_code: 'xml_100',
          files_count: 37,
          files_limit: 100,
          amount: 490,
          currency: 'brl',
          status: paymentStatus,
          consumed: false,
          paid_at: null,
          created_at: new Date().toISOString(),
          expires_at: batch.expires_at,
        },
      };
    } else if (path === `/api/processings/${billingId}/start`) {
      assert.equal(paymentStatus, 'paid');
      billingStarts++;
      body = { data: { ...batch, id: billingId, files_count: 37 } };
    } else if (path === `/api/processings/${billingId}`) {
      body = {
        data: {
          ...batch,
          id: billingId,
          files_count: 37,
          status: billingStarts ? 'completed' : 'pending',
          successful_files_count: billingStarts ? 37 : 0,
          processed_files_count: billingStarts ? 37 : 0,
          result: { ...batch.result, available: !!billingStarts, file_name: 'synthetic.xlsx' },
        },
      };
    } else if (path === '/sanctum/csrf-cookie') {
      response.setHeader('Set-Cookie', 'XSRF-TOKEN=synthetic; Path=/; SameSite=Lax');
      body = {};
    } else if (path.endsWith('/auth/login')) {
      const input = await jsonBody(request);
      await new Promise((done) => setTimeout(done, 1200));
      if (rejectLoginOnce || input.password !== accountPassword) {
        rejectLoginOnce = false;
        response.statusCode = 422;
        body = { message: 'Invalid credentials' };
      } else {
        loggedIn = true;
        body = { data: accountUser };
      }
    } else if (path === '/api/auth/logout') {
      loggedIn = false;
      body = { message: 'Sessão encerrada.' };
    } else if (path === '/api/account/profile') {
      const input = await jsonBody(request);
      await new Promise((done) => setTimeout(done, 400));
      accountUser = { ...accountUser, name: input.name };
      body = { data: accountUser };
    } else if (path === '/api/account/password') {
      const input = await jsonBody(request);
      await new Promise((done) => setTimeout(done, 400));
      if (input.current_password !== accountPassword) {
        response.statusCode = 422;
        body = { errors: { current_password: ['A senha atual não confere.'] } };
      } else {
        accountPassword = input.password;
        body = { message: 'Senha atualizada.' };
      }
    } else if (path === '/api/processings' && request.method === 'GET') {
      const page = Number(new URL(request.url, 'http://localhost').searchParams.get('page') || '1');
      body = {
        data: emptyHistory ? [] : accountRows.slice((page - 1) * 10, page * 10),
        meta: {
          current_page: page,
          last_page: emptyHistory ? 1 : 2,
          per_page: 10,
          total: emptyHistory ? 0 : 12,
        },
      };
    } else if (path.startsWith('/api/processings/account-') && path.endsWith('/result')) {
      accountDownloads++;
      response.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      response.setHeader('Content-Disposition', 'attachment; filename="synthetic-account.xlsx"');
      response.end('synthetic-workbook');
      return;
    } else if (path.endsWith('/files') && request.method === 'GET') {
      body = {
        data: [
          {
            id: 'synthetic-file',
            original_name: 'recusado.xml',
            status: 'failed',
            size: 10,
            error_code: 'unsupported_document',
            error_message: 'Documento não suportado. Envie uma NF-e modelo 55.',
            processed_at: null,
          },
        ],
      };
    } else if (request.method === 'DELETE') {
      if (path.startsWith('/api/processings/account-')) {
        accountDeletes++;
        const row = accountRows.find((row) => path === '/api/processings/' + row.id + '/files');
        Object.assign(row, {
          status: 'expired',
          files_deleted: true,
          can_delete_files: false,
          result: { available: false, file_name: null },
        });
      }
      body = { data: { ...batch, status: 'expired' } };
    } else if (path === '/api/processings/synthetic-batch' && request.method === 'GET') {
      polls++;
      body = {
        data: {
          ...batch,
          status: polls > 1 ? 'completed' : 'processing',
          processed_files_count: polls > 1 ? 2 : 1,
          successful_files_count: 1,
          failed_files_count: polls > 1 ? 1 : 0,
          preview:
            polls > 1
              ? {
                  summary: {
                    successful_documents_count: 1,
                    failed_documents_count: 1,
                    items_count: 12,
                    total_value: '1234.50',
                    documents_without_total_count: 0,
                    ...(batch.tool === 'products-from-xml' ? { products_count: 12 } : {}),
                  },
                  ...(batch.tool === 'products-from-xml'
                    ? {
                        products_preview: Array.from({ length: 10 }, (_, i) => ({
                          code: '000' + i,
                          product: 'Produto consolidado ' + i,
                          issuer_name: 'Fornecedor de exemplo',
                          issuer_document: '00000000000100',
                          ncm: '09012100',
                          unit: 'UN',
                          total_quantity: '2.0000',
                          invoice_count: 1,
                          minimum_unit_value: '61.7250',
                          maximum_unit_value: '61.7250',
                          average_unit_value: '61.7250000000',
                          total_value: '123.45',
                        })),
                      }
                    : {}),
                  notes_preview: [
                    {
                      number: '123',
                      series: '001',
                      issued_at: '2026-10-01',
                      issuer_name: 'Emitente de exemplo com nome extenso',
                      recipient_name: 'Destinatário de exemplo com nome extenso',
                      items_count: 12,
                      total_value: '1234.50',
                    },
                  ],
                  items_preview: Array.from({ length: 10 }, (_, i) => ({
                    note_number: i % 2 ? '101' : '100',
                    note_reference: i % 2 ? 'synthetic-note-b' : 'synthetic-note-a',
                    issuer_name: i % 2 ? 'Emitente B' : 'Emitente A',
                    series: '001',
                    code: '000' + i,
                    product: 'Produto de exemplo ' + i,
                    quantity: '2.0000',
                    unit_value: '61.7250',
                    total_value: '123.45',
                    ncm: '09012100',
                    cfop: '5102',
                    unit: 'UN',
                    issued_at: '2026-10-01',
                  })),
                }
              : null,
          result: {
            available: polls > 1,
            file_name: 'synthetic.xlsx',
            size: 100,
            error_message: null,
          },
        },
      };
    }
    response.end(JSON.stringify(body));
    return;
  }
  const file = resolve(root, `.${path}`);
  if (file !== root && !file.startsWith(root + '\\') && !file.startsWith(root + '/')) {
    response.writeHead(403).end();
    return;
  }
  try {
    let actual = extname(file) ? file : resolve(file, 'index.html');
    if (path === '/login' || path === '/cadastro' || path === '/conta')
      actual = resolve(root, 'index.csr.html');
    if (
      ![
        '/',
        '/xml-para-excel',
        '/produtos-dos-xmls',
        '/planos',
        '/seguranca',
        '/privacidade',
        '/termos',
        '/login',
        '/cadastro',
        '/conta',
      ].includes(path) &&
      !extname(file)
    ) {
      actual = resolve(root, '404.html');
      response.statusCode = 404;
    }
    response.setHeader(
      'Content-Type',
      {
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.html': 'text/html',
        '.ico': 'image/x-icon',
        '.svg': 'image/svg+xml',
      }[extname(actual)] ?? 'application/octet-stream',
    );
    const content = await readFile(actual);
    // Route the production API origin to the local synthetic server for this check only.
    response.end(
      extname(actual) === '.js'
        ? content.toString().replaceAll('https://api.feitoo.com.br', `http://127.0.0.1:${port}`)
        : content,
    );
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const port = server.address().port;
const edge = spawn(
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${resolve(artifacts, 'edge-profile-' + process.pid)}`,
    '--disable-background-networking',
    '--disable-sync',
    '--no-first-run',
    'about:blank',
  ],
  { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] },
);
let socket;
try {
  const endpoint = await new Promise((done, reject) => {
    const deadline = setTimeout(() => reject(new Error('Edge startup timeout')), 20000);
    edge.stderr.on('data', (data) => {
      const match = /DevTools listening on (ws:\/\/\S+)/.exec(data.toString());
      if (match) {
        clearTimeout(deadline);
        done(match[1]);
      }
    });
    edge.on('error', reject);
  });
  socket = new WebSocket(endpoint);
  await new Promise((done, reject) => {
    socket.onopen = done;
    socket.onerror = reject;
  });
  let id = 0;
  const pending = new Map();
  const errors = [];
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const task = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(task.timeout);
      if (message.error) task.reject(new Error(message.error.message));
      else task.done(message.result);
    } else if (message.method === 'Runtime.exceptionThrown')
      errors.push(message.params.exceptionDetails.text);
    else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error')
      errors.push(message.params.args.map((arg) => arg.value ?? arg.description ?? '').join(' '));
  };
  const send = (method, params = {}, sessionId) =>
    new Promise((done, reject) => {
      const requestId = ++id;
      const timeout = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error(`CDP timeout: ${method}`));
      }, 10000);
      pending.set(requestId, { done, reject, timeout });
      socket.send(
        JSON.stringify({ id: requestId, method, params, ...(sessionId ? { sessionId } : {}) }),
      );
    });
  const target = await send('Target.createTarget', { url: 'about:blank' });
  const attached = await send('Target.attachToTarget', {
    targetId: target.targetId,
    flatten: true,
  });
  const session = attached.sessionId;
  const command = (method, params) => send(method, params, session);
  await command('Runtime.enable');
  await command('Page.enable');
  await command('Network.enable');
  await command('Network.setBlockedURLs', {
    urls: ['*googletagmanager.com*', '*google-analytics.com*'],
  });
  const evaluate = async (expression) => {
    const result = await command('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  const waitFor = async (expression) => {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await evaluate(expression)) return;
      await new Promise((done) => setTimeout(done, 100));
    }
    throw new Error(`Condition timed out: ${expression}`);
  };
  await command('Page.navigate', { url: `http://127.0.0.1:${port}/xml-para-excel` });
  await waitFor("document.body.innerText.includes('Até 250 arquivos')");
  const consentEnabled = await evaluate(
    "!![...document.querySelectorAll('button')].find(b => b.textContent.includes('Recusar opcionais'))",
  );
  assert.equal(await evaluate("!!document.getElementById('feitoo-ga4')"), false);
  if (consentEnabled)
    await evaluate(
      "[...document.querySelectorAll('button')].find(b => b.textContent.includes('Recusar opcionais')).click()",
    );
  await command('Page.navigate', { url: `http://127.0.0.1:${port}/` });
  await waitFor('!!document.querySelector("#tool-search")');
  await waitFor('!!document.querySelector("app-home")?.__ngContext__');
  for (const [query, count] of [
    ['excel', 4],
    ['xml', 5],
    ['produto', 2],
    ['nota', 5],
    ['nfe', 5],
    ['CONVERSÃO', 1],
    ['inexistente', 0],
    ['', 5],
  ]) {
    await evaluate(
      `(() => { const input = document.querySelector('#tool-search'); input.value = ${JSON.stringify(query)}; input.dispatchEvent(new Event('input', { bubbles: true })); })()`,
    );
    await waitFor(`document.querySelectorAll('.home-tool-card').length === ${count}`);
  }
  await evaluate(
    "document.querySelector('#tool-search').value = 'produto'; document.querySelector('#tool-search').dispatchEvent(new Event('input', { bubbles: true }))",
  );
  await waitFor("!!document.querySelector('.search-field button')");
  await evaluate("document.querySelector('.search-field button').click()");
  await waitFor(
    "document.querySelectorAll('.home-tool-card').length === 5 && document.activeElement.id === 'tool-search'",
  );
  const publicChecks = [];
  for (const [path, heading] of [
    ['/', 'Ferramentas online para XML, planilhas e arquivos.'],
    ['/seguranca', 'Segurança sem promessas vazias'],
    ['/privacidade', 'Privacidade e cookies'],
    ['/termos', 'Termos de uso'],
    ['/missing', 'Esse caminho não existe'],
    ['/login?returnTo=/xml-para-excel', 'Bom ter você aqui'],
    ['/cadastro', 'Crie sua conta'],
  ]) {
    for (const width of [320, 375, 768, 1024, 1440]) {
      await command('Emulation.setDeviceMetricsOverride', {
        width,
        height: 844,
        deviceScaleFactor: 1,
        mobile: true,
      });
      await command('Page.navigate', { url: 'http://127.0.0.1:' + port + path });
      await waitFor(
        'document.querySelector("h1")?.textContent.includes(' + JSON.stringify(heading) + ')',
      );
      assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false);
      publicChecks.push({ path, width, overflow: false });
      if (path === '/') {
        assert.equal(await evaluate('document.querySelectorAll(".home-tool-card").length'), 5);
        assert.equal(await evaluate('document.querySelectorAll(".plan-card").length'), 3);
        assert.ok(
          await evaluate('document.querySelector(".plan-pro a").getAttribute("href") === "/conta"'),
        );
        assert.ok(
          await evaluate('document.querySelector(".site-footer a[href=\\"/termos\\"]") !== null'),
        );
        if (width <= 640) {
          await evaluate('document.querySelector(".mobile-menu-toggle").click()');
          await waitFor(
            'document.querySelector(".mobile-menu-toggle").getAttribute("aria-expanded") === "true"',
          );
          assert.ok(
            await evaluate(
              'getComputedStyle(document.querySelector("#primary-nav")).display === "flex"',
            ),
          );
          assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false);
          assert.ok(
            await evaluate(
              'document.querySelector("#primary-nav").getBoundingClientRect().right <= innerWidth',
            ),
          );
          const menuShot = await command('Page.captureScreenshot', { format: 'png' });
          await writeFile(
            resolve(artifacts, `home-menu-${width}.png`),
            Buffer.from(menuShot.data, 'base64'),
          );
          await evaluate('document.querySelector("#primary-nav a").focus()');
          await command('Input.dispatchKeyEvent', {
            type: 'keyDown',
            key: 'Escape',
            code: 'Escape',
          });
          await waitFor(
            'document.querySelector(".mobile-menu-toggle").getAttribute("aria-expanded") === "false"',
          );
          assert.ok(
            await evaluate(
              'document.activeElement === document.querySelector(".mobile-menu-toggle")',
            ),
          );
        }
      }
      if (path.startsWith('/login') || path === '/cadastro' || path === '/') {
        const metrics = path === '/' ? await command('Page.getLayoutMetrics') : null;
        const shot = await command('Page.captureScreenshot', {
          format: 'png',
          ...(metrics
            ? {
                captureBeyondViewport: true,
                clip: { x: 0, y: 0, width, height: metrics.cssContentSize.height, scale: 1 },
              }
            : {}),
        });
        await writeFile(
          resolve(
            artifacts,
            `${path.startsWith('/login') ? 'login' : path === '/' ? 'home' : 'cadastro'}-${width}.png`,
          ),
          Buffer.from(shot.data, 'base64'),
        );
      }
    }
    if (path === '/') {
      await command('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
      });
      await evaluate('document.querySelector(".home-tool-card a").focus()');
      assert.ok(
        await evaluate(
          'getComputedStyle(document.querySelector(".home-tool-card")).transitionDuration === "0s" && getComputedStyle(document.querySelector(".home-tool-card")).transform === "none"',
        ),
      );
      await command('Emulation.setEmulatedMedia', { features: [] });
      await evaluate('document.querySelector(".plan-pro a").click()');
      await waitFor(
        'location.pathname === "/login" && location.search.includes("returnTo=%2Fconta") && !!document.querySelector("#email")',
      );
    }
  }
  await command('Page.navigate', { url: 'http://127.0.0.1:' + port + '/xml-para-excel' });
  await waitFor("document.body.innerText.includes('Até 250 arquivos')");
  const layouts = [];
  assert.ok(
    await evaluate(
      "document.querySelector('.account-link').getAttribute('href').includes('returnTo=%2Fxml-para-excel')",
    ),
  );
  for (const [name, width, height] of [
    ['desktop', 1440, 900],
    ['tablet', 768, 1024],
    ['mobile', 390, 844],
    ['mobile-320', 320, 844],
    ['mobile-375', 375, 844],
    ['desktop-1024', 1024, 900],
  ]) {
    await command('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: name === 'mobile',
    });
    const result = await evaluate(`(() => {
      const button = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Selecionar XMLs'));
      const rect = button.getBoundingClientRect();
      button.focus();
      return { name: '${name}', width: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth,
        selectorAboveFold: rect.bottom <= innerHeight, focusVisible: getComputedStyle(button).outlineStyle !== 'none' };
    })()`);
    assert.equal(result.overflow, false);
    assert.equal(result.selectorAboveFold, true);
    assert.equal(result.focusVisible, true);
    layouts.push(result);
    const shot = await command('Page.captureScreenshot', { format: 'png' });
    await writeFile(resolve(artifacts, `${name}.png`), Buffer.from(shot.data, 'base64'));
  }
  await command('Emulation.setDeviceMetricsOverride', {
    width: 375,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  if (launch.analyticsEnabled) {
    await evaluate("document.querySelector('.link-button').click()");
    await waitFor(
      "!![...document.querySelectorAll('button')].find(b => b.textContent.includes('Aceitar medição'))",
    );
    await evaluate(
      "[...document.querySelectorAll('button')].find(b => b.textContent.includes('Aceitar medição')).click()",
    );
    await waitFor("!!document.getElementById('feitoo-ga4')");
  }
  await evaluate(`(() => {
    const input = document.querySelector('#xml-files'); const transfer = new DataTransfer();
    transfer.items.add(new File(['<synthetic/>'], 'nfe.xml', { type: 'application/xml' }));
    transfer.items.add(new File(['<synthetic/>'], 'recusado.xml', { type: 'application/xml' }));
    input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await waitFor("document.body.innerText.includes('2 arquivos selecionados')");
  const clickText = (text) =>
    evaluate(
      `([...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(text)})).click()`,
    );
  await clickText('Entre para continuar');
  await waitFor("document.body.innerText.includes('Continuar com Google')");
  await clickText('Entrar com e-mail');
  await waitFor("document.querySelector('#email') !== null");
  assert.ok(
    await evaluate("document.body.innerText.includes('continuar seu processamento de XMLs')"),
  );
  await evaluate("document.querySelector('.auth-submit').click()");
  await waitFor("document.querySelector('#email-error').textContent.includes('Informe')");
  assert.equal(
    await evaluate("document.querySelector('#email').getAttribute('aria-invalid')"),
    'true',
  );
  rejectLoginOnce = true;
  await evaluate(`(() => {
    for (const [selector, value] of [['#email', 'synthetic@example.test'], ['#password', 'synthetic-password']]) {
      const input = document.querySelector(selector); input.value = value; input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    document.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  })()`);
  await waitFor("document.querySelector('.auth-submit').textContent.includes('Entrando')");
  assert.equal(await evaluate('document.querySelector("fieldset").disabled'), true);
  const loadingShot = await command('Page.captureScreenshot', { format: 'png' });
  await writeFile(resolve(artifacts, 'login-loading.png'), Buffer.from(loadingShot.data, 'base64'));
  await waitFor("document.body.innerText.includes('E-mail ou senha inválidos')");
  assert.equal(await evaluate('document.querySelector("fieldset").disabled'), false);
  const errorShot = await command('Page.captureScreenshot', { format: 'png' });
  await writeFile(resolve(artifacts, 'login-error.png'), Buffer.from(errorShot.data, 'base64'));
  await evaluate("document.querySelector('.password-toggle').click()");
  assert.equal(await evaluate("document.querySelector('#password').type"), 'text');
  await evaluate(
    "document.querySelector('.password-toggle').click(); document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))",
  );
  await waitFor("document.body.innerText.includes('Seu Excel está pronto')");
  const previewLayouts = [];
  for (const width of [320, 375, 390, 768, 1440]) {
    await command('Emulation.setDeviceMetricsOverride', {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: width < 768,
    });
    assert.equal(await evaluate('document.querySelectorAll("table").length'), 3);
    assert.ok(
      await evaluate(
        'document.body.innerText.includes("NF-e 100 · Série 001") && document.body.innerText.includes("NF-e 101 · Série 001")',
      ),
    );
    assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false);
    assert.ok(
      await evaluate(
        'document.querySelector(".result-download").getBoundingClientRect().width <= innerWidth',
      ),
    );
    assert.ok(await evaluate('document.body.innerText.includes("Mostrando 10 de 12 itens")'));
    const tableLayout = await evaluate(
      'Array.from(document.querySelectorAll(".preview-scroll")).map(el => ({ width: el.clientWidth, scroll: el.scrollWidth }))',
    );
    previewLayouts.push({ width, overflow: false, tables: tableLayout });
  }
  await command('Emulation.setDeviceMetricsOverride', {
    width: 375,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await clickText('Ver arquivos que não puderam ser processados');
  await waitFor("document.body.innerText.includes('Documento não suportado')");
  assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false);
  const shot = await command('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
  });
  await writeFile(resolve(artifacts, 'mobile-result.png'), Buffer.from(shot.data, 'base64'));
  await clickText('Excluir arquivos');
  await waitFor("document.body.innerText.includes('Seus arquivos e o Excel foram excluídos')");
  if (launch.analyticsEnabled) {
    const events = await evaluate('JSON.stringify(window.dataLayer)');
    for (const secret of [
      'nfe.xml',
      'recusado.xml',
      'synthetic@example.test',
      'synthetic-batch',
      'Pessoa Teste',
    ])
      assert.ok(!events.includes(secret));
    assert.ok(events.includes('processing_completed'));
    assert.ok(events.includes('files_deleted'));
    await evaluate("document.querySelector('.link-button').click()");
    await waitFor(
      "!![...document.querySelectorAll('button')].find(b => b.textContent.includes('Recusar opcionais'))",
    );
    await evaluate(
      "[...document.querySelectorAll('button')].find(b => b.textContent.includes('Recusar opcionais')).click()",
    );
    assert.equal(await evaluate("!!document.getElementById('feitoo-ga4')"), false);
  }
  // Account workflow uses only the same synthetic session/API server.
  await evaluate(
    'document.querySelector(".account-menu").open = true; document.querySelector(".account-menu a").click()',
  );
  await waitFor(
    '!!document.querySelector("#account-name") && document.querySelectorAll(".history-row").length === 10',
  );
  const accountLayouts = [];
  for (const width of [320, 375, 768, 1024, 1440]) {
    await command('Emulation.setDeviceMetricsOverride', {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: width < 768,
    });
    assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false);
    assert.equal(await evaluate('document.querySelector("#account-email").readOnly'), true);
    if (width < 768) {
      assert.equal(
        await evaluate(
          'getComputedStyle(document.querySelector(".account-commercial")).gridTemplateColumns.split(" ").length',
        ),
        1,
      );
    }
    assert.ok(
      await evaluate(
        'document.querySelectorAll(".history-info")[0].innerText.includes("Total fiscal: R$ 8.742,19")',
      ),
    );
    assert.ok(
      await evaluate(
        'document.querySelectorAll(".history-info")[1].innerText.includes("Total fiscal: R$ 9.007.199.254.740.993,29")',
      ),
    );
    assert.equal(
      await evaluate(
        'document.querySelectorAll(".history-info")[2].innerText.includes("Total fiscal:")',
      ),
      false,
    );
    const shot = await command('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
    });
    await writeFile(resolve(artifacts, `account-${width}.png`), Buffer.from(shot.data, 'base64'));
    accountLayouts.push({ width, overflow: false });
  }
  const setInputs = (values) =>
    evaluate(`(() => {
    for (const [selector, value] of ${JSON.stringify(values)}) {
      const input = document.querySelector(selector); input.value = value; input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  })()`);
  await setInputs([['#account-name', 'Pessoa Atualizada']]);
  await clickText('Salvar nome');
  await waitFor('document.body.innerText.includes("Salvando…")');
  await waitFor('document.body.innerText.includes("Nome atualizado.")');
  assert.equal(accountUser.name, 'Pessoa Atualizada');
  assert.ok(
    await evaluate(
      'document.querySelector(".account-menu div").textContent.includes("Pessoa Atualizada")',
    ),
  );
  assert.equal(await evaluate('document.querySelector(".password-disclosure").open'), false);
  await evaluate('document.querySelector(".password-disclosure summary").click()');
  assert.equal(await evaluate('document.querySelector(".password-disclosure").open'), true);
  await setInputs([
    ['#account-current-password', 'incorrect-password'],
    ['#account-password', 'new-synthetic-password'],
    ['#account-confirmation', 'new-synthetic-password'],
  ]);
  await clickText('Atualizar senha');
  await waitFor('document.body.innerText.includes("A senha atual não confere.")');
  await setInputs([['#account-current-password', 'synthetic-password']]);
  await clickText('Atualizar senha');
  await waitFor('document.body.innerText.includes("Atualizando senha…")');
  await waitFor('document.body.innerText.includes("Senha atualizada.")');
  assert.equal(accountPassword, 'new-synthetic-password');
  assert.equal(await evaluate('document.querySelector("#account-password").value'), '');
  await clickText('Próxima');
  await waitFor('document.querySelectorAll(".history-row").length === 2');
  await clickText('Anterior');
  await waitFor('document.querySelectorAll(".history-row").length === 10');
  assert.ok(await evaluate('document.body.innerText.includes("Resultado expirado")'));
  assert.ok(await evaluate('document.body.innerText.includes("Arquivos excluídos")'));
  assert.ok(
    await evaluate('document.querySelector(".history-row").textContent.includes("1 com erro")'),
  );
  await clickText('Baixar Excel');
  await waitFor('document.body.innerText.includes("Download iniciado.")');
  assert.equal(accountDownloads, 1);
  await clickText('Excluir arquivos');
  await waitFor('!!document.querySelector(".delete-confirmation")');
  await command('Emulation.setDeviceMetricsOverride', {
    width: 320,
    height: 900,
    deviceScaleFactor: 1,
    mobile: true,
  });
  assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false);
  assert.ok(await evaluate('document.activeElement.textContent.includes("Confirmar exclusão")'));
  await clickText('Cancelar');
  assert.equal(accountDeletes, 0);
  assert.ok(await evaluate('document.activeElement.textContent.includes("Excluir arquivos")'));
  await clickText('Excluir arquivos');
  await waitFor('!!document.querySelector(".delete-confirmation")');
  await clickText('Confirmar exclusão');
  await waitFor('document.body.innerText.includes("O registro permanece no histórico.")');
  assert.equal(accountDeletes, 1);
  assert.equal(await evaluate('document.querySelectorAll(".history-row").length'), 10);
  assert.equal(
    await evaluate('document.querySelector(".history-row").textContent.includes("Baixar Excel")'),
    false,
  );
  emptyHistory = true;
  await clickText('Atualizar histórico');
  await waitFor('document.body.innerText.includes("Você ainda não fez nenhum processamento")');
  const emptyShot = await command('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
  });
  await writeFile(resolve(artifacts, 'account-empty.png'), Buffer.from(emptyShot.data, 'base64'));
  accountUser = { ...accountUser, has_password: false };
  await command('Page.navigate', { url: 'http://127.0.0.1:' + port + '/conta' });
  await waitFor('document.body.innerText.includes("Você entra com Google")');
  assert.equal(await evaluate('document.querySelector("#account-password") === null'), true);
  await evaluate('document.querySelector(".account-menu").open = true');
  await clickText('Sair');
  await waitFor('!!document.querySelector("#email")');
  assert.equal(loggedIn, false);
  await command('Page.navigate', { url: 'http://127.0.0.1:' + port + '/conta' });
  await waitFor('location.pathname === "/login" && location.search.includes("returnTo=%2Fconta")');
  accountUser = { ...accountUser, has_password: true };
  await setInputs([
    ['#email', 'synthetic@example.test'],
    ['#password', 'new-synthetic-password'],
  ]);
  await clickText('Entrar');
  await waitFor('location.pathname === "/conta" && !!document.querySelector("#account-name")');
  dailyUsed = 45;
  await command('Page.navigate', { url: 'http://127.0.0.1:' + port + '/xml-para-excel' });
  await waitFor("document.body.innerText.includes('Você ainda pode processar 5 XMLs hoje')");
  const selectSynthetic = async (count) =>
    evaluate(`(() => {
    const transfer = new DataTransfer();
    for (let i = 0; i < ${count}; i++) transfer.items.add(new File(['<document/>'], 'synthetic-' + i + '.xml', { type: 'text/xml' }));
    const input = document.querySelector('#xml-files'); input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await selectSynthetic(37);
  await waitFor("document.body.innerText.includes('Processar 5 grátis')");
  const paywallLayouts = [];
  for (const width of [320, 375, 768, 1024, 1440]) {
    await command('Emulation.setDeviceMetricsOverride', {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: width < 768,
    });
    assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false);
    const shot = await command('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
    });
    await writeFile(resolve(artifacts, `paywall-${width}.png`), Buffer.from(shot.data, 'base64'));
    paywallLayouts.push({ width, overflow: false });
  }
  await clickText('Limpar seleção');
  await selectSynthetic(147);
  await waitFor("document.body.innerText.includes('Até 250 XMLs neste processamento')");
  dailyUsed = 50;
  await command('Page.navigate', { url: 'http://127.0.0.1:' + port + '/xml-para-excel' });
  await waitFor("document.body.innerText.includes('Você ainda pode processar 0 XMLs hoje')");
  await selectSynthetic(1);
  await waitFor("document.body.innerText.includes('Ele será renovado à meia-noite')");
  dailyUsed = 45;
  await command('Page.navigate', {
    url: `http://127.0.0.1:${port}/xml-para-excel?processing=${billingId}&payment=cancelled`,
  });
  await waitFor("document.body.innerText.includes('Pagamento não concluído')");
  assert.equal(billingStarts, 0);
  await command('Page.navigate', {
    url: `http://127.0.0.1:${port}/xml-para-excel?processing=${billingId}&payment=success`,
  });
  await waitFor("document.body.innerText.includes('Confirmando seu pagamento')");
  assert.equal(billingStarts, 0);
  paymentStatus = 'paid';
  await waitFor("document.body.innerText.includes('Seu Excel está pronto')");
  assert.equal(billingStarts, 1);
  assert.equal(dailyUsed, 45);
  await writeFile(
    resolve(artifacts, 'monetization-browser-report.json'),
    JSON.stringify(
      {
        paywallLayouts,
        package147: 'xml_250',
        freeExhausted: true,
        cancelledNoStart: true,
        redirectIsNotPaymentTruth: true,
        confirmedStart: true,
        noFreeConsumption: true,
        syntheticOnly: true,
      },
      null,
      2,
    ),
  );
  subscriptionScenario = 'activation';
  subscriptionRequests = [];
  subscriptionAccountRequests = [];
  await command('Page.navigate', { url: `http://127.0.0.1:${port}/conta?subscription=confirming` });
  await waitFor('document.body.innerText.includes("Confirmando sua assinatura")');
  assert.ok(
    await evaluate(
      'Array.from(document.querySelectorAll("button")).find(b => b.textContent.includes("Consultar confirmação")).disabled',
    ),
  );
  await waitFor('document.body.innerText.includes("Feitoo Pro ativado.")');
  const pollingIntervals = subscriptionRequests
    .slice(1)
    .map((time, index) => time - subscriptionRequests[index]);
  assert.equal(subscriptionRequests.length, 3);
  assert.ok(pollingIntervals.every((ms) => ms >= 2900));
  await new Promise((done) => setTimeout(done, 3400));
  assert.equal(subscriptionRequests.length, 3);
  assert.equal(
    subscriptionAccountRequests.filter((path) => path === '/api/account/usage').length,
    2,
  );
  assert.equal(
    subscriptionAccountRequests.filter((path) => path === '/api/account/purchases').length,
    1,
  );
  assert.equal(subscriptionAccountRequests.filter((path) => path === '/api/processings').length, 1);
  subscriptionScenario = 'limited';
  subscriptionRequests = [];
  await command('Page.navigate', { url: `http://127.0.0.1:${port}/conta?subscription=confirming` });
  await waitFor(
    'document.body.innerText.includes("Estamos consultando a confirmação com muita frequência")',
  );
  await new Promise((done) => setTimeout(done, 3400));
  assert.equal(subscriptionRequests.length, 1);
  await writeFile(
    resolve(artifacts, 'subscription-polling-browser-report.json'),
    JSON.stringify(
      {
        pollingIntervals,
        stoppedAfterActivation: true,
        stoppedAfter429: true,
        manualButtonDisabled: true,
        oneUsageRefresh: true,
        noRepeatedAccountReload: true,
        syntheticOnly: true,
      },
      null,
      2,
    ),
  );
  subscriptionScenario = null;
  const redesignLayouts = [];
  emptyHistory = false;
  const active = {
    status: 'active',
    grants_pro: true,
    current_period_end: '2026-11-10T12:00:00Z',
    cancel_at_period_end: false,
  };
  const purchase = {
    id: 'visual-purchase',
    processing_id: billingId,
    tool: 'xml-to-excel',
    package_code: 'xml_100',
    files_limit: 100,
    files_count: 37,
    amount: 490,
    currency: 'brl',
    status: 'paid',
    consumed: true,
    paid_at: '2026-10-10T12:10:00Z',
    expires_at: '2026-10-11T12:10:00Z',
    created_at: '2026-10-10T12:10:00Z',
  };
  for (const [name, scenario] of Object.entries({
    free: { pro: false, used: 4 },
    'free-near-limit': { pro: false, used: 45 },
    'free-limit': { pro: false, used: 50 },
    pro: { pro: true, used: 126, subscription: active, purchases: [purchase] },
    cancellation: { pro: true, used: 126, subscription: { ...active, cancel_at_period_end: true } },
    payment: {
      pro: false,
      used: 4,
      subscription: { ...active, status: 'past_due', grants_pro: false },
      purchases: [purchase],
    },
  })) {
    accountVisual = scenario;
    await command('Page.navigate', { url: `http://127.0.0.1:${port}/conta` });
    await waitFor(
      '!!document.querySelector("progress") && document.body.innerText.includes("restantes")',
    );
    if (name === 'payment')
      assert.ok(await evaluate('document.body.innerText.includes("Atualizar pagamento")'));
    if (name === 'cancellation')
      assert.ok(
        await evaluate(
          'document.body.innerText.includes("Depois disso, sua conta voltará ao plano Free.")',
        ),
      );
    for (const width of [320, 375, 768, 1024, 1440]) {
      await command('Emulation.setDeviceMetricsOverride', {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: width < 768,
      });
      assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false);
      const shot = await command('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: true,
      });
      await writeFile(
        resolve(artifacts, `account-${name}-${width}.png`),
        Buffer.from(shot.data, 'base64'),
      );
      redesignLayouts.push({ scenario: name, width, overflow: false });
    }
  }
  await writeFile(
    resolve(artifacts, 'account-redesign-report.json'),
    JSON.stringify(redesignLayouts, null, 2),
  );
  accountVisual = null;
  // Home presentation remains useful for a signed-in user and links to existing flows.
  loggedIn = true;
  await command('Page.navigate', { url: `http://127.0.0.1:${port}/` });
  await waitFor(
    '!!document.querySelector(".account-menu") && document.querySelector(".plan-pro a")?.getAttribute("href") === "/conta"',
  );
  assert.ok(await evaluate('!!document.querySelector("#tool-search")'));
  const homeLayouts = [];
  for (const width of [320, 375, 768, 1024, 1440]) {
    await command('Emulation.setDeviceMetricsOverride', {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: width < 768,
    });
    assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false);
    const metrics = await command('Page.getLayoutMetrics');
    const shot = await command('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width, height: metrics.cssContentSize.height, scale: 1 },
    });
    await writeFile(
      resolve(artifacts, `home-authenticated-${width}.png`),
      Buffer.from(shot.data, 'base64'),
    );
    homeLayouts.push({ state: 'authenticated', width, overflow: false });
  }
  await evaluate('document.querySelector("#primary-nav a").click()');
  await waitFor(
    'location.hash === "#ferramentas" && document.querySelector("#ferramentas").getBoundingClientRect().top < 100',
  );
  await evaluate(
    '[...document.querySelectorAll("app-tool-card a")].find(a => a.getAttribute("href") === "/produtos-dos-xmls").click()',
  );
  await waitFor(
    'location.pathname === "/produtos-dos-xmls" && !!document.querySelector("#xml-files")',
  );
  await command('Page.navigate', { url: `http://127.0.0.1:${port}/` });
  await waitFor(
    '!!document.querySelector(".account-menu") && document.querySelector(".plan-pro a")?.textContent.includes("Assinar Pro")',
  );
  await evaluate('document.querySelector(".plan-pro a").click()');
  await waitFor('location.pathname === "/conta" && !!document.querySelector("#account-name")');
  await writeFile(
    resolve(artifacts, 'home-browser-report.json'),
    JSON.stringify(
      {
        layouts: [
          ...publicChecks
            .filter((check) => check.path === '/')
            .map((check) => ({ ...check, state: 'guest' })),
          ...homeLayouts,
        ],
        search: true,
        searchClearFocus: true,
        toolLinks: true,
        toolsAnchor: true,
        proAccountLink: true,
        proGuestLoginReturn: true,
        reducedMotion: true,
        mobileMenu: true,
        keyboardEscape: true,
        fullPageScreenshots: true,
      },
      null,
      2,
    ),
  );
  // New tool uses the same synthetic upload, auth, queue polling and result endpoints.
  loggedIn = false;
  dailyUsed = 0;
  batch.tool = 'products-from-xml';
  polls = 0;
  await command('Page.navigate', { url: `http://127.0.0.1:${port}/produtos-dos-xmls` });
  await waitFor(
    'document.querySelector("h1")?.innerText === "Extrair produtos de XMLs NF-e" && !!document.querySelector("#xml-files") && !document.querySelector(".account-menu")',
  );
  const productsLayouts = [];
  for (const width of [320, 375, 768, 1024, 1440]) {
    await command('Emulation.setDeviceMetricsOverride', {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: width < 768,
    });
    assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false);
    assert.ok(
      await evaluate(
        '[...document.querySelectorAll("button")].find(b => b.innerText === "Selecionar XMLs").getBoundingClientRect().bottom < innerHeight',
      ),
    );
    const shot = await command('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
    });
    await writeFile(
      resolve(artifacts, `products-public-${width}.png`),
      Buffer.from(shot.data, 'base64'),
    );
    productsLayouts.push({ state: 'public', width, overflow: false });
  }
  await evaluate(`(() => {
    const input = document.querySelector('#xml-files'); const transfer = new DataTransfer();
    transfer.items.add(new File(['<synthetic/>'], 'synthetic-products.xml', { type: 'application/xml' }));
    transfer.items.add(new File(['<synthetic/>'], 'synthetic-invalid.xml', { type: 'application/xml' }));
    input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await clickText('Entre para continuar');
  await clickText('Entrar com e-mail');
  await waitFor('!!document.querySelector("#email")');
  assert.ok(await evaluate('location.search.includes("produtos-dos-xmls")'));
  await evaluate(`(() => {
    for (const [selector, value] of [['#email', 'synthetic@example.test'], ['#password', ${JSON.stringify(accountPassword)}]]) {
      const input = document.querySelector(selector); input.value = value; input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    document.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  })()`);
  await waitFor(
    'location.pathname === "/produtos-dos-xmls" && document.body.innerText.includes("Seus produtos estão prontos")',
  );
  assert.ok(await evaluate('document.body.innerText.includes("Produtos diferentes")'));
  for (const mode of ['Consolidado', 'Detalhado']) {
    await clickText(mode);
    assert.equal(
      await evaluate('document.querySelectorAll(".preview-section tbody tr").length'),
      10,
    );
    for (const width of [320, 375, 768, 1024, 1440]) {
      await command('Emulation.setDeviceMetricsOverride', {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: width < 768,
      });
      assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false);
      const shot = await command('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: true,
      });
      await writeFile(
        resolve(artifacts, `products-${mode.toLowerCase()}-${width}.png`),
        Buffer.from(shot.data, 'base64'),
      );
      productsLayouts.push({ state: mode, width, overflow: false });
    }
  }
  assert.ok(await evaluate('document.body.innerText.includes("arquivo não pôde ser processado")'));
  await clickText('Ver arquivos que não puderam ser processados');
  await waitFor('document.body.innerText.includes("Documento não suportado")');
  await clickText('Baixar Excel');
  await waitFor(
    '[...document.querySelectorAll("button")].some(b => b.innerText === "Baixar Excel" && !b.disabled)',
  );
  await evaluate(`window.pdfCapture = null;
    const originalCreate = URL.createObjectURL;
    URL.createObjectURL = blob => { window.pdfCapture = blob; return originalCreate(blob); };`);
  await clickText('Baixar PDF');
  await waitFor('window.pdfCapture?.type === "application/pdf"');
  const pdf = await evaluate('window.pdfCapture.text()');
  assert.ok(pdf.startsWith('%PDF-1.4'));
  assert.ok(pdf.includes('startxref'));
  await writeFile(resolve(artifacts, 'products-summary.pdf'), pdf);
  await writeFile(
    resolve(artifacts, 'products-browser-report.json'),
    JSON.stringify(
      {
        layouts: productsLayouts,
        loginReturn: true,
        processing: true,
        previewModes: true,
        pdfDownload: true,
        partialFailure: true,
        download: true,
      },
      null,
      2,
    ),
  );
  const accountReport = {
    accountLayouts,
    profile: true,
    password: true,
    pagination: true,
    partial: true,
    expired: true,
    download: true,
    deleteConfirmation: true,
    preservedHistory: true,
    empty: true,
    googleOnly: true,
    logout: true,
    guardedReturn: true,
    loginReturnWithNewPassword: true,
    runtimeErrors: errors,
  };
  await writeFile(
    resolve(artifacts, 'account-browser-report.json'),
    JSON.stringify(accountReport, null, 2),
  );
  assert.equal(errors.length, 0);
  const report = {
    previewLayouts,
    accountReport,
    layouts,
    publicChecks,
    selectionLoginResume: true,
    authErrorsLoadingAndPassword: true,
    partialResult: true,
    safeFileErrors: true,
    deletion: true,
    runtimeErrors: errors,
    consentAndSafeEvents: launch.analyticsEnabled,
  };
  await writeFile(
    resolve(
      artifacts,
      launch.analyticsEnabled ? 'browser-report-consent.json' : 'browser-report.json',
    ),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
  await send('Browser.close');
} finally {
  socket?.close();
  edge.kill();
  server.close();
}
