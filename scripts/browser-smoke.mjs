import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

// Shared CDP harness for browser checks; no production dependencies.
export async function withBrowser(name, run, { blockExternal = false } = {}) {
  const browser = spawn(
    process.env.FEITOO_BROWSER_BINARY ??
      'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${resolve('dist/validation', name + '-' + process.pid)}`,
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
      const timer = setTimeout(() => reject(new Error('Browser startup timeout')), 20000);
      browser.stderr.on('data', (data) => {
        const match = /DevTools listening on (ws:\/\/\S+)/.exec(data.toString());
        if (match) {
          clearTimeout(timer);
          done(match[1]);
        }
      });
      browser.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
    socket = new WebSocket(endpoint);
    await new Promise((done, reject) => {
      socket.onopen = done;
      socket.onerror = reject;
    });
    let sequence = 0;
    const pending = new Map();
    const errors = [];
    socket.onmessage = ({ data }) => {
      const message = JSON.parse(data);
      if (message.id) {
        const request = pending.get(message.id);
        if (!request) return;
        pending.delete(message.id);
        clearTimeout(request.timer);
        message.error
          ? request.reject(new Error(message.error.message))
          : request.done(message.result);
      } else if (blockExternal && message.method === 'Fetch.requestPaused') {
        const local = ['localhost', '127.0.0.1', '[::1]'].includes(
          new URL(message.params.request.url).hostname,
        );
        // Intercept documents as well as subresources. Network.setBlockedURLs alone may
        // still allow a top-level external navigation on some browser versions.
        void send(
          local ? 'Fetch.continueRequest' : 'Fetch.fulfillRequest',
          local
            ? { requestId: message.params.requestId }
            : {
                requestId: message.params.requestId,
                responseCode: 200,
                responseHeaders: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }],
                body: Buffer.from(
                  '<!doctype html><title>Simulador local</title><p>Destino externo interceptado pelo laboratório local.</p>',
                ).toString('base64'),
              },
          message.sessionId,
        ).catch(() => {});
      } else if (message.method === 'Runtime.exceptionThrown')
        errors.push(
          message.params.exceptionDetails.text +
            (message.params.exceptionDetails.exception?.description
              ? ': ' + message.params.exceptionDetails.exception.description
              : ''),
        );
    };
    const send = (method, params = {}, sessionId) =>
      new Promise((done, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error('CDP timeout: ' + method));
        }, 20000);
        pending.set(id, { done, reject, timer });
        socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      });
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const command = (method, params, targetSession = sessionId) =>
      send(method, params, targetSession);
    await command('Runtime.enable');
    await command('Page.enable');
    await command('Network.enable');
    if (blockExternal)
      await command('Fetch.enable', {
        patterns: [{ urlPattern: 'http*', requestStage: 'Request' }],
      });
    await command('Network.setBlockedURLs', {
      urls: ['*googletagmanager.com*', '*google-analytics.com*'],
    });
    const evaluate = async (expression, targetSession = sessionId) => {
      const r = await command(
        'Runtime.evaluate',
        {
          expression,
          returnByValue: true,
          awaitPromise: true,
        },
        targetSession,
      );
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
      return r.result.value;
    };
    const waitFor = async (expression, targetSession = sessionId) => {
      for (let i = 0; i < 150; i++) {
        if (await evaluate(expression, targetSession)) return;
        await new Promise((done) => setTimeout(done, 100));
      }
      throw new Error('Condition timed out: ' + expression);
    };
    const newPage = async (url) => {
      const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
      const { sessionId: other } = await send('Target.attachToTarget', { targetId, flatten: true });
      await command('Runtime.enable', {}, other);
      await command('Page.enable', {}, other);
      await command('Network.enable', {}, other);
      await command(
        'Network.setBlockedURLs',
        { urls: ['*googletagmanager.com*', '*google-analytics.com*'] },
        other,
      );
      await command('Page.navigate', { url }, other);
      return {
        command: (method, params) => command(method, params, other),
        evaluate: (expression) => evaluate(expression, other),
        waitFor: (expression) => waitFor(expression, other),
      };
    };
    return await run({ command, evaluate, waitFor, errors, newPage });
  } finally {
    socket?.close();
    browser.kill();
  }
}
