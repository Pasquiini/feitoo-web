import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { withBrowser } from './browser-smoke.mjs';
import {
  preview,
  analysis,
  organizerOptions,
  organizerSummary,
} from './tools-experience-fixtures.mjs';

const root = resolve('dist/feitoo-web/browser');
const artifacts = resolve('dist/validation/tools-experience');
await mkdir(artifacts, { recursive: true });
const tools = [
  ['xml-to-excel', '/xml-para-excel', 'Processar XMLs'],
  ['products-from-xml', '/produtos-dos-xmls', 'Processar XMLs'],
  ['xml-to-pdf', '/xml-para-pdf', 'Gerar DANFE'],
  ['xml-organizer', '/organizar-xml', 'Organizar XMLs'],
  ['xml-analyzer', '/analisar-xml', 'Analisar XMLs'],
  ['docx_to_pdf', '/docx-para-pdf', 'Converter para PDF'],
];
let tool,
  batch,
  phase,
  downloads = 0;
let failureCount = 1;
function reset(id) {
  tool = id;
  failureCount = 1;
  phase = 'queued';
  batch = {
    id: '12345678-1234-4234-8234-123456789abc',
    tool,
    status: 'pending',
    files_count: 3,
    processed_files_count: 0,
    successful_files_count: 0,
    failed_files_count: 0,
    total_size: 100,
    created_at: new Date().toISOString(),
    started_at: null,
    completed_at: null,
    expires_at: new Date(Date.now() + 7200000).toISOString(),
    result: { available: false, file_name: null, size: null, error_message: null },
  };
}
function responseBatch() {
  const complete = phase === 'completed';
  return {
    ...batch,
    status: phase,
    processed_files_count: complete ? batch.files_count : phase === 'processing' ? 1 : 0,
    successful_files_count: complete ? batch.files_count - failureCount : 0,
    failed_files_count: complete ? failureCount : 0,
    result: {
      available: complete,
      file_name: 'resultado.zip',
      size: 100,
      error_message: phase === 'failed' ? 'Não foi possível concluir este processamento.' : null,
    },
    ...(complete && ['xml-to-excel', 'products-from-xml'].includes(tool)
      ? {
          preview: {
            ...preview,
            summary: {
              ...preview.summary,
              successful_documents_count: batch.files_count - failureCount,
              failed_documents_count: failureCount,
            },
          },
        }
      : {}),
    ...(complete && tool === 'xml-organizer'
      ? {
          organizer: {
            options: organizerOptions,
            summary: {
              ...organizerSummary,
              total_files: batch.files_count,
              organized_count: batch.files_count - failureCount,
              invalid_count: failureCount,
              preserved_count: batch.files_count,
            },
          },
        }
      : {}),
  };
}
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname;
    if (path === '/sanctum/csrf-cookie') return void res.writeHead(204).end();
    if (path.startsWith('/api/')) {
      res.setHeader('Content-Type', 'application/json');
      let data;
      if (path === '/api/me')
        data = {
          id: 1,
          name: 'Pessoa Teste',
          email: 'synthetic@example.test',
          has_password: true,
          google_linked: false,
        };
      else if (path.endsWith('/config'))
        data = {
          max_files: 20,
          max_processing_files: 20,
          max_file_size_kb: 10240,
          max_total_size_kb: 40960,
          max_request_size_kb: 30720,
          max_processing_items: 10000,
          ttl_minutes: 120,
          free: {
            per_processing: tool === 'docx_to_pdf' ? 3 : 20,
            daily: tool === 'docx_to_pdf' ? 6 : 50,
          },
          packages: [],
          checkout_available: false,
        };
      else if (path === '/api/account/usage')
        data = {
          plan: 'free',
          limits: {
            per_processing: tool === 'docx_to_pdf' ? 3 : 20,
            daily: tool === 'docx_to_pdf' ? 6 : 50,
            remaining_today: tool === 'docx_to_pdf' ? 6 : 50,
            used_today: 0,
            resets_at: new Date(Date.now() + 86400000).toISOString(),
          },
        };
      else if (path === '/api/processings' && req.method === 'POST') {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        assert.equal(JSON.parse(Buffer.concat(chunks)).tool, tool);
        await new Promise((done) => setTimeout(done, 350));
        data = batch;
      } else if (path.endsWith('/files') && req.method === 'POST') {
        for await (const chunk of req) {
          /* drain synthetic multipart upload */
        }
        data = batch;
      } else if (path.endsWith('/start')) {
        data = { ...batch, status: 'queued' };
      } else if (path.endsWith('/files') && req.method === 'DELETE') {
        phase = 'expired';
        data = { ...batch, status: 'expired' };
      } else if (path.endsWith('/files'))
        data = Array.from({ length: batch.files_count }, (_, i) => ({
          id: 'input-' + i,
          original_name: 'arquivo-sintetico-' + i + (tool === 'docx_to_pdf' ? '.docx' : '.xml'),
          size: 40,
          status:
            phase === 'completed'
              ? i >= batch.files_count - failureCount
                ? 'failed'
                : 'completed'
              : 'processing',
          processed_at: null,
          error_code: i === 2 ? 'invalid_xml' : null,
          error_message: i === 2 ? 'Não foi possível processar este arquivo.' : null,
          ...(tool === 'xml-to-pdf' && i !== 2
            ? {
                document: {
                  access_key: '1'.repeat(44),
                  number: '123',
                  series: '1',
                  issuer_name: 'Emitente de teste',
                  recipient_name: 'Destinatário de teste',
                  total_value: '125.00',
                  notice: 'Status atual na SEFAZ não consultado.',
                },
              }
            : {}),
          ...(tool === 'xml-organizer'
            ? {
                organization: {
                  archive_path: '2026/10/Emitente/nota.xml',
                  final_name: 'nota.xml',
                  folder: '2026/10/Emitente',
                  duplicate_kind: null,
                  key_conflict: false,
                  notes: [],
                },
              }
            : {}),
        }));
      else if (
        path.endsWith('/analysis/export') ||
        path.endsWith('/result') ||
        path.includes('/pdf/')
      ) {
        downloads++;
        res.setHeader(
          'Content-Type',
          path.includes('/pdf/') ? 'application/pdf' : 'application/octet-stream',
        );
        return void res.end(
          path.includes('/pdf/') ? '%PDF-1.4\nsynthetic\n%%EOF' : 'synthetic-result',
        );
      } else if (path.endsWith('/analysis')) data = analysis;
      else if (path === '/api/processings/' + batch.id) data = responseBatch();
      else return void res.writeHead(404).end('{}');
      return void res.end(JSON.stringify({ data }));
    }
    const file = resolve(root, '.' + path);
    if (file !== root && !file.startsWith(root + '\\') && !file.startsWith(root + '/'))
      return void res.writeHead(403).end();
    const actual = extname(file) ? file : resolve(file, 'index.html');
    const content = await readFile(actual);
    res.setHeader(
      'Content-Type',
      {
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.html': 'text/html',
        '.png': 'image/png',
        '.svg': 'image/svg+xml',
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
  await withBrowser('tools-experience', async ({ command, evaluate, waitFor, errors }) => {
    const layouts = [];
    const snapshot = async (id, state, width) => {
      await command('Emulation.setDeviceMetricsOverride', {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: width < 768,
      });
      assert.equal(
        await evaluate('document.documentElement.scrollWidth > innerWidth'),
        false,
        `${id} ${state} ${width}`,
      );
      if (width === 390 || width === 1440) {
        const shot = await command('Page.captureScreenshot', {
          format: 'png',
          captureBeyondViewport: true,
        });
        await writeFile(
          resolve(artifacts, `${id}-${state}-${width}.png`),
          Buffer.from(shot.data, 'base64'),
        );
      }
      layouts.push({ tool: id, state, width, overflow: false });
    };
    for (const [id, path, action] of tools) {
      reset(id);
      await command('Page.navigate', { url: `http://127.0.0.1:${port}${path}` });
      await waitFor(
        '!!document.querySelector(".account-menu") && !document.querySelector("input[type=file]").disabled',
      );
      assert.equal(await evaluate('document.querySelectorAll("h1").length'), 1);
      assert.ok(await evaluate('!!document.querySelector("app-tool-workspace app-tool-uploader")'));
      for (const width of [320, 375, 390, 768, 1024, 1440]) await snapshot(id, 'idle', width);
      // Invalid format error, then removal and valid selection through the real file event.
      await evaluate(
        `(() => { const input = document.querySelector('input[type=file]'); const transfer = new DataTransfer(); transfer.items.add(new File(['invalid'], 'invalido.txt')); input.files = transfer.files; input.dispatchEvent(new Event('change', {bubbles:true})); })()`,
      );
      await waitFor('!!document.querySelector("[role=alert]")');
      await evaluate(
        `(() => { const input = document.querySelector('input[type=file]'); const transfer = new DataTransfer(); for(let i=0;i<3;i++) transfer.items.add(new File(['synthetic'], 'documento-com-nome-longo-para-validar-truncamento-'+i+'.${id === 'docx_to_pdf' ? 'docx' : 'xml'}')); input.files=transfer.files; input.dispatchEvent(new Event('change', {bubbles:true})); })()`,
      );
      await waitFor('document.querySelectorAll("button[aria-label^=Remover]").length === 3');
      await evaluate('document.querySelector("button[aria-label^=Remover]").click()');
      await waitFor('document.querySelectorAll("button[aria-label^=Remover]").length === 2');
      await evaluate(
        `(() => { const input = document.querySelector('input[type=file]'); const transfer = new DataTransfer(); transfer.items.add(new File(['synthetic'], 'adicional.${id === 'docx_to_pdf' ? 'docx' : 'xml'}')); input.files=transfer.files; input.dispatchEvent(new Event('change', {bubbles:true})); })()`,
      );
      await waitFor('document.querySelectorAll("button[aria-label^=Remover]").length === 3');
      await snapshot(id, 'selected', 390);
      await snapshot(id, 'selected', 1440);
      await evaluate(
        `[...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(action)}).click()`,
      );
      await waitFor('!!document.querySelector(".tool-status[data-state=uploading]")');
      await waitFor('!!document.querySelector(".tool-status[data-state=queued]")');
      phase = 'processing';
      await waitFor('!!document.querySelector(".tool-status[data-state=processing]")');
      assert.ok(await evaluate('!!document.querySelector("progress")'));
      await snapshot(id, 'processing', 390);
      phase = 'completed';
      await waitFor('!!document.querySelector(".tool-status[data-state=partial]")');
      if (id === 'xml-analyzer') await waitFor('!!document.querySelector(".analysis-metrics")');
      for (const width of [320, 375, 390, 768, 1024, 1440]) await snapshot(id, 'result', width);
      const before = downloads;
      await evaluate(
        `document.querySelector(${JSON.stringify(id === 'docx_to_pdf' ? '.document-result .document-list button' : '.result-download')}).click()`,
      );
      for (let attempt = 0; attempt < 30 && downloads === before; attempt++)
        await new Promise((done) => setTimeout(done, 100));
      assert.ok(downloads > before, `${id}: authenticated download`);
      if (id === 'xml-to-pdf') {
        await evaluate(
          `[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Visualizar PDF').click()`,
        );
        await waitFor('!!document.querySelector("iframe.danfe-preview")');
      }
      if (id === 'xml-analyzer') {
        await evaluate(
          `[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Exportar visão em Excel').click()`,
        );
      }
      await waitFor(
        '[...document.querySelectorAll("button")].some(b => b.textContent.trim() === "Excluir arquivos" && !b.disabled)',
      );
      await evaluate(
        `[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Excluir arquivos').click()`,
      );
      await waitFor('!!document.querySelector(".tool-status[data-state=expired]")');
      assert.equal(await evaluate('document.querySelectorAll(".result-download").length'), 0);
      reset(id);
      phase = 'failed';
      await command('Page.navigate', {
        url: `http://127.0.0.1:${port}${path}?processing=${batch.id}`,
      });
      await waitFor('!!document.querySelector(".tool-status[data-state=failed]")');
      assert.equal(await evaluate('document.querySelectorAll(".result-download").length'), 0);
      await snapshot(id, 'failed', 390);
      await evaluate(
        `[...document.querySelectorAll('button')].find(b => b.textContent.trim().startsWith('Selecionar outros')).click()`,
      );
      await waitFor(
        '!!document.querySelector("input[type=file]") && !document.querySelector("input[type=file]").disabled',
      );
      reset(id);
      failureCount = 0;
      phase = 'completed';
      await evaluate(
        `(() => { const input = document.querySelector('input[type=file]'); const transfer = new DataTransfer(); for(let i=0;i<3;i++) transfer.items.add(new File(['synthetic'], 'retentativa-'+i+'.${id === 'docx_to_pdf' ? 'docx' : 'xml'}')); input.files=transfer.files; input.dispatchEvent(new Event('change', {bubbles:true})); })()`,
      );
      await waitFor('document.querySelectorAll("button[aria-label^=Remover]").length === 3');
      await evaluate(
        `[...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(action)}).click()`,
      );
      await waitFor('!!document.querySelector(".tool-status[data-state=completed]")');
    }
    assert.deepEqual(errors, []);
    const report = {
      layouts,
      downloads,
      upload: true,
      invalidFormat: true,
      removal: true,
      queued: true,
      processing: true,
      partial: true,
      completed: true,
      failed: true,
      retry: true,
      expired: true,
      runtimeErrors: errors,
      syntheticOnly: true,
    };
    await writeFile(resolve(artifacts, 'report.json'), JSON.stringify(report, null, 2));
    console.log(
      JSON.stringify({
        tools: tools.length,
        layouts: layouts.length,
        downloads,
        runtimeErrors: errors,
      }),
    );
  });
} finally {
  server.close();
}
