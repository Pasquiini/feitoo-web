import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

// Shared CDP harness for browser checks; no production dependencies.
export async function withBrowser(name, run) {
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
      } else if (message.method === 'Runtime.exceptionThrown')
        errors.push(message.params.exceptionDetails.text);
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
    const command = (method, params) => send(method, params, sessionId);
    await command('Runtime.enable');
    await command('Page.enable');
    await command('Network.enable');
    await command('Network.setBlockedURLs', {
      urls: ['*googletagmanager.com*', '*google-analytics.com*'],
    });
    const evaluate = async (expression) => {
      const r = await command('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
      return r.result.value;
    };
    const waitFor = async (expression) => {
      for (let i = 0; i < 150; i++) {
        if (await evaluate(expression)) return;
        await new Promise((done) => setTimeout(done, 100));
      }
      throw new Error('Condition timed out: ' + expression);
    };
    return await run({ command, evaluate, waitFor, errors });
  } finally {
    socket?.close();
    browser.kill();
  }
}
