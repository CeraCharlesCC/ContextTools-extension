import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const browser = process.argv[2] ?? 'chrome';
if (!['chrome', 'firefox'].includes(browser)) {
  throw new Error(`Unsupported browser: ${browser}`);
}

const root = fileURLToPath(new URL('..', import.meta.url));
const viteCli = resolve(dirname(createRequire(import.meta.url).resolve('vite/package.json')), 'bin/vite.js');

// Clean once before both watchers start; neither watcher may erase the other's output.
rmSync(new URL(`../dist-${browser}`, import.meta.url), { recursive: true, force: true });
const watchers = ['main', 'content'].map((target) => spawn(
  process.execPath,
  [viteCli, 'build', '--watch', '--mode', 'development'],
  {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'development', TARGET_BROWSER: browser, VITE_BUILD_TARGET: target },
  },
));

let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const watcher of watchers) watcher.kill();
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
for (const watcher of watchers) {
  watcher.on('error', (error) => {
    console.error(error);
    stop(1);
  });
  watcher.on('exit', (code) => stop(code ?? 1));
}
