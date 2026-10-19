// Synthetic API/browser smoke. Does not invoke LibreOffice or send real documents.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { withBrowser } from './browser-smoke.mjs';

const root = resolve('dist/feitoo-web/browser');
const artifacts = resolve('dist/validation');
await mkdir(artifacts, { recursive: true });
const now = new Date().toISOString();
let polls = 0;
let pdfDownloads = 0;
let zipDownloads = 0;
const batch = {
  id: '12345678-1234-4234-8234-123456789abc',
  tool: 'docx_to_pdf',
  status: 'pending',
  files_count: 3,
  processed_files_count: 0,
  successful_files_count: 0,
  failed_files_count: 0,
  total_size: 100,
  started_at: null,
  completed_at: null,
  created_at: now,
  expires_at: new Date(Date.now() + 7200000).toISOString(),
  result: { available: false, file_name: null, size: null, error_message: null },
};
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path === '/sanctum/csrf-cookie') {
      res.writeHead(204).end();
      return;
    }
    if (path.startsWith('/api/')) {
      res.setHeader('Content-Type', 'application/json');
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
            max_processing_files: 20,
            max_file_size_kb: 10240,
            max_request_size_kb: 30720,
            max_total_size_kb: 40960,
            ttl_minutes: 120,
            free: { per_processing: 3, daily: 6 },
            packages: [],
            checkout_available: false,
          },
        };
      else if (path === '/api/account/usage')
        body = {
          data: {
            plan: 'free',
            limits: {
              per_processing: 3,
              daily: 6,
              remaining_today: 6,
              used_today: 0,
              resets_at: new Date(Date.now() + 86400000).toISOString(),
            },
          },
        };
      else if (path === '/api/processings' && req.method === 'POST') {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        assert.equal(JSON.parse(Buffer.concat(chunks)).tool, 'docx_to_pdf');
        body = { data: batch };
      } else if (path.endsWith('/files') && req.method === 'POST') {
        for await (const chunk of req) {
        }
        body = { data: batch };
      } else if (path.endsWith('/start')) {
        batch.status = 'queued';
        body = { data: batch };
      } else if (path.endsWith('/files') && req.method === 'DELETE') {
        batch.status = 'expired';
        body = { data: batch };
      } else if (path.endsWith('/files'))
        body = {
          data: [0, 1, 2].map((i) => ({
            id: 'input-' + i,
            original_name: 'documento-sintetico-' + i + '.docx',
            size: 30,
            status:
              batch.status === 'completed' ? (i === 1 ? 'failed' : 'completed') : 'processing',
            processed_at: now,
            error_code: i === 1 ? 'document_conversion_failed' : null,
            error_message: i === 1 ? 'Não foi possível converter este documento para PDF.' : null,
          })),
        };
      else if (path.includes('/pdf/')) {
        pdfDownloads++;
        res.setHeader('Content-Type', 'application/pdf');
        res.end('%PDF-1.4\nsynthetic browser response\n%%EOF');
        return;
      } else if (path.endsWith('/result')) {
        zipDownloads++;
        res.setHeader('Content-Type', 'application/zip');
        res.end('PK-synthetic-browser-response');
        return;
      } else if (path === '/api/processings/' + batch.id) {
        if (++polls >= 2)
          Object.assign(batch, {
            status: 'completed',
            processed_files_count: 3,
            successful_files_count: 2,
            failed_files_count: 1,
            result: {
              available: true,
              file_name: 'feitoo-documentos-pdf.zip',
              size: 100,
              error_message: null,
            },
          });
        else batch.status = 'processing';
        body = { data: batch };
      } else {
        res.writeHead(404).end('{}');
        return;
      }
      res.end(JSON.stringify(body));
      return;
    }
    const file = resolve(root, '.' + path);
    if (file !== root && !file.startsWith(root + '\\') && !file.startsWith(root + '/')) {
      res.writeHead(403).end();
      return;
    }
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
  await withBrowser('docx-edge', async ({ command, evaluate, waitFor, errors }) => {
    await command('Page.navigate', { url: `http://127.0.0.1:${port}/` });
    await waitFor(
      '!!document.querySelector("app-home")?.__ngContext__ || !!document.querySelector("app-home")?.__ngContext__ === 0 || !!document.querySelector(".account-menu")',
    );
    const homeLayouts = [];
    for (const width of [320, 375, 390, 768, 1024, 1440]) {
      await command('Emulation.setDeviceMetricsOverride', {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: width < 768,
      });
      assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false);
      assert.equal(
        await evaluate('getComputedStyle(document.querySelector(".tools-grid")).display'),
        'grid',
      );
      assert.equal(
        await evaluate(
          'getComputedStyle(document.querySelector(".tools-grid")).gridTemplateColumns.split(" ").length',
        ),
        width < 768 ? 1 : width <= 1024 ? 2 : 3,
      );
      if (width <= 640) {
        await evaluate('document.querySelector(".mobile-menu-toggle").click()');
        await waitFor(
          'document.querySelector(".mobile-menu-toggle").getAttribute("aria-expanded") === "true"',
        );
      }
      await evaluate('document.querySelector(".tools-menu summary").focus()');
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
      await waitFor('document.querySelector(".tools-menu").open');
      assert.equal(
        await evaluate('document.querySelectorAll(".tools-dropdown section a").length'),
        6,
      );
      assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false);
      const menu = await command('Page.captureScreenshot', { format: 'png' });
      await writeFile(
        resolve(artifacts, `catalog-menu-${width}.png`),
        Buffer.from(menu.data, 'base64'),
      );
      await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
      await waitFor('!document.querySelector(".tools-menu").open');
      assert.ok(
        await evaluate('document.activeElement === document.querySelector(".tools-menu summary")'),
      );
      if (width <= 640) {
        await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
        await waitFor(
          'document.querySelector(".mobile-menu-toggle").getAttribute("aria-expanded") === "false"',
        );
      }
      const shot = await command('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: true,
      });
      await writeFile(
        resolve(artifacts, `catalog-home-${width}.png`),
        Buffer.from(shot.data, 'base64'),
      );
      homeLayouts.push({ width, overflow: false, dropdownKeyboard: true });
    }
    await command('Page.navigate', { url: `http://127.0.0.1:${port}/docx-para-pdf` });
    await waitFor(
      '!!document.querySelector("#docx-files") && !document.querySelector("#docx-files").disabled && !!document.querySelector(".account-menu")',
    );
    const layouts = [];
    for (const width of [320, 375, 390, 768, 1024, 1440]) {
      await command('Emulation.setDeviceMetricsOverride', {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: width < 768,
      });
      assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
      const { data } = await command('Page.captureScreenshot', { captureBeyondViewport: true });
      await writeFile(resolve(artifacts, `docx-public-${width}.png`), Buffer.from(data, 'base64'));
      layouts.push({ state: 'public', width, overflow: false });
    }
    await evaluate(
      `(()=>{const zone=document.querySelector('.dropzone');const t=new DataTransfer();for(let i=0;i<3;i++)t.items.add(new File(['synthetic'],'documento-'+i+'.docx'));t.items.add(new File(['invalid'],'old.doc'));zone.dispatchEvent(new DragEvent('drop',{dataTransfer:t,bubbles:true,cancelable:true}));})()`,
    );
    await waitFor('document.querySelectorAll(".document-list li").length === 3');
    assert.equal(
      await evaluate('document.body.innerText.includes("envie um arquivo DOCX válido")'),
      true,
    );
    await evaluate(
      '[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="Converter para PDF").click()',
    );
    await waitFor('document.body.innerText.includes("2 de 3 arquivos convertidos")');
    await waitFor('document.querySelectorAll(".document-list button").length===2');
    assert.equal(
      await evaluate(
        'document.body.innerText.includes("Não foi possível converter este documento")',
      ),
      true,
    );
    for (const width of [320, 390, 1440]) {
      await command('Emulation.setDeviceMetricsOverride', {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: width < 768,
      });
      assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
      const { data } = await command('Page.captureScreenshot', { captureBeyondViewport: true });
      await writeFile(resolve(artifacts, `docx-result-${width}.png`), Buffer.from(data, 'base64'));
      layouts.push({ state: 'partial', width, overflow: false });
    }
    await evaluate('document.querySelector(".document-list button").click()');
    await waitFor(
      '[...document.querySelectorAll("button")].some(b=>b.textContent.trim()==="Baixar todos (.zip)" && !b.disabled)',
    );
    await evaluate(
      '[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="Baixar todos (.zip)").click()',
    );
    await new Promise((done) => setTimeout(done, 300));
    assert.equal(pdfDownloads, 1);
    assert.equal(zipDownloads, 1);
    await evaluate(
      '[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="Excluir arquivos").click()',
    );
    await waitFor('document.body.innerText.includes("Arquivos expirados ou excluídos")');
    assert.deepEqual(errors, []);
    const report = {
      homeLayouts,
      layouts,
      pdfDownloads,
      zipDownloads,
      polls,
      dragDrop: true,
      partial: true,
      deletion: true,
      runtimeErrors: errors,
    };
    await writeFile(
      resolve(artifacts, 'docx-browser-report.json'),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report));
  });
} finally {
  server.close();
}
