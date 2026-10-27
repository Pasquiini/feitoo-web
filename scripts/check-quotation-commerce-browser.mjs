import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { withBrowser } from './browser-smoke.mjs';

// Browser integration uses a local contract fake. Laravel security is tested with SQLite in PHPUnit.
const root = resolve('dist/feitoo-web/browser');
const artifacts = resolve('dist/validation/quotation-commerce');
await mkdir(artifacts, { recursive: true });
let account = null;
let failDrafts = 0;
let orderStatus = 'pending',
  creditBalance = 0,
  generationPosts = 0;
const checkoutKeys = [];
const orderId = '12345678-1234-4234-8234-123456789abc';
const drafts = new Map();
const requests = [];
const user = (id) => ({
  id,
  name: `Conta Fictícia ${id}`,
  email: `ficticio${id}@example.test`,
  google_linked: false,
  has_password: true,
  created_at: new Date().toISOString(),
});
const body = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
};
const resource = (draft) => {
  const { owner, key, initial, logo, ...data } = draft;
  return structuredClone(data);
};
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    const json = (status, value) => {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store, private');
      res.writeHead(status).end(JSON.stringify(value));
    };
    if (path.startsWith('/api/') || path.startsWith('/sanctum/')) {
      requests.push({ path, method: req.method });
      if (path === '/sanctum/csrf-cookie') {
        res.setHeader('Set-Cookie', 'XSRF-TOKEN=fake-csrf; Path=/; SameSite=Lax');
        return void res.writeHead(204).end();
      }
      if (path === '/api/me')
        return json(account ? 200 : 401, account ? { data: user(account) } : {});
      if (path === '/api/auth/google/start') return json(503, {});
      if (path === '/api/auth/login' || path === '/api/auth/register') {
        const input = JSON.parse((await body(req)).toString());
        if (input.password === 'wrong-password') return json(422, {});
        account = input.email.includes('2@') ? 2 : 1;
        return json(path.endsWith('register') ? 201 : 200, { data: user(account) });
      }
      if (path === '/api/auth/logout') {
        account = null;
        return json(200, {});
      }
      if (path === '/api/quotations/entitlements')
        return json(200, {
          data: {
            source: 'free',
            policy: 'explicit_source',
            enabled: true,
            daily_limit: 1,
            remaining: 0,
            reserved: 0,
            consumed: 1,
            resets_at: new Date(Date.now() + 86400000).toISOString(),
            active_processing: null,
            latest_processing: null,
            credits: {
              granted: creditBalance,
              available: creditBalance,
              consumed: 0,
              reserved: 0,
              revoked: 0,
            },
            pro: { active: false, remaining: 0 },
            offer: {
              available: true,
              credits: 5,
              amount: 990,
              currency: 'brl',
              code: 'quotation_5',
            },
          },
        });
      if (path === '/api/quotations/credit-orders' && req.method === 'POST') {
        const latest = [...drafts.values()].at(-1);
        assert.ok(latest.logo);
        assert.equal(latest.payload.notes, 'Rascunho parcial preservado');
        checkoutKeys.push(req.headers['idempotency-key']);
        return json(503, { code: 'checkout_unavailable' });
      }
      if (path === '/api/quotations/credit-orders/' + orderId)
        return json(200, {
          data: {
            id: orderId,
            status: orderStatus,
            credits: 5,
            amount: 990,
            currency: 'brl',
            checkout_url: null,
          },
        });
      if (path.endsWith('/generations') && req.method === 'POST') {
        const input = JSON.parse((await body(req)).toString());
        generationPosts++;
        assert.equal(input.source, 'credit');
        return json(422, { code: 'quotation_invalid' });
      }
      if (!path.startsWith('/api/quotations/drafts')) return json(500, {});
      if (!account) return json(401, {});
      if (req.headers['x-quotation-owner'] && req.headers['x-quotation-owner'] !== String(account))
        return json(401, {});
      if (failDrafts)
        return json(failDrafts, {
          code: failDrafts === 410 ? 'draft_expired' : 'draft_request_failed',
        });
      if (path === '/api/quotations/drafts') {
        if (req.method === 'GET') {
          const latest = [...drafts.values()].filter((d) => d.owner === account).at(-1);
          return json(200, { data: latest ? resource(latest) : null });
        }
        const input = JSON.parse((await body(req)).toString());
        const key = req.headers['idempotency-key'];
        const previous = [...drafts.values()].find((d) => d.owner === account && d.key === key);
        if (previous)
          return json(previous.initial === JSON.stringify(input.payload) ? 200 : 409, {
            data: resource(previous),
          });
        const now = new Date();
        const draft = {
          uuid: randomUUID(),
          revision: 1,
          schema_version: 1,
          payload: input.payload,
          logo_checksum: null,
          created_at: now.toISOString(),
          updated_at: now.toISOString(),
          expires_at: new Date(+now + 86400000).toISOString(),
          owner: account,
          key,
          initial: JSON.stringify(input.payload),
          logo: null,
        };
        drafts.set(draft.uuid, draft);
        return json(201, { data: resource(draft) });
      }
      const [uuid, asset] = path.slice('/api/quotations/drafts/'.length).split('/');
      const draft = drafts.get(uuid);
      if (!draft || draft.owner !== account) return json(404, {});
      if (req.method === 'GET') {
        if (!asset) return json(200, { data: resource(draft) });
        if (!draft.logo) return json(404, {});
        res.setHeader('Content-Type', 'image/png');
        return void res.end(draft.logo);
      }
      const bytes = await body(req);
      const multipart = req.headers['content-type']?.includes('multipart/form-data');
      const input = multipart
        ? { revision: Number(/name="revision"\r\n\r\n(\d+)/.exec(bytes.toString())?.[1]) }
        : JSON.parse(bytes.toString());
      if (input.revision !== draft.revision) return json(409, { code: 'draft_revision_conflict' });
      if (req.method === 'DELETE' && !asset) {
        drafts.delete(uuid);
        return void res.writeHead(204).end();
      }
      if (!asset) draft.payload = input.payload;
      else if (req.method === 'DELETE') {
        draft.logo = null;
        draft.logo_checksum = null;
      } else {
        const start =
          bytes.indexOf('Content-Type: image/png\r\n\r\n') +
          'Content-Type: image/png\r\n\r\n'.length;
        draft.logo = bytes.subarray(start, bytes.lastIndexOf('\r\n--'));
        draft.logo_checksum = 'test-checksum';
      }
      draft.revision++;
      draft.updated_at = new Date().toISOString();
      draft.expires_at = new Date(Date.now() + 86400000).toISOString();
      return json(200, { data: resource(draft) });
    }
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
    res.writeHead(500).end();
  }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const port = server.address().port;
try {
  await withBrowser('quotation-commerce', async (browser) => {
    console.log('Draft browser: connected.');
    const { command, evaluate, waitFor, newPage, errors } = browser;
    const origin = `http://127.0.0.1:${port}`;
    const ready = async (page = browser) => {
      await page.waitFor(
        '!!document.querySelector("#quotation-notes") && !document.querySelector("form[inert]")',
      );
    };
    const field = async (selector, value, page = browser) =>
      page.evaluate(
        `(() => { const e = document.querySelector(${JSON.stringify(selector)}); e.value = ${JSON.stringify(value)}; e.dispatchEvent(new Event('input', {bubbles:true})); e.dispatchEvent(new Event('change', {bubbles:true})); })()`,
      );
    const click = async (text, page = browser) =>
      page.evaluate(
        `[...document.querySelectorAll('button,a')].find(e => e.textContent.trim() === ${JSON.stringify(text)}).click()`,
      );
    const saved = async (page = browser) =>
      page.waitFor(
        'document.querySelector(".draft-status")?.textContent.includes("Rascunho salvo.")',
      );
    const readLocal = () =>
      evaluate(
        `new Promise((resolve,reject) => { const r=indexedDB.open('feitoo-quotation-drafts',1); r.onsuccess=()=>{ const db=r.result; const tx=db.transaction('drafts'); const q=tx.objectStore('drafts').getAll(); q.onsuccess=()=>resolve(q.result.map(d=>({...d,logo:d.logo ? {size:d.logo.size,type:d.logo.type} : null}))); tx.oncomplete=()=>db.close(); }; r.onerror=reject; })`,
      );
    const login = async (id = 1, registering = false) => {
      await click('Entrar e salvar na conta');
      await waitFor('!!document.querySelector("#email")');
      if (registering) {
        await click('Criar conta');
        await waitFor('!!document.querySelector("#confirmation")');
        await field('#name', 'Conta fictícia');
        await field('#confirmation', 'a-strong-password');
      }
      await field('#email', `ficticio${id}@example.test`);
      await field('#password', 'a-strong-password');
      await evaluate('document.querySelector(".auth-submit").click()');
      await ready();
      await saved();
    };
    await command('Page.navigate', { url: origin + '/gerador-de-orcamentos' });
    await ready();
    await field('#quotation-number', 'PERSIST-001');
    await field('#issuer-name', 'Prestador Fictício');
    await field('#quotation-notes', 'Rascunho parcial preservado');
    await field('#item-quantity-0', '0,');
    await field('#item-price-0', '12,345');
    await evaluate('document.querySelector("#quotation-template-classic").click()');
    await evaluate(
      `(async () => { const canvas=document.createElement('canvas'); canvas.width=40; canvas.height=20; canvas.getContext('2d').fillRect(0,0,40,20); const blob=await new Promise(r=>canvas.toBlob(r,'image/png')); const data=new DataTransfer(); data.items.add(new File([blob],'logo.png',{type:'image/png'})); const e=document.querySelector('#quotation-logo'); e.files=data.files; e.dispatchEvent(new Event('change',{bubbles:true})); })()`,
    );
    await waitFor('!!document.querySelector(".logo-selected img")');
    await saved();
    let records = await readLocal();
    assert.equal(records.length, 1);
    assert.ok(records[0].logo.size > 0);
    assert.equal(records[0].expiresAt - records[0].updatedAt, 86400000);
    await command('Page.reload');
    await ready();
    assert.equal(
      await evaluate('document.querySelector("#quotation-number").value'),
      'PERSIST-001',
    );
    assert.equal(await evaluate('document.querySelector("#item-quantity-0").value'), '0,');
    assert.equal(await evaluate('document.querySelector("#item-price-0").value'), '12,345');
    assert.equal(
      await evaluate('document.querySelector("#quotation-template-classic").checked'),
      true,
    );
    assert.equal(await evaluate('!!document.querySelector(".logo-selected img")'), true);
    console.log('Draft browser: local refresh and logo passed.');
    await click('Entrar e salvar na conta');
    await waitFor('!!document.querySelector(".btn-google")');
    await evaluate('document.querySelector(".btn-google").click()');
    await waitFor('document.body.textContent.includes("Google indisponível")');
    await evaluate('document.querySelector(".auth-back").click()');
    await ready();
    assert.equal(
      await evaluate('document.querySelector("#quotation-notes").value'),
      'Rascunho parcial preservado',
    );
    await command('Page.navigate', {
      url: origin + '/login?google_error=invalid_google&returnTo=%2Fgerador-de-orcamentos',
    });
    await waitFor('!!document.querySelector(".auth-back")');
    await evaluate('document.querySelector(".auth-back").click()');
    await ready();
    await click('Entrar e salvar na conta');
    await waitFor('!!document.querySelector("#email")');
    await field('#email', 'ficticio1@example.test');
    await field('#password', 'wrong-password');
    await evaluate('document.querySelector(".auth-submit").click()');
    await waitFor('document.body.textContent.includes("E-mail ou senha inválidos")');
    await field('#password', 'a-strong-password');
    await evaluate('document.querySelector(".auth-submit").click()');
    await ready();
    await saved();
    assert.equal(drafts.size, 1);
    let current = [...drafts.values()][0];
    assert.ok(current.logo);
    assert.equal(current.payload.notes, 'Rascunho parcial preservado');
    assert.equal(current.payload.template_id, 'classic');
    await field('#item-price-0', '12,345');
    await saved();
    await waitFor('document.body.textContent.includes("Comprar cinco créditos por R$ 9,90")');
    await click('Comprar cinco créditos por R$ 9,90');
    await waitFor('document.body.textContent.includes("Não foi possível abrir o Checkout")');
    await click('Comprar cinco créditos por R$ 9,90');
    await waitFor('!document.querySelector("app-quotation-commerce button").disabled');
    assert.equal(checkoutKeys.length, 2);
    assert.equal(checkoutKeys[0], checkoutKeys[1]);
    assert.equal(generationPosts, 0);
    await command('Page.navigate', {
      url: origin + '/gerador-de-orcamentos?quotation_order=' + orderId + '&payment=cancelled',
    });
    await ready();
    await waitFor('document.body.textContent.includes("Pagamento pendente")');
    await waitFor('document.querySelector("#item-price-0").value === "12,345"');
    assert.equal(
      await evaluate('document.querySelector("#quotation-notes").value'),
      'Rascunho parcial preservado',
    );
    assert.equal(await evaluate('!!document.querySelector(".logo-selected img")'), true);
    assert.equal(await evaluate('document.querySelector("#item-price-0").value'), '12,345');
    assert.equal(generationPosts, 0);
    await command('Page.navigate', {
      url: origin + '/gerador-de-orcamentos?quotation_order=' + orderId + '&payment=success',
    });
    await ready();
    await waitFor('document.body.textContent.includes("Pagamento pendente")');
    assert.equal(creditBalance, 0);
    assert.equal(generationPosts, 0);
    orderStatus = 'paid';
    creditBalance = 5;
    await click('Consultar pagamento');
    await waitFor(
      'document.body.textContent.includes("Pagamento confirmado") && document.body.textContent.includes("5 disponíveis")',
    );
    assert.equal(generationPosts, 0);
    assert.equal(
      await evaluate('document.querySelector("input[name=quotation-source]").checked'),
      false,
    );
    await evaluate('document.querySelector("input[name=quotation-source]").click()');
    await field('#customer-name', 'Cliente Fictício');
    await field('#item-description-0', 'Serviço de teste');
    await field('#item-quantity-0', '1');
    await field('#item-price-0', '10,00');
    await saved();
    await evaluate('document.querySelector(".generate-pdf").click()');
    await waitFor('document.querySelector(".quotation-generation [role=alert]") !== null');
    assert.equal(generationPosts, 1);
    for (const width of [320, 768, 1440]) {
      await command('Emulation.setDeviceMetricsOverride', {
        width,
        height: 950,
        deviceScaleFactor: 1,
        mobile: width === 320,
      });
      assert.equal(
        await evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'),
        true,
      );
    }
    assert.deepEqual(errors, []);
    await writeFile(
      resolve(artifacts, 'report.json'),
      JSON.stringify(
        {
          checks: [
            'explicit credit selection',
            'checkout preparation preserves logo and incomplete draft',
            'stable checkout key after failure',
            'cancelled return',
            'URL success does not grant',
            'backend pending then paid',
            'no automatic PDF',
            'manual paid emission',
            'three responsive widths',
          ],
          generationPosts,
          checkoutAttempts: checkoutKeys.length,
          errors,
        },
        null,
        2,
      ),
    );
    console.log(
      'Quotation commerce browser passed: explicit credit, checkout failure/cancel/pending/paid, IndexedDB/logo preservation and manual issuance. No remote Stripe requests.',
    );
  });
} finally {
  await new Promise((done) => server.close(done));
}
