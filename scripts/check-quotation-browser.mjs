import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { withBrowser } from './browser-smoke.mjs';

const root = resolve('dist/feitoo-web/browser');
const artifacts = resolve('dist/validation/quotations');
await mkdir(artifacts, { recursive: true });
const requests = [];
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path.startsWith('/api/') || path.startsWith('/sanctum/')) {
      requests.push({ path, method: req.method });
      res.setHeader('Content-Type', 'application/json');
      return void res.writeHead(path === '/api/me' ? 401 : 500).end('{}');
    }
    const file = resolve(root, '.' + path);
    if (!file.startsWith(root + '/') && !file.startsWith(root + '\\'))
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
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const port = server.address().port;
try {
  await withBrowser('quotations', async ({ command, evaluate, waitFor, errors }) => {
    await command('Page.navigate', { url: `http://127.0.0.1:${port}/gerador-de-orcamentos` });
    await waitFor(
      '!!document.querySelector("#issue-date")?.value && !document.querySelector("form[inert]")',
    );
    await evaluate(
      `window.setStep = step => document.querySelectorAll('.editor-steps button')[step - 1].click(); window.setField = (selector, value) => { const element = document.querySelector(selector); const step = element.closest('[data-step]')?.dataset.step; if (step) setStep(Number(step)); element.value = value; element.dispatchEvent(new Event('input', { bubbles:true })); element.dispatchEvent(new Event('change', { bubbles:true })); element.dispatchEvent(new Event('blur')); };`,
    );
    await evaluate('document.querySelector(".editor-navigation .btn-primary").click()');
    await waitFor('document.activeElement.id === "issuer-name"');
    assert.equal(
      await evaluate(
        'document.querySelector(".editor-steps [aria-current]").textContent.includes("Minha empresa")',
      ),
      true,
    );
    const storage = await evaluate('JSON.stringify(Object.entries(localStorage))');
    const inputs = {
      '#quotation-number': 'DEMO-042',
      '#issue-date': '2026-10-20',
      '#valid-until': '2026-11-04',
      '#issuer-name': 'Horizonte Serviços Fictícios',
      '#customer-name': 'Cliente de Demonstração',
      '#item-description-0': 'Instalação de iluminação com teste e acabamento.',
      '#item-quantity-0': '0,5',
      '#item-price-0': '1,01',
      '#quotation-conditions': '50% na aprovação e 50% na entrega. Prazo estimado de 7 dias.',
      '#quotation-notes': 'Materiais de acabamento inclusos. Dados inteiramente fictícios.',
    };
    for (const [selector, value] of Object.entries(inputs))
      await evaluate(`setField(${JSON.stringify(selector)}, ${JSON.stringify(value)})`);
    await waitFor('document.querySelector(".paper .grand-total").textContent.includes("0,51")');
    await evaluate('setField("#item-quantity-0", "2"); setField("#item-price-0", "150,00")');
    await waitFor('document.querySelector(".paper .grand-total").textContent.includes("300,00")');
    await evaluate('setStep(4); document.querySelector("#quotation-template-classic").click()');
    await waitFor('!document.querySelector(".paper").classList.contains("modern")');
    assert.ok(
      await evaluate(
        'document.querySelector(".paper").textContent.includes("Cliente de Demonstração")',
      ),
    );
    await evaluate('document.querySelector("#quotation-template-modern").click()');
    await waitFor('document.querySelector(".paper").classList.contains("modern")');
    const layouts = [];
    const setView = async (view) =>
      evaluate(
        `document.querySelectorAll('.mobile-view button')[${view === 'preview' ? 1 : 0}].click()`,
      );
    const snapshot = async (width, view, state = 'filled') => {
      await command('Emulation.setDeviceMetricsOverride', {
        width,
        height: 1000,
        deviceScaleFactor: 1,
        mobile: width < 768,
      });
      await setView(view);
      await new Promise((done) => setTimeout(done, 80));
      const result = await evaluate(`(() => {
        const visible = (element) => !!(element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');
        const editor = document.querySelector('.editor-panel').getBoundingClientRect();
        const preview = document.querySelector('.preview-panel').getBoundingClientRect();
        return { overflow: document.documentElement.scrollWidth > innerWidth, editor: editor.width, preview: preview.width,
          overlap: innerWidth > 900 && editor.right > preview.left + 1,
          unlabeled: [...document.querySelectorAll('.quotation-app input, .quotation-app textarea, .quotation-app select')].filter(visible).filter(e => !(e.labels?.length || e.getAttribute('aria-label'))).length,
          smallTargets: [...document.querySelectorAll('.quotation-app button, .quotation-app input, .quotation-app select')].filter(visible).filter(e => e.type !== 'radio' && !e.disabled && e.getBoundingClientRect().height < 43).map(e=>e.id || e.className),
          disabledPdf: document.querySelector('.generate-pdf').disabled
        };
      })()`);
      assert.equal(result.overflow, false, JSON.stringify({ width, view, state, ...result }));
      assert.equal(result.overlap, false, 'Editor/preview overlap');
      assert.equal(result.unlabeled, 0);
      assert.deepEqual(result.smallTargets, []);
      assert.equal(result.disabledPdf, false);
      layouts.push({ width, view, state, ...result });
      if ([390, 1440].includes(width) && ['filled', 'comfortable'].includes(state)) {
        await evaluate('scrollTo(0,0)');
        const shot = await command('Page.captureScreenshot', {
          format: 'png',
          captureBeyondViewport: false,
        });
        await writeFile(
          resolve(artifacts, `${state}-${view}-${width}.png`),
          Buffer.from(shot.data, 'base64'),
        );
      }
    };
    for (const width of [320, 375, 390, 768, 1024, 1440]) {
      await snapshot(width, 'edit');
      await snapshot(width, 'preview');
    }
    await snapshot(390, 'preview', 'before-zoom');
    await evaluate('document.querySelector(".preview-toolbar button").click()');
    await waitFor('document.querySelector(".paper").classList.contains("comfortable")');
    await snapshot(390, 'preview', 'comfortable');
    assert.equal(
      await evaluate('getComputedStyle(document.querySelector(".paper")).fontSize'),
      '12px',
    );
    await evaluate('document.querySelector(".preview-toolbar button").click()');
    await command('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await setView('edit');
    await evaluate(
      'setField("#issuer-name", ""); document.querySelector(".validate-preview").click()',
    );
    await waitFor('document.activeElement.id === "issuer-name"');
    assert.equal(
      await evaluate('document.querySelector("#issuer-name").getAttribute("aria-invalid")'),
      'true',
    );
    await evaluate(
      'setField("#issuer-name", "Horizonte Serviços Fictícios"); setField("#valid-until", "2026-10-19")',
    );
    await waitFor('document.querySelector("#validity-error").textContent.includes("posterior")');
    await evaluate('setField("#valid-until", "2026-11-04"); setField("#item-price-0", "10,001")');
    await waitFor('document.querySelector(".paper .grand-total").textContent.includes("—")');
    await evaluate('setField("#item-price-0", "150,00"); setStep(3)');
    await waitFor('!document.querySelector("#quotation-notes").closest("[data-step]").hidden');
    await evaluate('document.querySelector("#quotation-notes").scrollIntoView()');
    const sticky = await evaluate(
      'document.querySelector(".editor-panel-heading").getBoundingClientRect().top',
    );
    assert.ok(
      sticky >= -1 && sticky < 10,
      'Total must remain visible while editing lower sections: ' + sticky,
    );
    await evaluate(
      `window.activeLogoUrls = new Set(); const create = URL.createObjectURL.bind(URL); const revoke = URL.revokeObjectURL.bind(URL); URL.createObjectURL = blob => { const url = create(blob); activeLogoUrls.add(url); return url; }; URL.revokeObjectURL = url => { activeLogoUrls.delete(url); revoke(url); };`,
    );
    await evaluate('setStep(1)');
    for (const type of ['image/png', 'image/jpeg']) {
      await evaluate(
        `(async () => { const canvas = document.createElement('canvas'); canvas.width = 240; canvas.height = 100; const context = canvas.getContext('2d'); context.fillStyle = '#125d54'; context.fillRect(15,15,60,70); context.font = '18px sans-serif'; context.fillText('EXEMPLO',90,60); const blob = await new Promise(resolve => canvas.toBlob(resolve, ${JSON.stringify(type)})); const transfer = new DataTransfer(); transfer.items.add(new File([blob], 'ficticio.' + (${JSON.stringify(type)} === 'image/png' ? 'png' : 'jpg'), {type:${JSON.stringify(type)}})); const input = document.querySelector('#quotation-logo'); input.files = transfer.files; input.dispatchEvent(new Event('change', {bubbles:true})); })()`,
      );
      await waitFor(
        '!!document.querySelector(".logo-selected img") && !document.querySelector("#quotation-logo").disabled',
      );
      assert.equal(await evaluate('activeLogoUrls.size'), 1);
      await evaluate(`[...document.querySelectorAll('.logo-selected button')][0].click()`);
      await waitFor('!document.querySelector(".logo-selected img")');
      assert.equal(await evaluate('activeLogoUrls.size'), 0);
    }
    await evaluate(
      `(() => { const transfer = new DataTransfer(); transfer.items.add(new File(['<svg></svg>'], 'unsafe.png', {type:'image/png'})); const input = document.querySelector('#quotation-logo'); input.files = transfer.files; input.dispatchEvent(new Event('change',{bubbles:true})); })()`,
    );
    await waitFor('document.querySelector("#logo-error").textContent.includes("Não foi possível")');
    assert.equal(await evaluate('activeLogoUrls.size'), 0);
    await evaluate('setField("#discount-type", "percent");');
    await waitFor(
      'document.querySelector("#discount-value")?.getAttribute("formcontrolname") === "discount_percent"',
    );
    await evaluate('setField("#discount-value", "10,00")');
    await waitFor('document.querySelector(".paper .grand-total").textContent.includes("270,00")');
    await evaluate(
      'setField("#quotation-notes", "<script>window.quotationUnsafe = true</script> " + "Observação completa. ".repeat(140) + "FIM DAS OBSERVAÇÕES")',
    );
    await waitFor('document.querySelector(".paper").textContent.includes("FIM DAS OBSERVAÇÕES")');
    assert.equal(await evaluate('window.quotationUnsafe ?? false'), false);
    assert.equal(await evaluate('!!document.querySelector(".paper script")'), false);
    for (let index = 1; index < 100; index++)
      await evaluate('document.querySelector(".add-item").click()');
    await waitFor('document.querySelectorAll(".item-card").length === 100');
    assert.equal(await evaluate('document.querySelector(".add-item").disabled'), true);
    await snapshot(320, 'edit', 'hundred-items');
    await snapshot(320, 'preview', 'hundred-items');
    await snapshot(1440, 'preview', 'hundred-items');
    assert.equal(await evaluate('document.querySelectorAll(".paper tbody tr").length'), 100);
    assert.equal(await evaluate('JSON.stringify(Object.entries(localStorage))'), storage);
    assert.equal(
      await evaluate(
        'Object.entries(sessionStorage).every(([key,value]) => key === "feitoo.quotation.context" && /^[0-9a-f-]{36}$/.test(value))',
      ),
      true,
    );
    assert.deepEqual(
      requests.filter((entry) => entry.path !== '/api/me'),
      [],
      'Feature must not call fiscal/API/checkout endpoints',
    );
    assert.deepEqual(errors, []);
    await writeFile(
      resolve(artifacts, 'report.json'),
      JSON.stringify(
        {
          layouts,
          apiRequests: requests,
          logoUrlLeaks: 0,
          personalStorageWrites: 0,
          runtimeErrors: errors,
        },
        null,
        2,
      ),
    );
    console.log(
      `Quotation editor: ${layouts.length} responsive checks, exact rounding, templates, PNG/JPEG, text, 100 items and privacy passed.`,
    );
  });
} finally {
  await new Promise((done) => server.close(done));
}
