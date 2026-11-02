// Synthetic local API only. No credentials, checkout or production requests.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { JSDOM } from 'jsdom';
import { withBrowser } from './browser-smoke.mjs';

const root = resolve('dist/feitoo-web/browser');
const artifacts = resolve('dist/validation/navbar-premium');
await mkdir(artifacts, { recursive: true });
const document = new JSDOM(await readFile(resolve(root, 'index.html'), 'utf8')).window.document;
const toolRoutes = [...document.querySelectorAll('.tool-group a')].map((a) =>
  a.getAttribute('href'),
);
assert.equal(toolRoutes.length, 7);
assert.equal(document.querySelector('#tools-dropdown').hidden, true);
assert.equal(
  document.querySelector('[data-nav-trigger=tools]').getAttribute('aria-expanded'),
  'false',
);
assert.equal(document.querySelector('.account-menu'), null);
assert.equal(document.querySelector('app-navbar-credits'), null);
assert.equal(document.querySelector('.skip-link').getAttribute('href'), '#main-content');
let mode = 'guest';
let origin;
const requests = [];
const unexpected = [];
const quota = {
  enabled: true,
  source: 'free',
  policy: 'explicit_source',
  daily_limit: 1,
  remaining: 1,
  consumed: 0,
  reserved: 0,
  resets_at: '2026-11-03T03:00:00Z',
  active_processing: null,
  latest_processing: null,
  credits: { granted: 5, available: 5, reserved: 0, consumed: 0, revoked: 0 },
  pro: { active: false, remaining: 0 },
  offer: { available: false, code: 'quotation_5', credits: 5, amount: 990, currency: 'brl' },
};
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname;
    if (path === '/__navbar-fixture') {
      mode = url.searchParams.get('mode');
      res.end('ok');
      return;
    }
    if (path.startsWith('/api/') || path.startsWith('/sanctum/')) {
      requests.push({ path, method: req.method });
      res.setHeader('Content-Type', 'application/json');
      if (path === '/sanctum/csrf-cookie') {
        res.setHeader('Set-Cookie', 'XSRF-TOKEN=synthetic; Path=/');
        res.writeHead(204).end();
        return;
      }
      if (path === '/api/me') {
        if (mode === 'guest' || mode === 'expired') {
          res.writeHead(401).end('{}');
          return;
        }
        res.end(
          JSON.stringify({
            data: {
              id: mode === 'second' ? 2 : 1,
              name: mode === 'second' ? 'Outra Pessoa' : 'Pessoa Demonstração',
              email: 'private@example.test',
              has_password: true,
              google_linked: false,
              created_at: '2026-10-01',
            },
          }),
        );
        return;
      }
      if (path === '/api/quotations/entitlements') {
        if (mode === 'expired') {
          res.writeHead(401).end('{}');
          return;
        }
        res.end(JSON.stringify({ data: quota }));
        return;
      }
      if (path === '/api/auth/logout' && req.method === 'POST') {
        mode = 'guest';
        res.writeHead(204).end();
        return;
      }
      if (path.endsWith('/config')) {
        res.end(
          JSON.stringify({
            data: {
              max_files: 20,
              max_processing_files: 250,
              max_file_size_kb: 10240,
              max_total_size_kb: 40960,
              max_processing_items: 4000,
              ttl_minutes: 120,
              free: { per_processing: 3, daily: 6 },
              packages: [],
              checkout_available: false,
            },
          }),
        );
        return;
      }
      if (path === '/api/account/subscription') {
        res.end(
          JSON.stringify({
            data: { subscription: null, offer: { available: false }, actions: {}, state: 'free' },
          }),
        );
        return;
      }
      if (path === '/api/account/usage') {
        res.end(
          JSON.stringify({
            data: {
              plan: 'free',
              limits: {
                daily: 6,
                remaining_today: 6,
                used_today: 0,
                per_processing: 3,
                resets_at: '2026-11-03T03:00:00Z',
              },
            },
          }),
        );
        return;
      }
      if (path === '/api/processings') {
        res.end(JSON.stringify({ data: [], meta: { current_page: 1, last_page: 1 } }));
        return;
      }
      unexpected.push({ path, method: req.method });
      res.writeHead(404).end('{}');
      return;
    }
    const file = resolve(root, '.' + path);
    if (file !== root && !file.startsWith(root + '/') && !file.startsWith(root + '\\')) {
      res.writeHead(403).end();
      return;
    }
    const actual = extname(file) ? file : resolve(file, 'index.html');
    const body = await readFile(actual);
    res.setHeader(
      'Content-Type',
      {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.png': 'image/png',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
      }[extname(actual)] ?? 'application/octet-stream',
    );
    res.end(
      extname(actual) === '.js'
        ? body.toString().replaceAll('https://api.feitoo.com.br', origin)
        : body,
    );
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
origin = `http://127.0.0.1:${server.address().port}`;
try {
  await withBrowser(
    'navbar-premium',
    async ({ command, evaluate, waitFor, errors }) => {
      await command('Page.addScriptToEvaluateOnNewDocument', {
        source: `window.navConsole=[]; for(const level of ['warn','error']) { const original=console[level].bind(console); console[level]=(...args)=>{window.navConsole.push({level,message:args.map(String).join(' ')});original(...args);}; }`,
      });
      const consoles = [];
      const layouts = [];
      const contrastSamples = [];
      const key = async (key, code = key) => {
        await command('Input.dispatchKeyEvent', {
          type: 'keyDown',
          key,
          code,
          ...(key === 'Enter' ? { text: '\r', windowsVirtualKeyCode: 13 } : {}),
          ...(key === 'Tab' ? { windowsVirtualKeyCode: 9 } : {}),
        });
        await command('Input.dispatchKeyEvent', { type: 'keyUp', key, code });
      };
      const click = async (selector) => {
        const point = await evaluate(
          `(() => { const e=document.querySelector(${JSON.stringify(selector)}); e.scrollIntoView({block:'nearest'}); const r=e.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`,
        );
        await command('Input.dispatchMouseEvent', {
          type: 'mousePressed',
          button: 'left',
          clickCount: 1,
          ...point,
        });
        await command('Input.dispatchMouseEvent', {
          type: 'mouseReleased',
          button: 'left',
          clickCount: 1,
          ...point,
        });
        await evaluate(
          'new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))',
        );
      };
      const outside = async () => {
        await command('Input.dispatchMouseEvent', {
          type: 'mousePressed',
          x: 4,
          y: 150,
          button: 'left',
          clickCount: 1,
        });
        await command('Input.dispatchMouseEvent', {
          type: 'mouseReleased',
          x: 4,
          y: 150,
          button: 'left',
          clickCount: 1,
        });
      };
      const allClosed = () =>
        waitFor(
          '[...document.querySelectorAll("header button[aria-expanded]")].every(e=>e.getAttribute("aria-expanded")==="false")',
        );
      const ensureNav = async (width) => {
        if (
          width <= 900 &&
          (await evaluate(
            'document.querySelector(".mobile-menu-toggle").getAttribute("aria-expanded") === "false"',
          ))
        )
          await click('.mobile-menu-toggle');
      };
      const shot = async (name) => {
        const { data } = await command('Page.captureScreenshot', { format: 'png' });
        await writeFile(resolve(artifacts, name + '.png'), Buffer.from(data, 'base64'));
      };
      const bounds = async (selector, width, state) => {
        const r = await evaluate(
          `(() => {const e=document.querySelector(${JSON.stringify(selector)}), r=e.getBoundingClientRect(); return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,viewportHeight:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth,visible:getComputedStyle(e).display!=='none'};})()`,
        );
        assert.equal(r.overflow, false, `${state}: overflow at ${width}`);
        assert.equal(r.visible, true, `${state}: hidden`);
        assert.ok(
          r.left >= 0 && r.right <= width + 1 && r.bottom <= r.viewportHeight + 1,
          `${state}: clipped ${JSON.stringify(r)}`,
        );
        layouts.push({ width, state, ...r });
      };
      for (const authenticated of [false, true]) {
        await command('Page.navigate', { url: origin + '/' });
        await waitFor('!!document.querySelector("app-home")?.__ngContext__');
        if (!authenticated) {
          await key('Tab');
          assert.equal(await evaluate('document.activeElement.matches(".skip-link")'), true);
          await key('Enter');
          assert.equal(await evaluate('document.activeElement.id'), 'main-content');
        }
        await evaluate(`fetch('/__navbar-fixture?mode=${authenticated ? 'user' : 'guest'}')`);
        consoles.push(...(await evaluate('window.navConsole')));
        for (const width of [360, 390, 768, 1024, 1440]) {
          await command('Emulation.setDeviceMetricsOverride', {
            width,
            height: 900,
            deviceScaleFactor: 1,
            mobile: width < 768,
          });
          await command('Page.navigate', { url: origin + '/' });
          await waitFor('!!document.querySelector("app-home")?.__ngContext__');
          await waitFor(
            authenticated
              ? '!!document.querySelector(".account-trigger") && document.querySelector(".credit-trigger").textContent.includes("5")'
              : '!!document.querySelector(".account-link")',
          );
          await allClosed();
          await bounds(
            '.site-header',
            width,
            authenticated ? 'authenticated-closed' : 'guest-closed',
          );
          const tag = `${authenticated ? 'authenticated' : 'guest'}-${width}`;
          await shot(tag + '-closed');
          if (width <= 900) {
            await click('.mobile-menu-toggle');
            await bounds('#primary-nav', width, 'mobile-open');
            await shot(tag + '-mobile');
            await outside();
            await allClosed();
          }
          await ensureNav(width);
          await evaluate('document.querySelector("[data-nav-trigger=tools]").focus()');
          await key('Enter');
          await waitFor(
            'document.querySelector("[data-nav-trigger=tools]").getAttribute("aria-expanded")==="true"',
          );
          await bounds(width <= 900 ? '#primary-nav' : '#tools-dropdown', width, 'tools-open');
          assert.equal(await evaluate('document.querySelectorAll(".tool-group a").length'), 7);
          await shot(tag + '-tools');
          await click('.tool-group h2');
          assert.equal(
            await evaluate(
              'document.querySelector("[data-nav-trigger=tools]").getAttribute("aria-expanded")',
            ),
            'true',
          );
          await evaluate('document.querySelector("[data-nav-trigger=tools]").focus()');
          await key('Tab');
          assert.equal(await evaluate('document.activeElement.matches(".catalog-link")'), true);
          for (const route of toolRoutes) {
            await key('Tab');
            assert.equal(await evaluate('document.activeElement.getAttribute("href")'), route);
          }
          assert.equal(
            await evaluate('getComputedStyle(document.activeElement).outlineStyle'),
            'solid',
          );
          await key('Escape');
          await allClosed();
          assert.equal(
            await evaluate(
              `document.activeElement.matches('${width <= 900 ? '.mobile-menu-toggle' : '[data-nav-trigger=tools]'}')`,
            ),
            true,
          );
          await ensureNav(width);
          await click('[data-nav-trigger=tools]');
          await outside();
          await allClosed();

          if (authenticated) {
            await click('[data-nav-trigger=account]');
            await bounds('#account-dropdown', width, 'account-open');
            assert.equal(
              await evaluate('document.querySelector(".account-user").textContent'),
              'Pessoa Demonstração',
            );
            assert.equal(
              await evaluate(
                'document.querySelector("#account-dropdown").textContent.includes("private@example.test")',
              ),
              false,
            );
            await shot(tag + '-account');
            if (width === 1440) {
              const samples = await evaluate(`(() => {
                const rgb = value => value.match(/[\\d.]+/g).slice(0,3).map(Number);
                const lum = values => values.map(v => {const s=v/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
                return [...document.querySelectorAll('header button, header a, .tool-group h2, .account-greeting, .account-user, footer a, footer button, footer h2, footer small')].filter(e=>e.getClientRects().length && getComputedStyle(e).visibility!=='hidden').map(e=>{
                  let parent=e,bg='rgb(255,255,255)';while(parent){const color=getComputedStyle(parent).backgroundColor;if(color!=='rgba(0, 0, 0, 0)'&&color!=='transparent'){bg=color;break;}parent=parent.parentElement;}
                  const colors=[lum(rgb(getComputedStyle(e).color)),lum(rgb(bg))];return {text:e.textContent.trim().slice(0,60),ratio:(Math.max(...colors)+.05)/(Math.min(...colors)+.05)};
                });
              })()`);
              assert.ok(samples.every((sample) => sample.ratio >= 4.5));
              contrastSamples.push(...samples);
            }
            await click('.account-user');
            assert.equal(
              await evaluate(
                'document.querySelector("[data-nav-trigger=account]").getAttribute("aria-expanded")',
              ),
              'true',
            );
            await outside();
            await allClosed();
            await click('[data-nav-trigger=account]');
            await key('Escape');
            await allClosed();
            assert.equal(
              await evaluate('document.activeElement.matches("[data-nav-trigger=account]")'),
              true,
            );
            await click('[data-nav-trigger=account]');
            await ensureNav(width);
            await click('[data-nav-trigger=tools]');
            assert.equal(
              await evaluate('document.querySelector("#account-dropdown").hidden'),
              true,
            );
            await click('[data-nav-trigger=credits]');
            await bounds('#credit-popover', width, 'credits-open');
            assert.equal(await evaluate('document.querySelector("#tools-dropdown").hidden'), true);
            await shot(tag + '-credits');
            await key('Escape');
            await allClosed();
            assert.equal(
              await evaluate('document.activeElement.matches("[data-nav-trigger=credits]")'),
              true,
            );
            await click('[data-nav-trigger=account]');
            await click('#account-dropdown a');
            await waitFor(
              'location.pathname==="/conta" && !!document.querySelector("app-account-page")',
            );
            await allClosed();
            await click('.site-header .brand');
            await waitFor('!!document.querySelector("app-home")');
          }
          await ensureNav(width);
          await click('[data-nav-trigger=tools]');
          await click('.tool-group a[href="/docx-para-pdf"]');
          await waitFor(
            'location.pathname==="/docx-para-pdf" && !!document.querySelector("#docx-files")',
          );
          await allClosed();
          if (!authenticated)
            assert.equal(
              await evaluate('document.querySelector(".account-link").getAttribute("href")'),
              '/login?returnTo=%2Fdocx-para-pdf',
            );
          await ensureNav(width);
          await click('#primary-nav > a[href="/planos"]');
          await waitFor(
            'location.pathname==="/planos" && document.querySelectorAll(".plan-card").length===3',
          );
          await allClosed();
          await click('.site-header .brand');
          await waitFor('!!document.querySelector("app-home")');
          for (const path of [
            ...toolRoutes,
            '/planos',
            '/seguranca',
            '/privacidade',
            '/termos',
            '/conta',
          ])
            assert.equal(
              await evaluate(`!!document.querySelector('footer a[href="${path}"]')`),
              true,
            );
          await evaluate('document.querySelector("footer").scrollIntoView()');
          assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'), false);
          if (authenticated) await shot(tag + '-footer');
          await evaluate('scrollTo(0,0)');
          consoles.push(...(await evaluate('window.navConsole')));
        }
      }

      // Landscape bounds and responsive state reset without a reload.
      await command('Emulation.setDeviceMetricsOverride', {
        width: 390,
        height: 480,
        deviceScaleFactor: 1,
        mobile: true,
      });
      await ensureNav(390);
      await click('[data-nav-trigger=tools]');
      await bounds('#primary-nav', 390, 'short-viewport');
      await shot('authenticated-390-short-tools');
      await command('Emulation.setDeviceMetricsOverride', {
        width: 1440,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await allClosed();
      await command('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
      });
      assert.equal(
        await evaluate(
          'getComputedStyle(document.querySelector(".nav-trigger")).transitionDuration',
        ),
        '0s',
      );
      await command('Emulation.setEmulatedMedia', { features: [] });

      // Expiry arrives through the unchanged HTTP interceptor and AuthService.
      await click('[data-nav-trigger=credits]');
      await evaluate("fetch('/__navbar-fixture?mode=expired')");
      await click('#credit-popover button');
      await waitFor(
        '!document.querySelector(".account-menu") && !!document.querySelector(".account-link")',
      );
      await allClosed();
      await evaluate("fetch('/__navbar-fixture?mode=second')");
      consoles.push(...(await evaluate('window.navConsole')));
      await command('Page.reload', { ignoreCache: true });
      await waitFor('!!document.querySelector(".account-trigger")');
      await allClosed();
      await click('[data-nav-trigger=account]');
      assert.equal(
        await evaluate('document.querySelector(".account-user").textContent'),
        'Outra Pessoa',
      );
      await click('.logout-button');
      await waitFor('location.pathname==="/login" && !document.querySelector(".account-menu")');
      await allClosed();
      consoles.push(...(await evaluate('window.navConsole')));

      await command('Accessibility.enable');
      const tree = await command('Accessibility.getFullAXTree');
      assert.deepEqual(
        tree.nodes.filter(
          (n) => !n.ignored && ['button', 'link'].includes(n.role?.value) && !n.name?.value,
        ),
        [],
      );
      assert.deepEqual(errors, []);
      assert.deepEqual(consoles, []);
      assert.deepEqual(unexpected, []);
      assert.ok(requests.every((r) => r.method === 'GET' || r.path === '/api/auth/logout'));
      await writeFile(
        resolve(artifacts, 'report.json'),
        JSON.stringify(
          {
            layouts,
            requests,
            console: consoles,
            runtimeErrors: errors,
            contrast: {
              minimum: Math.min(...contrastSamples.map((sample) => sample.ratio)),
              samples: contrastSamples,
            },
            checks: {
              outsideClick: true,
              insideClick: true,
              exclusiveDropdowns: true,
              navigationCloses: true,
              keyboard: true,
              escapeFocus: true,
              anonymousReturnTo: true,
              authenticatedCredits: true,
              sessionExpiry: true,
              sessionReplacement: true,
              logout: true,
              hydration: true,
              responsiveReset: true,
              shortViewport: true,
              footerLinks: true,
              namedControls: true,
              skipLink: true,
              allToolsKeyboard: true,
              reducedMotion: true,
            },
          },
          null,
          2,
        ),
      );
      console.log(
        `Navbar: ${layouts.length} layout checks, guest/authenticated menus, outside clicks, keyboard, route changes, session expiry and logout passed.`,
      );
    },
    { blockExternal: true },
  );
} finally {
  await new Promise((done) => server.close(done));
}
