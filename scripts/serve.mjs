import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { resolve, extname, sep } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');
const port = Number(process.env.PORT || 4174);
const config = JSON.parse(await readFile(resolve(root, 'vercel.json')));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.avif': 'image/avif', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.mp4': 'video/mp4', '.webm': 'video/webm', '.txt': 'text/plain', '.xml': 'application/xml', '.ico': 'image/x-icon' };
createServer(async (req, res) => {
  try {
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
    const url = new URL(req.url, 'http://local');
    let path = decodeURIComponent(url.pathname);
    if (path.endsWith('/') && path !== '/') { res.writeHead(308, { Location: path.slice(0, -1) + url.search }).end(); return; }
    const rewrite = config.rewrites.find(rule => rule.source === path && rule.has.every(p => url.searchParams.get(p.key) === p.value));
    if (rewrite) path = rewrite.destination;
    let file = resolve(dist, '.' + (path === '/' ? '/index.html' : path));
    if (!file.startsWith(dist + sep)) { res.writeHead(403).end(); return; }
    if (!extname(file)) file += '.html';
    let size, status = 200;
    try { size = (await stat(file)).size; } catch { file = resolve(dist, '404.html'); size = (await stat(file)).size; status = 404; }
    const headers = { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Accept-Ranges': 'bytes' };
    let start = 0, end = size - 1;
    if (req.headers.range && status === 200) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if (!match) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }).end(); return; }
      if (match[1]) { start = Number(match[1]); end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1; }
      else start = Math.max(0, size - Number(match[2]));
      if (start > end || start >= size) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }).end(); return; }
      status = 206; headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
    }
    headers['Content-Length'] = end - start + 1;
    res.writeHead(status, headers);
    if (req.method === 'HEAD') { res.end(); return; }
    createReadStream(file, { start, end }).on('error', () => res.destroy()).pipe(res);
  } catch { res.writeHead(400).end(); }
}).listen(port, '0.0.0.0', () => console.log(`Portfolio server ready on port ${port}`));
