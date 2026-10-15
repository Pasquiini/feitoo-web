// Smoke test of the production Angular build with synthetic API responses.
// Backend ZIP contents and billing are exercised separately in XmlOrganizerTest.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';

const root = resolve('dist/feitoo-web/browser');
const artifacts = resolve('dist/validation');
await mkdir(artifacts, { recursive: true });
const now = new Date().toISOString();
const batch = {
  id: 'synthetic-organizer',
  tool: 'xml-organizer',
  status: 'pending',
  files_count: 0,
  processed_files_count: 0,
  successful_files_count: 0,
  failed_files_count: 0,
  total_size: 20,
  started_at: null,
  completed_at: null,
  created_at: now,
  expires_at: new Date(Date.now() + 7200000).toISOString(),
  result: { available: false, file_name: null, size: null, error_message: null },
};
let options;
let polls = 0;
let downloads = 0;
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (path === '/sanctum/csrf-cookie') {
      response.writeHead(204).end();
      return;
    }
    if (path.startsWith('/api/')) {
      response.setHeader('Content-Type', 'application/json');
      let body;
      if (path === '/api/me')
        body = {
          data: {
            id: 1,
            name: 'Pessoa Teste',
            email: 'synthetic@example.test',
            has_password: true,
            google_linked: false,
            created_at: now,
          },
        };
      else if (path.endsWith('/config'))
        body = {
          data: {
            max_files: 20,
            max_processing_files: 250,
            max_file_size_kb: 10240,
            ttl_minutes: 120,
            free: { per_processing: 20, daily: 50 },
            packages: [],
            checkout_available: false,
          },
        };
      else if (path === '/api/account/usage')
        body = {
          data: {
            plan: 'free',
            limits: {
              per_processing: 20,
              daily: 50,
              remaining_today: 50,
              used_today: 0,
              resets_at: new Date(Date.now() + 86400000).toISOString(),
            },
          },
        };
      else if (path === '/api/processings' && request.method === 'POST') {
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        const input = JSON.parse(Buffer.concat(chunks).toString());
        assert.equal(input.tool, 'xml-organizer');
        options = input.organizer;
        batch.organizer = { options, summary: null };
        body = { data: batch };
      } else if (path.endsWith('/files') && request.method === 'POST') {
        for await (const chunk of request) {
          /* consume multipart upload */
        }
        batch.files_count = 2;
        body = { data: batch };
      } else if (path.endsWith('/start')) {
        batch.status = 'queued';
        body = { data: batch };
      } else if (path.endsWith('/files'))
        body = {
          data: [
            {
              id: 'first',
              original_name: 'nota-sintetica.xml',
              status: 'completed',
              size: 10,
              processed_at: now,
              error_code: null,
              error_message: null,
              organization: {
                archive_path: '2026/10/Fornecedor_A/NFe_sintetica.xml',
                notes: [],
                duplicate_kind: null,
                key_conflict: false,
              },
            },
            {
              id: 'second',
              original_name: 'arquivo-com-problema.xml',
              status: 'failed',
              size: 10,
              processed_at: now,
              error_code: 'invalid_xml',
              error_message: 'XML inválido.',
              organization: {
                archive_path: 'Arquivos_Com_Problemas/Outros/arquivo-com-problema.xml',
                notes: ['Original preservado sem alteração.'],
                duplicate_kind: null,
                key_conflict: false,
              },
            },
          ],
        };
      else if (path.endsWith('/result')) {
        downloads++;
        response.setHeader('Content-Type', 'application/zip');
        response.setHeader('Content-Disposition', 'attachment; filename="XMLs_Organizados.zip"');
        response.end('PK-synthetic-browser-fixture');
        return;
      } else if (path === '/api/processings/synthetic-organizer') {
        if (++polls >= 1) {
          Object.assign(batch, {
            status: 'completed',
            processed_files_count: 2,
            successful_files_count: 1,
            failed_files_count: 1,
            result: {
              available: true,
              file_name: 'XMLs_Organizados.zip',
              size: 100,
              error_message: null,
            },
            organizer: {
              options,
              summary: {
                total_files: 2,
                organized_count: 1,
                invalid_count: 1,
                preserved_count: 2,
                suppliers_count: 1,
                duplicates_count: 0,
                conflicting_keys_count: 0,
                warnings_count: 1,
                duplicate_detection: true,
                documents_by_month: { '2026/10': 1 },
                notice: 'Status atual na SEFAZ não consultado.',
              },
            },
          });
        }
        body = { data: batch };
      } else {
        response.writeHead(404).end('{}');
        return;
      }
      response.end(JSON.stringify(body));
      return;
    }
    const file = resolve(root, '.' + path);
    if (!file.startsWith(root + '\\') && !file.startsWith(root + '/') && file !== root) {
      response.writeHead(403).end();
      return;
    }
    const actual = extname(file) ? file : resolve(file, 'index.html');
    const content = await readFile(actual);
    response.setHeader(
      'Content-Type',
      {
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.html': 'text/html',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
      }[extname(actual)] ?? 'application/octet-stream',
    );
    response.end(
      extname(actual) === '.js'
        ? content.toString().replaceAll('https://api.feitoo.com.br', `http://127.0.0.1:${port}`)
        : content,
    );
  } catch (error) {
    response.writeHead(500).end(String(error));
  }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const port = server.address().port;
const edge = spawn(
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${resolve(artifacts, 'organizer-edge-' + process.pid)}`,
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
    const timer = setTimeout(() => reject(new Error('Browser startup timed out')), 20000);
    edge.stderr.on('data', (data) => {
      const found = /DevTools listening on (ws:\/\/\S+)/.exec(data.toString());
      if (found) {
        clearTimeout(timer);
        done(found[1]);
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
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const task = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(task.timer);
      message.error ? task.reject(new Error(message.error.message)) : task.done(message.result);
    } else if (message.method === 'Runtime.exceptionThrown')
      errors.push(message.params.exceptionDetails.text);
  };
  const send = (method, params = {}, sessionId) =>
    new Promise((done, reject) => {
      const requestId = ++id;
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error('CDP timed out: ' + method));
      }, 10000);
      pending.set(requestId, { done, reject, timer });
      socket.send(
        JSON.stringify({ id: requestId, method, params, ...(sessionId ? { sessionId } : {}) }),
      );
    });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const command = (method, params) => send(method, params, sessionId);
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
    for (let i = 0; i < 100; i++) {
      if (await evaluate(expression)) return;
      await new Promise((done) => setTimeout(done, 100));
    }
    throw new Error('Condition timed out: ' + expression);
  };
  const screenshot = async (name) => {
    const { data } = await command('Page.captureScreenshot', { captureBeyondViewport: true });
    await writeFile(resolve(artifacts, name), Buffer.from(data, 'base64'));
  };
  await command('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await command('Page.navigate', { url: `http://127.0.0.1:${port}/organizar-xml` });
  await waitFor(
    '!!document.querySelector("#organizer-criterion") && !document.querySelector("#xml-files").disabled',
  );
  await waitFor('document.body.innerText.includes("Você ainda pode processar")');
  assert.equal(
    await evaluate('document.querySelectorAll("#organizer-criterion option").length'),
    5,
  );
  assert.equal(
    await evaluate('document.body.innerText.includes("NF-e 55 e NFC-e 65 em UTF-8")'),
    true,
  );
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
  await screenshot('organizer-desktop.png');
  await command('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
  await screenshot('organizer-mobile.png');
  await evaluate(`(() => {
    const select = document.querySelector('#organizer-criterion'); select.value = 'year_month_supplier'; select.dispatchEvent(new Event('change', { bubbles: true }));
    const input = document.querySelector('#xml-files'); const transfer = new DataTransfer();
    transfer.items.add(new File(['<NFe/>'], 'nota-sintetica.xml', { type: 'application/xml' }));
    transfer.items.add(new File(['<broken>'], 'arquivo-com-problema.xml', { type: 'application/xml' }));
    input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await waitFor(
    '[...document.querySelectorAll("button")].some(b => b.textContent.trim() === "Organizar XMLs")',
  );
  await evaluate(
    '[...document.querySelectorAll("button")].find(b => b.textContent.trim() === "Organizar XMLs").click()',
  );
  await waitFor('document.body.innerText.includes("Organização concluída parcialmente")');
  assert.equal(await evaluate('document.body.innerText.includes("Seu ZIP está pronto")'), true);
  assert.equal(await evaluate('document.body.innerText.includes("Seu Excel está pronto")'), false);
  assert.equal(options.criterion, 'year_month_supplier');
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
  assert.equal(
    await evaluate(
      'document.body.innerText.includes("Arquivos_Com_Problemas/Outros/arquivo-com-problema.xml")',
    ),
    true,
  );
  await screenshot('organizer-mobile-result.png');
  await command('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await screenshot('organizer-desktop-result.png');
  await evaluate(
    '[...document.querySelectorAll("button")].find(b => b.textContent.trim() === "Baixar ZIP organizado").click()',
  );
  await waitFor('document.body.innerText.includes("Baixar ZIP organizado")');
  await new Promise((done) => setTimeout(done, 300));
  assert.equal(downloads, 1);
  assert.deepEqual(errors, []);
  console.log(
    'Organizer browser smoke passed: desktop 1440px, mobile 390px, options, upload, partial result and ZIP download.',
  );
} finally {
  socket?.close();
  edge.kill();
  server.close();
}
