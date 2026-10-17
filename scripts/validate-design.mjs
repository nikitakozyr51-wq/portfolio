import { readFile, writeFile, unlink, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '..', 'design');
const input = await readFile(resolve(root, 'portfolio-draft.pen'), 'utf8');
const document = JSON.parse(input);
const ids = new Set(), references = [], assets = new Set();
function visit(node) {
  if (!node.id || node.id.includes('/') || ids.has(node.id)) throw Error(`Invalid or duplicate layer id: ${node.id}`);
  ids.add(node.id);
  if (node.type === 'ref') references.push(node.ref);
  for (const fill of Array.isArray(node.fill) ? node.fill : [node.fill]) if (fill?.type === 'image') assets.add(fill.url);
  for (const child of node.children || []) visit(child);
}
document.children.forEach(visit);
for (const reference of references) if (!ids.has(reference)) throw Error(`Missing component: ${reference}`);
for (const asset of assets) {
  if (!asset.startsWith('./assets/')) throw Error(`Nonlocal design asset: ${asset}`);
  await access(resolve(root, asset));
}
const check = resolve(root, '.schema-check.ts');
await writeFile(check, `import type {Document} from './schema/pen';\nconst document = ${input} satisfies Document;\n`);
try {
  const program = ts.createProgram([check], { noEmit: true, strict: true, target: ts.ScriptTarget.ES2022, skipLibCheck: true });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length) throw Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCurrentDirectory: () => root, getNewLine: () => '\n', getCanonicalFileName: file => file }));
} finally { await unlink(check); }
const result = { schema: '2.21', schemaValid: true, uniqueLayers: ids.size, componentReferences: references.length, localAssets: assets.size, nativeRenderingValidated: false };
await writeFile(resolve(root, 'validation.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
