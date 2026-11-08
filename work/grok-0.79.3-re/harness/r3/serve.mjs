// Loopback static server for the unpacked 0.78.1 renderer tree.
// Usage: node serve.mjs <rootDir> <port>
import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2]);
const port = Number(process.argv[3] || 8877);

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2', '.wav': 'audio/wav', '.mp3': 'audio/mpeg',
};

const server = http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.startsWith('/v1/') && path.extname(p)) p = p.replace(/^\/v1[^/]*/, '');
    if (p === '/') p = '/index.html';
    const file = path.join(root, p);
    if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
    const data = await fs.readFile(file);
    res.writeHead(200, {
      'content-type': MIME[path.extname(file)] || 'application/octet-stream',
      'access-control-allow-origin': '*',
    });
    res.end(data);
  } catch {
    try {
      const data = await fs.readFile(path.join(root, 'index.html'));
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(data);
    } catch {
      res.writeHead(404); res.end('nf');
    }
  }
});
server.listen(port, '127.0.0.1', () => console.log('serving', root, 'on', port));
