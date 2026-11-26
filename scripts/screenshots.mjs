// Capture the three submission screenshots at 1440x900 with headless Chrome.
//   node scripts/screenshots.mjs
// Each scene is a URL parameter that the app understands.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outDir = join(root, 'screenshots');
const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
mkdirSync(outDir, { recursive: true });

if (!existsSync(chrome)) {
  console.error(`Chrome not found at ${chrome}`);
  process.exit(2);
}

const server = spawn(process.execPath, [join(root, 'scripts', 'serve.mjs'), '--port', '0'], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe']
});
let serverOut = '';
const port = await new Promise((resolvePort, reject) => {
  const timer = setTimeout(() => reject(new Error('server did not print its port')), 8000);
  server.stdout.on('data', (chunk) => {
    serverOut += chunk.toString();
    const match = serverOut.match(/127\.0\.0\.1:(\d+)/);
    if (match) {
      clearTimeout(timer);
      resolvePort(Number(match[1]));
    }
  });
  server.stderr.on('data', (chunk) => { serverOut += chunk.toString(); });
  server.on('exit', () => reject(new Error(`server exited: ${serverOut}`)));
});

const shots = [
  ['verify, number and date mismatches', '01-verify-dam.png', '/?scene=dam'],
  ['verify, correlation read as cause', '02-correlation.png', '/?scene=heat'],
  ['second reader, verdict diff', '03-second-reader.png', '/?scene=diff']
];

async function capture(name, file, path) {
  const profile = mkdtempSync(join(tmpdir(), 'claimcheck-shot-'));
  const target = join(outDir, file);
  const url = `http://127.0.0.1:${port}${path}`;
  const args = [
    '--headless=new',
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--mute-audio',
    '--hide-scrollbars',
    '--window-size=1440,900',
    '--force-device-scale-factor=1',
    '--force-color-profile=srgb',
    '--virtual-time-budget=6000',
    `--screenshot=${target}`,
    url
  ];
  const code = await new Promise((resolveRun) => {
    const child = spawn(chrome, args, { stdio: 'ignore' });
    child.on('exit', resolveRun);
  });
  rmSync(profile, { recursive: true, force: true });
  if (code !== 0 || !existsSync(target)) throw new Error(`${name} screenshot failed with exit ${code}`);
  const { size } = await import('node:fs').then((fs) => fs.statSync(target));
  console.log(`${name}: ${target} (${Math.round(size / 1024)} KB)`);
}

try {
  for (const shot of shots) await capture(...shot);
} finally {
  server.kill('SIGTERM');
}
