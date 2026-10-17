import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const code = (await readFile(new URL('../src/compat.js', import.meta.url), 'utf8')).replace('/* PORTFOLIO_CONFIG */', 'const config = {fixEmbedVideos:false};');
function setup(fetch) {
  const window = { fetch };
  vm.runInNewContext(code, { window, location: { origin: 'https://portfolio.example', href: 'https://portfolio.example/works/coffee-owl' }, URL, Request, Response, Uint8Array });
  return window;
}
const collection = 'https://portfolio.example/_framer/cms/test.framercms';
test('CMS returns ordered, inclusive, disjoint ranges from one cached local file', async () => {
  const calls = [];
  const window = setup(async url => { calls.push(url); return new Response(Uint8Array.from([0, 1, 2, 3, 4, 5, 6])); });
  const first = await window.fetch(collection + '?range=4-6,1-2');
  assert.deepEqual([...new Uint8Array(await first.arrayBuffer())], [4, 5, 6, 1, 2]);
  const second = await window.fetch(collection + '?range=0-0');
  assert.deepEqual([...new Uint8Array(await second.arrayBuffer())], [0]);
  assert.deepEqual(calls, [collection]);
});
test('CMS rejects malformed and out-of-bounds ranges', async () => {
  const window = setup(async () => new Response(Uint8Array.from([1, 2, 3])));
  for (const range of ['0-3', '2-1', '-1-2', '0-1x']) await assert.rejects(window.fetch(collection + '?range=' + range));
});
test('CMS can recover after a failed download', async () => {
  let attempts = 0;
  const window = setup(async () => ++attempts === 1 ? new Response(null, { status: 503 }) : new Response(Uint8Array.from([7])));
  await assert.rejects(window.fetch(collection + '?range=0-0'));
  assert.equal(new Uint8Array(await (await window.fetch(collection + '?range=0-0')).arrayBuffer())[0], 7);
});
test('unrelated requests retain their URL and options', async () => {
  let actual;
  const window = setup(async (...args) => { actual = args; return new Response('ok'); });
  const options = { method: 'POST', body: 'test' };
  await window.fetch('/api/contact', options);
  assert.deepEqual(actual, ['/api/contact', options]);
});
test('URLs use the active deployment origin and embed HTML cannot become a video source', () => {
  const { __portfolio: p } = setup(async () => new Response());
  assert.equal(p.localize('https://framerusercontent.com/images/a.png'), 'https://portfolio.example/_framer/images/a.png');
  assert.equal(p.localize('https://desiredesign.framer.website/works/grid'), 'https://portfolio.example/works/grid');
  const embed = '<div><iframe src="https://kinescope.io/embed/0jegj5ZT28oXo5paWbtWVv"></iframe></div>';
  assert.equal(p.embed(embed), 'https://kinescope.io/embed/0jegj5ZT28oXo5paWbtWVv');
  assert.equal(p.videoSource(embed), undefined);
  assert.equal(p.embed('<iframe src="https://untrusted.example/video">'), undefined);
  assert.equal(p.videoSource('https://framerusercontent.com/a.mp4'), 'https://portfolio.example/_framer/a.mp4');
});
