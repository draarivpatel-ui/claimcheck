// Minimal static server for local use and for the screenshot/video scripts.
// No dependencies, no directory listing, no traversal outside the repo root.

import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const argPort = process.argv.indexOf('--port');
const port = argPort > -1 ? Number(process.argv[argPort + 1]) : Number(process.env.PORT || 0);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.wav': 'audio/wav',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

const server = createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  let rel = normalize(urlPath).replace(/^([/\\])+/, '');
  if (rel === '' || rel === '.') rel = 'index.html';
  const file = join(root, rel);
  if (!file.startsWith(root + sep) && file !== root) {
    res.writeHead(403).end('forbidden');
    return;
  }
  let target = file;
  try {
    if (statSync(target).isDirectory()) target = join(target, 'index.html');
  } catch {
    res.writeHead(404).end('not found');
    return;
  }
  let size;
  try { size = statSync(target).size; } catch { res.writeHead(404).end('not found'); return; }

  res.writeHead(200, {
    'Content-Type': TYPES[extname(target).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': size,
    'Cache-Control': 'no-store'
  });
  createReadStream(target).pipe(res);
});

server.listen(port, '127.0.0.1', () => {
  const { port: actual } = server.address();
  console.log(`serving ${root}`);
  console.log(`http://127.0.0.1:${actual}/`);
});
