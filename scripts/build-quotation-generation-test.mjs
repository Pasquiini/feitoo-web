import { spawn } from 'node:child_process';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// A separate local artifact: never replace the default build or leave launch flags enabled.
const workspace = fileURLToPath(new URL('../', import.meta.url));
const release = process.argv.includes('--release');
const output = release ? 'dist/quotation-release' : 'dist/quotation-generation-test';
const targets = ['src/environments/launch.generated.ts', '.angular-launch.json'];
const originals = await Promise.all(
  targets.map(async (path) => {
    try {
      return await readFile(new URL('../' + path, import.meta.url));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      return null;
    }
  }),
);
const env = {
  ...process.env,
  VERCEL_ENV: release ? 'production' : 'preview',
  FEITOO_BUILD_ENV: release ? 'production' : 'test',
  FEITOO_PUBLIC_ORIGIN: 'https://feitoo.com.br',
  FEITOO_ASSET_OUTPUT: output + '/browser',
  FEITOO_QUOTATIONS_ENABLED: 'true',
  FEITOO_ANALYTICS_ENABLED: 'false',
};
const run = (args) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: workspace,
      env,
      stdio: 'inherit',
      windowsHide: true,
    });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error('Isolated quotation test build failed.')),
    );
  });
try {
  await run(['scripts/configure-launch.mjs']);
  await run([
    'node_modules/@angular/cli/bin/ng.js',
    'build',
    '--configuration',
    'production',
    '--output-path',
    output,
  ]);
  if (release) await run(['scripts/generate-public-assets.mjs']);
} finally {
  for (const [index, path] of targets.entries()) {
    const target = new URL('../' + path, import.meta.url);
    if (originals[index] === null) await rm(target, { force: true });
    else await writeFile(target, originals[index]);
  }
}
console.log(`Isolated validation build: ${output}/browser; launch files restored.`);
