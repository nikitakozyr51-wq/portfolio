import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

if (Number(process.versions.node.split('.')[0]) < 22) {
  console.error('Нужен Node.js 22 или новее: https://nodejs.org/');
  process.exit(1);
}

const root = fileURLToPath(new URL('../', import.meta.url));
const probe = createServer();
await new Promise((resolve, reject) => {
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', resolve);
});
const port = probe.address().port;
await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
const url = `http://localhost:${port}`;
const server = spawn(process.execPath, ['scripts/serve.mjs'], {
  cwd: root,
  env: { ...process.env, PORT: String(port) },
  stdio: ['inherit', 'pipe', 'inherit'],
});
let ready = false;
let output = '';
server.stdout.on('data', data => {
  process.stdout.write(data);
  output += data;
  if (ready || !output.includes('Portfolio server ready on port')) return;
  ready = true;
  console.log(`\nПортфолио: ${url}\nДля остановки нажмите Ctrl+C.\n`);
  if (process.argv.includes('--no-open')) return;
  const command = process.platform === 'win32' ? 'cmd.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  const opener = spawn(command, args, { stdio: 'ignore' });
  opener.on('error', () => console.error(`Откройте адрес в браузере: ${url}`));
  opener.on('exit', code => { if (code) console.error(`Откройте адрес в браузере: ${url}`); });
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.on('exit', code => { process.exitCode = code ?? 0; });
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => { if (!server.killed) server.kill(signal); });
}
