// Local production-build checks. All API responses are synthetic; external requests are blocked.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { JSDOM } from 'jsdom';
import { withBrowser } from './browser-smoke.mjs';

const root = resolve('dist/feitoo-web/browser');
const artifacts = resolve('dist/validation/home-premium');
await mkdir(artifacts, { recursive: true });
const prerender = new JSDOM(await readFile(resolve(root, 'index.html'), 'utf8')).window.document;
const toolRoutes = [...prerender.querySelectorAll('app-home .home-tool-card > a')].map((a) =>
  a.getAttribute('href'),
);
assert.equal(toolRoutes.length, 7, 'Run against a production build with quotations enabled');
assert.equal(new Set(toolRoutes).size, toolRoutes.length);
for (const route of [...toolRoutes, '/seguranca', '/planos']) {
  const page = new JSDOM(await readFile(resolve(root, '.' + route, 'index.html'), 'utf8')).window
    .document;
  assert.equal(page.querySelectorAll('h1').length, 1, route);
  assert.equal(page.querySelector('meta[name="robots"]').content, 'index,follow', route);
}
const apiRequests = [];
const unexpectedApi = [];
let origin;
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path.startsWith('/api/') || path.startsWith('/sanctum/')) {
      apiRequests.push({ path, method: req.method });
      res.setHeader('Content-Type', 'application/json');
      if (path === '/api/me') {
        res.writeHead(401).end(JSON.stringify({ message: 'Unauthenticated.' }));
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
      unexpectedApi.push({ path, method: req.method });
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
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.html': 'text/html; charset=utf-8',
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
    'home-premium',
    async ({ command, evaluate, waitFor, errors }) => {
      await command('Page.addScriptToEvaluateOnNewDocument', {
        source: `
      window.homeConsole = [];
      for (const level of ['warn', 'error']) {
        const original = console[level].bind(console);
        console[level] = (...args) => { window.homeConsole.push({ level, message: args.map(String).join(' ') }); original(...args); };
      }
    `,
      });
      const ready = async () => {
        await waitFor('!!document.querySelector("app-home")?.__ngContext__');
        await waitFor('document.querySelectorAll(".home-tool-card").length === 7');
        await evaluate(
          'new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))',
        );
      };
      const home = async () => {
        await command('Page.navigate', { url: origin + '/' });
        await ready();
      };
      const key = async (key, code = key, extra = {}) => {
        await command('Input.dispatchKeyEvent', {
          type: 'keyDown',
          key,
          code,
          ...(key === 'Enter'
            ? { text: '\r', unmodifiedText: '\r', windowsVirtualKeyCode: 13 }
            : {}),
          ...extra,
        });
        await command('Input.dispatchKeyEvent', { type: 'keyUp', key, code, ...extra });
      };
      const search = async (text) => {
        await evaluate('document.querySelector("#tool-search").focus()');
        await key('a', 'KeyA', { modifiers: 2, windowsVirtualKeyCode: 65 });
        await command('Input.insertText', { text });
      };
      const layouts = [];
      const consoles = [];
      for (const width of [360, 390, 768, 1024, 1440]) {
        await command('Emulation.setDeviceMetricsOverride', {
          width,
          height: 1000,
          deviceScaleFactor: 1,
          mobile: width < 768,
        });
        await home();
        const layout = await evaluate(`(() => {
        const search = document.querySelector('#tool-search').getBoundingClientRect();
        return { width: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth,
          searchAboveFold: search.bottom < innerHeight,
          cards: [...document.querySelectorAll('.home-tool-card')].map(e => ({ width: e.getBoundingClientRect().width, height: e.getBoundingClientRect().height })),
          categories: [...document.querySelectorAll('.tool-category h3')].map(e => e.textContent),
          sections: document.querySelectorAll('app-home > section').length };
      })()`);
        assert.equal(layout.overflow, false, `Overflow at ${width}`);
        assert.equal(layout.searchAboveFold, true, `Search below fold at ${width}`);
        assert.deepEqual(layout.categories, ['XML e Fiscal', 'Documentos', 'Negócios']);
        assert.equal(layout.sections, 4);
        const { cssContentSize } = await command('Page.getLayoutMetrics');
        const shot = await command('Page.captureScreenshot', {
          format: 'png',
          captureBeyondViewport: true,
          clip: { x: 0, y: 0, width, height: cssContentSize.height, scale: 1 },
        });
        await writeFile(resolve(artifacts, `home-${width}.png`), Buffer.from(shot.data, 'base64'));
        layouts.push({ ...layout, pageHeight: cssContentSize.height });

        await search('  ORÇAMENTO  ');
        await waitFor('document.querySelectorAll(".home-tool-card").length === 1');
        assert.equal(
          await evaluate('document.querySelector(".tool-category h3").textContent'),
          'Negócios',
        );
        await key('Escape');
        await ready();
        await search('word');
        await waitFor('document.querySelectorAll(".home-tool-card").length === 1');
        assert.equal(
          await evaluate('document.querySelector(".home-tool-card a").getAttribute("href")'),
          '/docx-para-pdf',
        );
        await key('Tab', 'Tab', { windowsVirtualKeyCode: 9 });
        assert.equal(
          await evaluate('document.activeElement.getAttribute("aria-label")'),
          'Limpar busca',
        );
        await key('Enter', 'Enter', { windowsVirtualKeyCode: 13, text: '\r' });
        await ready();
        assert.equal(await evaluate('document.activeElement.id'), 'tool-search');
        await search('inexistente');
        await waitFor('!!document.querySelector(".empty-state")');
        assert.match(
          await evaluate('document.querySelector("#search-status").textContent'),
          /0 ferramentas encontradas/,
        );
        assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false);
        await evaluate('document.querySelector(".empty-state button").click()');
        await ready();
        assert.equal(await evaluate('document.activeElement.id'), 'tool-search');
        await key('Tab', 'Tab', { windowsVirtualKeyCode: 9 });
        assert.equal(await evaluate('document.activeElement.matches(".home-tool-card a")'), true);
        assert.equal(
          await evaluate('getComputedStyle(document.activeElement).outlineStyle'),
          'solid',
        );
        assert.ok(
          await evaluate('parseFloat(getComputedStyle(document.activeElement).outlineWidth) >= 3'),
        );

        if (width <= 900) {
          await evaluate('document.querySelector(".mobile-menu-toggle").click()');
          await waitFor(
            'document.querySelector(".mobile-menu-toggle").getAttribute("aria-expanded") === "true"',
          );
          assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false);
          await evaluate('document.querySelector("[data-nav-trigger=tools]").focus()');
          await key('Enter', 'Enter', { windowsVirtualKeyCode: 13 });
          await waitFor(
            'document.querySelector("[data-nav-trigger=tools]").getAttribute("aria-expanded") === "true"',
          );
          await key('Escape');
          await waitFor(
            'document.querySelector("[data-nav-trigger=tools]").getAttribute("aria-expanded") === "false"',
          );
          await key('Escape');
          await waitFor(
            'document.querySelector(".mobile-menu-toggle").getAttribute("aria-expanded") === "false"',
          );
        }
        consoles.push(...(await evaluate('window.homeConsole')));
      }
      await command('Accessibility.enable');
      const ax = await command('Accessibility.getFullAXTree');
      const searchbox = ax.nodes.find((n) => n.role?.value === 'searchbox');
      assert.ok(searchbox?.name?.value, 'Search must have an accessible name');
      const unnamedControls = ax.nodes.filter(
        (n) =>
          !n.ignored && ['button', 'link', 'searchbox'].includes(n.role?.value) && !n.name?.value,
      );
      assert.deepEqual(unnamedControls, []);

      const contrast = await evaluate(`(() => {
      const rgb = value => value.match(/[\\d.]+/g).slice(0, 3).map(Number);
      const lum = values => values.map(v => { const s = v / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [.2126, .7152, .0722][i], 0);
      return [...document.querySelectorAll('app-home h1, app-home h2, app-home h3, app-home h4, app-home p, app-home li, app-home label, .tool-cta, .tool-format')].map(e => {
        const style = getComputedStyle(e); let parent = e; let bg;
        while (parent) { const color = getComputedStyle(parent).backgroundColor; if (color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') { bg = color; break; } parent = parent.parentElement; }
        const colors = [lum(rgb(style.color)), lum(rgb(bg ?? 'rgb(255,255,255)'))];
        return { text: e.textContent.trim().slice(0, 60), ratio: (Math.max(...colors) + .05) / (Math.min(...colors) + .05) };
      });
    })()`);
      assert.ok(
        contrast.every((c) => c.ratio >= 4.5),
        JSON.stringify(contrast.filter((c) => c.ratio < 4.5)),
      );
      await command('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
      });
      assert.equal(
        await evaluate(
          'getComputedStyle(document.querySelector(".home-tool-card")).transitionDuration',
        ),
        '0s',
      );
      await command('Emulation.setEmulatedMedia', { features: [] });

      const visited = [];
      for (const route of [...toolRoutes, '/seguranca', '/planos']) {
        await home();
        const selector = toolRoutes.includes(route)
          ? `.home-tool-card a[href="${route}"]`
          : `app-home a[href="${route}"]`;
        await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
        await waitFor(
          `location.pathname === ${JSON.stringify(route)} && !document.querySelector('app-home') && !!document.querySelector('h1')`,
        );
        assert.equal(await evaluate('document.querySelectorAll("h1").length'), 1, route);
        assert.equal(
          await evaluate('document.documentElement.scrollWidth > innerWidth'),
          false,
          route,
        );
        if (route === '/planos') {
          assert.equal(await evaluate('document.querySelectorAll(".plan-card").length'), 3);
          assert.match(await evaluate('document.querySelector(".plan-pro").textContent'), /29,90/);
        }
        consoles.push(...(await evaluate('window.homeConsole')));
        visited.push(route);
      }

      const preferenceKey = 'feitoo-tool-preferences-v1';
      const readPreferences = () =>
        evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(preferenceKey)}))`);
      await home();
      await waitFor('document.querySelectorAll(".recent-list a").length === 5');
      assert.deepEqual((await readPreferences()).recent, toolRoutes.slice(-5).reverse());
      const previousRecent = (await readPreferences()).recent;
      const firstStar = `[data-tool-route="${toolRoutes[0]}"] .favorite-toggle`;
      await evaluate(`document.querySelector(${JSON.stringify(firstStar)}).focus()`);
      await key('Enter');
      await waitFor('document.querySelectorAll(".favorites-list a").length === 1');
      assert.equal(await evaluate('location.pathname'), '/');
      assert.deepEqual(
        (await readPreferences()).recent,
        previousRecent,
        'Favoriting is not a tool visit',
      );
      assert.equal(
        await evaluate(
          `document.querySelector(${JSON.stringify(firstStar)}).getAttribute('aria-pressed')`,
        ),
        'true',
      );
      assert.equal(
        await evaluate(`document.querySelector(${JSON.stringify(firstStar)}).closest('a')`),
        null,
      );
      consoles.push(...(await evaluate('window.homeConsole')));
      await command('Page.reload', { ignoreCache: true });
      await ready();
      await waitFor('document.querySelectorAll(".favorites-list a").length === 1');
      assert.deepEqual((await readPreferences()).favorites, [toolRoutes[0]]);
      assert.deepEqual((await readPreferences()).recent, previousRecent);
      await evaluate('document.querySelector(".favorites-list button").focus()');
      await key('Enter');
      await waitFor('!document.querySelector(".favorites-list")');
      assert.equal(
        await evaluate(`document.activeElement.matches(${JSON.stringify(firstStar)})`),
        true,
      );
      assert.equal(await evaluate('location.pathname'), '/');
      assert.equal(
        await evaluate(
          `document.querySelector(${JSON.stringify(firstStar)}).getAttribute('aria-pressed')`,
        ),
        'false',
      );

      await command('Page.navigate', {
        url: origin + toolRoutes[0] + '?source=private-test#not-stored',
      });
      await waitFor(
        `JSON.parse(localStorage.getItem(${JSON.stringify(preferenceKey)}))?.recent[0] === ${JSON.stringify(toolRoutes[0])}`,
      );
      const expectedRecent = [toolRoutes[0], ...previousRecent].slice(0, 5);
      assert.deepEqual((await readPreferences()).recent, expectedRecent);
      assert.deepEqual(Object.keys(await readPreferences()).sort(), [
        'favorites',
        'recent',
        'version',
      ]);
      await home();
      await waitFor('document.querySelectorAll(".recent-list a").length === 5');
      assert.deepEqual(
        await evaluate(
          '[...document.querySelectorAll(".recent-list a")].map(a => a.getAttribute("href"))',
        ),
        expectedRecent,
      );
      await evaluate(`document.querySelector(${JSON.stringify(firstStar)}).click()`);
      await evaluate(
        `document.querySelector('[data-tool-route="${toolRoutes[5]}"] .favorite-toggle').click()`,
      );
      await waitFor('document.querySelectorAll(".favorites-list a").length === 2');
      await search('word');
      await waitFor('document.querySelectorAll(".home-tool-card").length === 1');
      assert.equal(await evaluate('document.querySelectorAll(".favorites-list a").length'), 2);
      assert.equal(await evaluate('document.querySelectorAll(".recent-list a").length'), 5);
      assert.deepEqual((await readPreferences()).recent, expectedRecent);
      await key('Escape');
      await ready();
      const personalizedLayouts = [];
      for (const width of [360, 390, 768, 1024, 1440]) {
        await command('Emulation.setDeviceMetricsOverride', {
          width,
          height: 1000,
          deviceScaleFactor: 1,
          mobile: width < 768,
        });
        await evaluate('scrollTo(0, 0)');
        const state = await evaluate(`(() => ({
          overflow: document.documentElement.scrollWidth > innerWidth,
          order: [...document.querySelectorAll('app-home > section')].map(e => e.getAttribute('aria-labelledby')),
          cards: document.querySelectorAll('.home-tool-card').length,
          stars: [...document.querySelectorAll('.favorite-toggle')].map(e => ({ size: e.getBoundingClientRect().width, pressed: e.getAttribute('aria-pressed') })),
          buttonOverlapsFormat: [...document.querySelectorAll('.home-tool-card')].some(e => e.querySelector('.tool-format').getBoundingClientRect().right > e.querySelector('.favorite-toggle').getBoundingClientRect().left)
        }))()`);
        assert.equal(state.overflow, false, `Personalized overflow at ${width}`);
        assert.equal(state.cards, 7, 'Shortcuts must not duplicate cards');
        assert.deepEqual(state.order, [
          'home-title',
          'favorites-title',
          'recent-title',
          'tools-title',
          'security-title',
          'plans-title',
        ]);
        assert.equal(state.buttonOverlapsFormat, false, `Star overlaps file formats at ${width}`);
        assert.ok(state.stars.every((star) => star.size >= 44));
        personalizedLayouts.push({ width, ...state });
        const { cssContentSize } = await command('Page.getLayoutMetrics');
        const shot = await command('Page.captureScreenshot', {
          format: 'png',
          captureBeyondViewport: true,
          clip: { x: 0, y: 0, width, height: cssContentSize.height, scale: 1 },
        });
        await writeFile(
          resolve(artifacts, `home-personalized-${width}.png`),
          Buffer.from(shot.data, 'base64'),
        );
      }
      const personalizedAX = await command('Accessibility.getFullAXTree');
      assert.deepEqual(
        personalizedAX.nodes.filter(
          (n) => !n.ignored && ['button', 'link'].includes(n.role?.value) && !n.name?.value,
        ),
        [],
      );
      consoles.push(...(await evaluate('window.homeConsole')));
      const blockedStorage = await command('Page.addScriptToEvaluateOnNewDocument', {
        source: `
        Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Blocked for test', 'SecurityError'); } });
      `,
      });
      await home();
      assert.equal(await evaluate('document.querySelector(".tool-shortcuts")'), null);
      await evaluate(`document.querySelector(${JSON.stringify(firstStar)}).click()`);
      await waitFor('document.querySelectorAll(".favorites-list a").length === 1');
      await evaluate(
        `document.querySelector('.home-tool-card a[href="${toolRoutes[0]}"]').click()`,
      );
      await waitFor(`location.pathname === ${JSON.stringify(toolRoutes[0])}`);
      await evaluate('document.querySelector("a.brand").click()');
      await ready();
      await waitFor('document.querySelectorAll(".recent-list a").length === 1');
      assert.equal(await evaluate('document.querySelectorAll(".favorites-list a").length'), 1);
      consoles.push(...(await evaluate('window.homeConsole')));
      await command('Page.removeScriptToEvaluateOnNewDocument', {
        identifier: blockedStorage.identifier,
      });
      const preferences = {
        favoriteToggle: true,
        noNavigationOnStar: true,
        reloadPersistence: true,
        recentLimit: 5,
        uniqueAndReordered: true,
        directVisit: true,
        noVisitOnImpression: true,
        storageUnavailable: true,
        personalizedLayouts,
      };
      assert.deepEqual(errors, []);
      assert.deepEqual(consoles, []);
      assert.deepEqual(unexpectedApi, []);
      assert.ok(apiRequests.every((r) => r.method === 'GET'));
      await writeFile(
        resolve(artifacts, 'report.json'),
        JSON.stringify(
          {
            layouts,
            visited,
            preferences,
            search: {
              realKeyboard: true,
              accentInsensitive: true,
              escape: true,
              clearRestoresFocus: true,
              emptyRecovery: true,
            },
            accessibility: {
              namedControls: true,
              keyboardFocus: true,
              reducedMotion: true,
              minTextContrast: Math.min(...contrast.map((c) => c.ratio)),
              contrast,
              screenReaderAudit: false,
            },
            apiRequests,
            console: consoles,
            runtimeErrors: errors,
          },
          null,
          2,
        ),
      );
      console.log(
        `Home: ${layouts.length} base and ${personalizedLayouts.length} personalized layouts, favorites, recent visits, reload, blocked storage, search, keyboard and ${visited.length} route navigations passed.`,
      );
    },
    { blockExternal: true },
  );
} finally {
  await new Promise((done) => server.close(done));
}
