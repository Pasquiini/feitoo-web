import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { withBrowser } from './browser-smoke.mjs';

const root = resolve('dist/feitoo-web/browser');
const artifacts = resolve('dist/validation/monetization-optimization');
await mkdir(artifacts, { recursive: true });
let tool,
  batch,
  purchase,
  starts,
  uploads,
  authenticated = true;
function reset(id) {
  tool = id;
  starts = 0;
  uploads = [];
  batch = {
    id: '12345678-1234-4234-8234-123456789abc',
    tool,
    status: 'pending',
    files_count: 0,
    processed_files_count: 0,
    successful_files_count: 0,
    failed_files_count: 0,
    total_size: 100,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 7200000).toISOString(),
    result: { available: false },
  };
  purchase = {
    id: '12345678-1234-4234-8234-123456789abd',
    processing_id: batch.id,
    tool,
    package_code: 'xml_100',
    files_limit: 100,
    files_count: 40,
    amount: 490,
    currency: 'brl',
    status: 'pending',
    consumed: false,
    expires_at: batch.expires_at,
  };
}
const config = {
  max_files: 20,
  max_processing_files: 250,
  max_request_size_kb: 30720,
  max_total_size_kb: 40960,
  max_processing_items: 4000,
  max_file_size_kb: 10240,
  ttl_minutes: 120,
  free: { per_processing: 3, daily: 6 },
  packages: [
    { code: 'xml_100', files_limit: 100, amount: 490, currency: 'brl' },
    { code: 'xml_250', files_limit: 250, amount: 690, currency: 'brl' },
  ],
  checkout_available: true,
};
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path.startsWith('/api/') || path === '/sanctum/csrf-cookie') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks).toString();
      res.setHeader('Content-Type', 'application/json');
      let data;
      if (path === '/api/me') {
        if (!authenticated) return void res.writeHead(401).end('{}');
        data = {
          id: 1,
          name: 'Synthetic',
          email: 'synthetic@example.test',
          email_verified_at: new Date().toISOString(),
        };
      } else if (path.endsWith('/config')) data = config;
      else if (path === '/api/account/usage')
        data = {
          plan: 'free',
          limits: {
            per_processing: 3,
            daily: 6,
            used_today: 0,
            remaining_today: 6,
            resets_at: new Date(Date.now() + 86400000).toISOString(),
          },
        };
      else if (path === '/api/processings' && req.method === 'POST') data = batch;
      else if (path.endsWith('/files') && req.method === 'POST') {
        const names = [...body.matchAll(/filename="([^"]+)"/g)].map((m) => m[1]);
        uploads.push(...names);
        batch.files_count += names.length;
        data = batch;
      } else if (path.endsWith('/purchase') && req.method === 'POST')
        data = { purchase, checkout_url: null };
      else if (path.endsWith('/purchase')) data = purchase;
      else if (path.endsWith('/start')) {
        starts++;
        batch.status = 'queued';
        data = batch;
      } else if (path === '/api/processings/' + batch.id) data = batch;
      else if (path === '/api/auth/google/start') return void res.writeHead(503).end('{}');
      else return void res.end('{}');
      return void res.end(JSON.stringify({ data }));
    }
    const file = resolve(root, '.' + path);
    if (!file.startsWith(root + '\\') && !file.startsWith(root + '/') && file !== root)
      return void res.writeHead(403).end();
    const actual = extname(file) ? file : resolve(file, 'index.html');
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
  } catch (error) {
    res.writeHead(500).end(String(error));
  }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const port = server.address().port;
try {
  await withBrowser('monetization-optimization', async ({ command, evaluate, waitFor, errors }) => {
    const click = (text) =>
      evaluate(
        `[...document.querySelectorAll('button')].find(b => b.textContent.trim().startsWith(${JSON.stringify(text)})).click()`,
      );
    const select = (count) =>
      evaluate(
        `(() => { const input=document.querySelector('input[type=file]'); const transfer=new DataTransfer(); for(let i=0;i<${count};i++)transfer.items.add(new File(['<document/>'],'synthetic-'+i+'.xml'));input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true})); })()`,
      );
    const navigate = async (path) => {
      await command('Page.navigate', { url: `http://127.0.0.1:${port}${path}` });
      await waitFor(
        path.includes('?processing=')
          ? '!!document.querySelector(".tool-limits")'
          : '!!document.querySelector("input[type=file]") && !document.querySelector("input[type=file]").disabled',
      );
    };
    const layouts = [];
    for (const [id, path] of [
      ['xml-to-excel', '/xml-para-excel'],
      ['products-from-xml', '/produtos-dos-xmls'],
    ]) {
      for (const count of [1, 3, 4, 40, 100, 250]) {
        reset(id);
        await navigate(path);
        await select(count);
        await waitFor(
          `document.querySelector('app-tool-workspace').innerText.includes('${count} arquivos')`,
        );
        assert.equal(await evaluate('!!document.querySelector(".paywall")'), count > 3);
        if (count > 3) {
          assert.ok(
            await evaluate(
              `document.querySelector('.paywall').innerText.includes('${count <= 100 ? '4,90' : '6,90'}')`,
            ),
          );
          await click('Escolher arquivos');
          await waitFor(`document.querySelectorAll('.free-picker input').length === ${count}`);
          assert.equal(
            await evaluate('document.querySelectorAll(".free-picker input:checked").length'),
            0,
          );
          await evaluate(`document.querySelectorAll('.free-picker input')[${count - 1}].click()`);
          assert.equal(
            await evaluate('document.querySelectorAll(".free-picker input:checked").length'),
            1,
          );
          if (count === 40)
            for (const width of [320, 375, 390, 768, 1024, 1440]) {
              await command('Emulation.setDeviceMetricsOverride', {
                width,
                height: 900,
                deviceScaleFactor: 1,
                mobile: width < 768,
              });
              assert.equal(
                await evaluate('document.documentElement.scrollWidth > innerWidth'),
                false,
              );
              layouts.push({ tool: id, width, overflow: false });
              if (width === 390) {
                const shot = await command('Page.captureScreenshot', {
                  format: 'png',
                  captureBeyondViewport: true,
                });
                await writeFile(
                  resolve(artifacts, id + '-390.png'),
                  Buffer.from(shot.data, 'base64'),
                );
              }
            }
        }
        assert.equal(starts, 0);
        assert.equal(uploads.length, 0);
      }
      for (const count of [4, 40, 100, 250]) {
        reset(id);
        await navigate(path);
        await select(count);
        await click('Processar todos por');
        await waitFor('document.body.innerText.includes("Confirmando seu pagamento")');
        const selectedNames = Array.from({ length: count }, (_, i) => `synthetic-${i}.xml`);
        assert.deepEqual(uploads, selectedNames);
        assert.equal(starts, 0);
        // Unload the Angular app, as an external Checkout would, then restore the same batch.
        await command('Page.navigate', { url: 'about:blank' });
        await navigate(`${path}?processing=${batch.id}&payment=cancelled`);
        await waitFor('document.body.innerText.includes("Pagamento não concluído")');
        assert.equal(starts, 0);
        assert.equal(batch.files_count, count);
        assert.deepEqual(uploads, selectedNames);
        await navigate(`${path}?processing=${batch.id}&payment=success`);
        await waitFor('document.body.innerText.includes("Confirmando seu pagamento")');
        assert.equal(starts, 0);
        purchase.status = 'paid';
        await waitFor('!!document.querySelector(".tool-status[data-state=queued]")');
        assert.equal(starts, 1);
        assert.equal(batch.files_count, count);
        assert.deepEqual(uploads, selectedNames);
      }
      for (const status of ['pending', 'failed', 'expired']) {
        reset(id);
        await navigate(path);
        await select(40);
        await click('Processar todos por');
        await waitFor('document.body.innerText.includes("Confirmando seu pagamento")');
        purchase.status = status;
        await navigate(`${path}?processing=${batch.id}&payment=success`);
        await waitFor(
          status === 'pending'
            ? 'document.body.innerText.includes("Confirmando seu pagamento")'
            : status === 'expired'
              ? 'document.body.innerText.includes("Pagamento expirado")'
              : 'document.body.innerText.includes("Pagamento não confirmado")',
        );
        assert.equal(starts, 0);
        assert.equal(batch.files_count, 40);
        assert.deepEqual(
          uploads,
          Array.from({ length: 40 }, (_, i) => `synthetic-${i}.xml`),
        );
      }
      // Google API fails deliberately after the browser has saved the selected Files.
      reset(id);
      authenticated = false;
      await navigate(path);
      await select(40);
      await click('Processar todos por');
      await click('Continuar com Google');
      await waitFor('document.body.innerText.includes("Google indisponível")');
      authenticated = true;
      await navigate(path);
      await waitFor('document.body.innerText.includes("40 arquivos selecionados")');
      assert.equal(uploads.length, 0);
    }
    await command('Page.navigate', { url: `http://127.0.0.1:${port}/planos` });
    await waitFor('document.body.innerText.includes("3 XMLs por processamento")');
    assert.ok(await evaluate('document.body.innerText.includes("6 XMLs por dia")'));
    assert.deepEqual(errors, []);
    await writeFile(
      resolve(artifacts, 'report.json'),
      JSON.stringify(
        {
          selections: [1, 3, 4, 40, 100, 250],
          tools: 2,
          layouts,
          completeBatchPreserved: true,
          purchaseCounts: [4, 40, 100, 250],
          cancelledReturnPreservesBatch: true,
          googleSelectionRestored: true,
          pendingFailedExpiredDoNotStart: true,
          paidStartsOnce: true,
          plansUpdated: true,
          runtimeErrors: errors,
          syntheticOnly: true,
        },
        null,
        2,
      ),
    );
    console.log(JSON.stringify({ tools: 2, layouts: layouts.length, runtimeErrors: errors }));
  });
} finally {
  server.close();
}
