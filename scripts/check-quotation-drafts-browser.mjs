import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { withBrowser } from './browser-smoke.mjs';

// Browser integration uses a local contract fake. Laravel security is tested with SQLite in PHPUnit.
const root = resolve('dist/feitoo-web/browser');
const artifacts = resolve('dist/validation/quotation-drafts');
await mkdir(artifacts, { recursive: true });
let account = null;
let failDrafts = 0;
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
  await withBrowser('quotation-drafts', async (browser) => {
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
    console.log('Draft browser: authentication return and import passed.');
    await command('Page.reload');
    await ready();
    assert.equal(drafts.size, 1);
    current.payload.notes = 'Versão remota recuperada';
    current.revision++;
    await command('Page.reload');
    await ready();
    assert.equal(
      await evaluate('document.querySelector("#quotation-notes").value'),
      'Versão remota recuperada',
    );
    const other = await newPage(origin + '/gerador-de-orcamentos');
    await ready(other);
    await field('#quotation-notes', 'Alteração da segunda aba', other);
    await saved(other);
    await field('#quotation-notes', 'Minha alteração concorrente');
    await waitFor('document.querySelector(".draft-status").textContent.includes("Outra aba")');
    assert.equal(
      await evaluate('document.querySelector("#quotation-notes").value'),
      'Minha alteração concorrente',
    );
    assert.equal(current.payload.notes, 'Alteração da segunda aba');
    await click('Recuperar versão mais recente');
    await waitFor(
      'document.querySelector("#quotation-notes").value === "Alteração da segunda aba"',
    );
    current.revision++;
    current.payload.notes = 'Concorrência no servidor';
    await field('#quotation-notes', 'Conteúdo para revisar');
    await waitFor('document.querySelector(".draft-status").textContent.includes("Outra aba")');
    await click('Preservar meu conteúdo em outro rascunho');
    await saved();
    assert.equal(drafts.size, 2);
    console.log('Draft browser: two tabs and conflicts passed.');
    failDrafts = 503;
    await field('#quotation-notes', 'Salvo durante falha de rede');
    await waitFor(
      'document.querySelector(".draft-status").textContent.includes("Não foi possível sincronizar")',
    );
    records = await readLocal();
    assert.ok(records.some((r) => r.payload.notes === 'Salvo durante falha de rede'));
    failDrafts = 0;
    await click('Salvar agora');
    await saved();
    account = null;
    await field('#quotation-notes', 'Sessão expirou, recuperar depois');
    await waitFor(
      'document.querySelector(".draft-status").textContent.includes("Sessão encerrada ou expirada")',
    );
    await login();
    assert.equal(
      await evaluate('document.querySelector("#quotation-notes").value'),
      'Sessão expirou, recuperar depois',
    );
    await evaluate(
      'document.querySelector("details.account-menu, details:has(.account-name)")?.setAttribute("open", "")',
    );
    await click('Sair');
    await waitFor('!!document.querySelector("#email")');
    records = await readLocal();
    assert.equal(records.filter((r) => r.ownerId !== null).length, 0);
    await field('#email', 'ficticio2@example.test');
    await field('#password', 'a-strong-password');
    await evaluate('document.querySelector(".auth-submit").click()');
    await waitFor('!document.querySelector(".auth-submit")');
    await command('Page.navigate', { url: origin + '/gerador-de-orcamentos' });
    await ready();
    assert.equal(await evaluate('document.querySelector("#issuer-name").value'), '');
    assert.equal(await evaluate('document.querySelector("#quotation-notes").value'), '');
    await field('#quotation-notes', 'Rascunho da conta B');
    await saved();
    await click('Descartar rascunho');
    await waitFor('document.querySelector(".draft-status").textContent.includes("descartado")');
    assert.equal([...drafts.values()].filter((r) => r.owner === 2).length, 0);
    await click('Sair');
    await waitFor('!!document.querySelector("#email")');
    // Exercise registration with the same preserved guest, using the native auth form.
    await command('Page.navigate', { url: origin + '/gerador-de-orcamentos' });
    await ready();
    await field('#quotation-notes', 'Preservado no cadastro');
    await saved();
    await login(2, true);
    assert.equal(
      await evaluate('document.querySelector("#quotation-notes").value'),
      'Preservado no cadastro',
    );
    await click('Descartar rascunho');
    await waitFor('document.querySelector(".draft-status").textContent.includes("descartado")');
    await click('Sair');
    await waitFor('!!document.querySelector("#email")');
    await command('Page.navigate', { url: origin + '/gerador-de-orcamentos' });
    await ready();
    await field('#quotation-notes', 'Este rascunho deve expirar');
    await saved();
    await evaluate(
      `new Promise((resolve,reject) => { const r=indexedDB.open('feitoo-quotation-drafts',1); r.onsuccess=()=>{const db=r.result; const tx=db.transaction('drafts','readwrite'); const s=tx.objectStore('drafts'); const q=s.getAll(); q.onsuccess=()=>{for(const d of q.result) if(d.ownerId===null) s.put({...d,expiresAt:Date.now()-1});};tx.oncomplete=()=>{db.close();resolve();};tx.onerror=reject;};})`,
    );
    await command('Page.reload');
    await ready();
    assert.equal(await evaluate('document.querySelector("#quotation-notes").value'), '');
    assert.equal(
      await evaluate('document.querySelector(".draft-status").textContent.includes("expirado")'),
      true,
    );
    await evaluate(
      `IDBObjectStore.prototype.put = function(){throw new DOMException('test quota','QuotaExceededError')}`,
    );
    await field('#quotation-notes', 'Quota indisponível');
    await waitFor(
      'document.querySelector(".draft-status").textContent.includes("não está garantida")',
    );
    assert.equal(
      await evaluate('document.querySelector("#quotation-notes").value'),
      'Quota indisponível',
    );
    const unavailable = await newPage('about:blank');
    await unavailable.command('Page.addScriptToEvaluateOnNewDocument', {
      source: `Object.defineProperty(window,'indexedDB',{get(){throw new Error('test unavailable')}})`,
    });
    await unavailable.command('Page.navigate', { url: origin + '/gerador-de-orcamentos' });
    await ready(unavailable);
    await unavailable.waitFor(
      'document.querySelector(".draft-status").textContent.includes("não está garantida")',
    );
    await field('#quotation-notes', 'Edição sem IndexedDB', unavailable);
    assert.equal(
      await unavailable.evaluate('document.querySelector("#quotation-notes").value'),
      'Edição sem IndexedDB',
    );
    assert.equal(await evaluate('JSON.stringify(Object.entries(localStorage))'), '[]');
    assert.equal(
      await evaluate(
        'Object.entries(sessionStorage).every(([key,value])=>key==="feitoo.quotation.context" && /^[0-9a-f-]{36}$/.test(value))',
      ),
      true,
    );
    assert.equal(await evaluate('document.querySelector(".generate-pdf").disabled'), false);
    assert.equal(
      requests.some((r) => /processings|purchase|stripe|generation/.test(r.path)),
      false,
    );
    assert.deepEqual(errors, []);
    await writeFile(
      resolve(artifacts, 'report.json'),
      JSON.stringify(
        {
          checks: [
            'IndexedDB autosave',
            'partial refresh',
            'logo refresh',
            'model preservation',
            'Google start failure',
            'OAuth cancellation return',
            'email failure and success',
            'idempotent refresh',
            'remote restoration',
            'two tabs',
            'remote revision conflict',
            'explicit preserved copy',
            'network retry',
            'expired session',
            'logout cleanup',
            'account isolation',
            'discard',
            'opaque session marker',
            'no localStorage',
            'no processing or billing',
            'registration return',
            'local expiration',
            'quota exceeded',
            'IndexedDB unavailable',
          ],
          requests,
          errors,
        },
        null,
        2,
      ),
    );
    console.log(
      'Quotation drafts: 24 browser integration checks passed with real IndexedDB and a local API contract fake.',
    );
  });
} finally {
  await new Promise((done) => server.close(done));
}
