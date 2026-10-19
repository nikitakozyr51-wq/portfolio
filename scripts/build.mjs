import { readFile, writeFile, mkdir, copyFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { parse } from 'acorn';

const root = resolve(import.meta.dirname, '..');
const source = join(root, 'source');
const out = join(root, 'dist');
const ORIGIN = 'https://framerusercontent.com';
const ORIGINAL_SITE = 'https://desiredesign.framer.website';
const config = JSON.parse(await readFile(join(root, 'site.config.json')));
const inventory = JSON.parse(await readFile(join(source, 'inventory.json')));
const variants = JSON.parse(await readFile(join(source, 'variants.json')));
const manifest = JSON.parse(await readFile(join(source, 'mirror-manifest.json')));
const htmlManifest = JSON.parse(await readFile(join(source, 'original-html-manifest.json')));
const siteURL = (process.env.SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')).replace(/\/$/, '');
if (siteURL && !/^https?:\/\/[^/]+$/.test(siteURL)) throw Error('SITE_URL must be an http(s) origin, without a path.');
const pageTitles = Object.fromEntries(inventory.map(item => {
  const path = new URL(item.url).pathname;
  const base = path.replace(/\/(?:grid|list)$/, '');
  let label = item.title.replace(/\s*-\s*My Framer Site$/, '').trim();
  if (base === '/' || base === '/works') label = '';
  else if (base.startsWith('/categories/')) label = base.includes('branding') ? 'Branding' : 'Motion Design';
  else if (base === '/old-home') label = 'Archive';
  else if (label === 'Portfolio' || label === 'desire.design') label = base.split('/').pop().split('-').map(word => word[0].toUpperCase() + word.slice(1)).join(' ');
  return [path, label ? `${label} — ${config.siteTitle}` : config.siteTitle];
}));
const report = { pages: [], assets: 0, cmsDecoders: 0, videoComponents: 0, brandedMetadata: 0, localizedStrings: 0, normalizedSourceLineEndings: 0, sourceIntegrity: true, siteURL: siteURL || null, config };
const digest = data => createHash('sha256').update(data).digest('hex');
async function output(path, data) { await mkdir(resolve(path, '..'), { recursive: true }); await writeFile(path, data); }

function verifiedSourceAsset(bytes, expected, relative) {
  if (digest(bytes) === expected) return bytes;
  // Windows Git may check text out with CRLF. Accept only the exact original
  // checksum after reconstructing LF; every other content change still fails.
  if (/\.(mjs|js|css|svg|json)$/.test(relative)) {
    const normalized = Buffer.from(bytes.toString('utf8').replaceAll('\r\n', '\n'));
    if (digest(normalized) === expected) {
      report.normalizedSourceLineEndings++;
      return normalized;
    }
  }
  throw Error(`Source integrity mismatch: ${relative}`);
}

// Keep the published snapshot immutable; all adaptations happen in dist.
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
function transformModule(text, filename) {
  // Binary collection offsets must remain unchanged. Localize strings after decoding.
  text = text.replace(/return ([A-Za-z_$][\w$]*\.(?:textDecoder|decoder)\.decode\([A-Za-z_$][\w$]*\))([;}])/g, (_, value, end) => {
    report.cmsDecoders++;
    return `return window.__portfolio.localize(${value})${end}`;
  });
  const ast = parse(text, { ecmaVersion: 'latest', sourceType: 'module' });
  const edits = [];
  function visit(node, parent) {
    if (!node || typeof node !== 'object') return;
    // Framer also updates titles during client-side navigation. Adapt only its
    // metadata objects, leaving component titles and project content untouched.
    if (node.type === 'Property' && (node.key.name || node.key.value) === 'title' && parent?.type === 'ObjectExpression' && parent.properties.some(p => p.type === 'Property' && (p.key.name || p.key.value) === 'serializationId')) {
      edits.push({ start: node.value.start, end: node.value.end, text: `window.__portfolio.pageTitle(${text.slice(node.value.start, node.value.end)})` });
      report.brandedMetadata++;
      return;
    }
    let value;
    if (node.type === 'Literal' && typeof node.value === 'string') value = node.value;
    if (node.type === 'TemplateLiteral' && node.expressions.length === 0) value = node.quasis[0].value.cooked;
    if (typeof value === 'string') {
      let replacement;
      if (value === 'https://framer.com/edit/init.mjs') replacement = JSON.stringify('/_site/editor-stub.mjs');
      if (value.includes(ORIGIN) || value.includes(ORIGINAL_SITE)) {
        // Import declarations require a literal. Other URL values resolve against the current host.
        replacement = parent?.source === node ? JSON.stringify(value.replaceAll(ORIGIN, '/_framer')) : `window.__portfolio.localize(${JSON.stringify(value)})`;
        report.localizedStrings++;
      }
      if (config.fixTemplateMenu && filename.includes('script_main.')) {
        const menu = { oblica: config.name, 'hello@oblica.com': 'get in touch', 'mailto:hello@oblica.com': config.contactUrl, instagram: config.contactLabel, 'https://www.instagram.com/satto.studio/': config.contactUrl, '2025 oblica® All Rights Reserved.': '2026 Nick Kozyrev.' };
        if (Object.hasOwn(menu, value)) replacement = JSON.stringify(menu[value]);
      }
      if (replacement !== undefined) { edits.push({ start: node.start, end: node.end, text: replacement }); return; }
    }
    const tag = node.type === 'CallExpression' ? node.arguments[0] : null;
    const tagValue = tag?.type === 'TemplateLiteral' && tag.expressions.length === 0 ? tag.quasis[0].value.cooked : tag?.value;
    if (config.fixEmbedVideos && node.type === 'CallExpression' && tagValue === 'video' && node.arguments[1]?.type === 'ObjectExpression') {
      const props = node.arguments[1];
      const src = props.properties.find(p => p.type === 'Property' && (p.key.name || p.key.value) === 'src');
      if (src) {
        const expression = text.slice(src.value.start, src.value.end);
        edits.push({ start: src.value.start, end: src.value.end, text: `window.__portfolio.videoSource(${expression})` });
        edits.push({ start: props.end - 1, end: props.end - 1, text: `,"data-portfolio-embed":window.__portfolio.embed(${expression})` });
        report.videoComponents++;
      }
    }
    for (const [key, child] of Object.entries(node)) {
      if (key === 'start' || key === 'end') continue;
      if (Array.isArray(child)) for (const item of child) visit(item, node);
      else if (child?.type) visit(child, node);
    }
  }
  visit(ast, null);
  edits.sort((a, b) => b.start - a.start);
  for (const edit of edits) text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
  parse(text, { ecmaVersion: 'latest', sourceType: 'module' });
  return text;
}

for (const asset of manifest.assets) {
  const relative = asset.path.replace(/^_framer\//, '');
  const bytes = verifiedSourceAsset(await readFile(join(source, 'assets', relative)), asset.sha256_source, relative);
  let data = bytes;
  if (/\.(mjs|js)$/.test(relative)) data = transformModule(bytes.toString(), relative);
  else if (/\.(css|svg|json)$/.test(relative)) data = bytes.toString().replaceAll(ORIGIN, '/_framer');
  // Vercel checks existing files before array rewrites. Keep image originals
  // behind a fallback rewrite so query-specific CDN variants can win first.
  const outputPath = relative.startsWith('images/')
    ? join(out, '_original_images', relative.slice('images/'.length))
    : join(out, '_framer', relative);
  await output(outputPath, data);
  report.assets++;
}
for (const variant of variants) {
  await mkdir(join(out, '_variants'), { recursive: true });
  await copyFile(join(source, 'variants', variant.file), join(out, '_variants', variant.file));
}
if (report.cmsDecoders !== 6 || report.brandedMetadata !== 12 || (config.fixEmbedVideos && report.videoComponents !== 1)) throw Error('Snapshot adapters did not match the expected generated code. Review before publishing.');
const runtime = (await readFile(join(root, 'src/compat.js'), 'utf8')).replace('/* PORTFOLIO_CONFIG */', `const config = ${JSON.stringify({ ...config, pageTitles })};`);
await output(join(out, '_site/compat.js'), runtime);
await output(join(out, '_site/navigation.css'), await readFile(join(root, 'src/navigation.css'), 'utf8'));
await output(join(out, '_site/editor-stub.mjs'), 'export function createEditorBar(){ return () => null; }');

for (const item of inventory) {
  const path = new URL(item.url).pathname;
  let html = await readFile(join(source, 'html', `${item.slug}.html`), 'utf8');
  const expected = htmlManifest.find(entry => entry.file === `html/${item.slug}.html`);
  if (!expected || digest(html) !== expected.sha256) throw Error(`Source HTML integrity mismatch: ${item.slug}`);
  const title = pageTitles[path].replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${title}</title>`);
  html = html.replace(/<meta\b[^>]*(?:property="og:title"|name="twitter:title")[^>]*>/g, tag => tag.replace(/content="[^"]*"/, `content="${title}"`));
  if (config.hideFramerFavicon) {
    html = html.replace(/[ \t]*<link\b[^>]*\brel=["'][^"']*icon[^"']*["'][^>]*>[ \t]*(?:\r?\n)?/gi, '');
    html = html.replace('<head>', '<head>\n<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27/%3E">');
  }
  html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, tag => tag.includes('https://events.framer.com/') || tag.includes('https://framer.com/edit/init.mjs') ? '' : tag);
  html = html.replaceAll(ORIGIN, '/_framer');
  if (config.fixEmbedVideos) html = html.replace(/<video\b(?:"[^"]*"|'[^']*'|[^'">])*?>/g, tag => {
    const source = /\bsrc="([^"]*)"/.exec(tag);
    const embedded = source?.[1].match(/https:\/\/kinescope\.io\/embed\/[A-Za-z0-9]+/);
    if (!embedded || !source[1].includes('<iframe')) return tag;
    return tag.replace(source[0], `data-portfolio-embed="${embedded[0]}"`);
  });
  // Preserve source metadata until a deployment origin exists; never point canonical at Framer.
  if (siteURL) html = html.replaceAll(ORIGINAL_SITE, siteURL);
  else html = html.replace(/<link\b[^>]*rel="(?:canonical|alternate)"[^>]*>/g, '').replace(/<meta\b[^>]*property="og:url"[^>]*>/g, '');
  html = html.replace(/<html\b/, `<html data-portfolio-hide-list="${Boolean(config.hideListView)}" data-portfolio-hide-news="${Boolean(config.hideNewsNavigation)}" data-portfolio-hide-framer-badge="${Boolean(config.hideFramerBadge)}"`);
  html = html.replace('<head>', '<head>\n<link rel="stylesheet" href="/_site/navigation.css">\n<script src="/_site/compat.js"></script>');
  await output(join(out, path === '/' ? 'index.html' : `${path.slice(1)}.html`), html);
  report.pages.push(path);
}
await output(join(out, '404.html'), '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Page not found — Nick Kozyrev</title><style>body{font:18px system-ui;margin:8vw;background:#fff;color:#111}a{color:inherit}</style><h1>Page not found</h1><p><a href="/">Back to portfolio</a></p></html>');
await output(join(out, 'robots.txt'), `User-agent: *\nAllow: /\n${siteURL ? `Sitemap: ${siteURL}/sitemap.xml\n` : ''}`);
if (siteURL) await output(join(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${report.pages.map(p => `<url><loc>${siteURL}${p}</loc></url>`).join('')}</urlset>`);

// Exact CDN image variants are static files. Vercel matches their original query parameters.
const rewrites = variants.map(v => {
  const u = new URL(v.url);
  return { source: '/_framer' + u.pathname, has: [...u.searchParams].map(([key, value]) => ({ type: 'query', key, value })), destination: '/_variants/' + v.file };
}).sort((a, b) => b.has.length - a.has.length);
for (const asset of manifest.assets) {
  if (!asset.path.startsWith('_framer/images/')) continue;
  rewrites.push({ source: '/' + asset.path, has: [], destination: '/_original_images/' + asset.path.slice('_framer/images/'.length) });
}
const vercel = { $schema: 'https://openapi.vercel.sh/vercel.json', framework: null, buildCommand: 'npm run build', outputDirectory: 'dist', cleanUrls: true, trailingSlash: false, rewrites, headers: [{ source: '/_framer/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] }, { source: '/_variants/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] }, { source: '/_site/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }] }] };
// Keep the generated host configuration reviewable and checked in.
await output(join(root, 'vercel.json'), JSON.stringify(vercel, null, 2) + '\n');
await output(join(out, 'build-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
