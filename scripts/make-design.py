"""Create an editable .pen draft from measured browser layers; no pen.dev login needed.

The public 2.21 schema is checked separately. Native editor rendering still requires
pen.dev authentication. Never describe schema validation as visual validation.
"""
from pathlib import Path
import copy, hashlib, json, re, shutil, urllib.parse
from PIL import Image
from functools import lru_cache

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'design'
ASSETS = OUT / 'assets'
ASSETS.mkdir(parents=True, exist_ok=True)
INVENTORY = json.loads((ROOT / 'source/inventory.json').read_text())
VARIANTS = json.loads((ROOT / 'source/variants.json').read_text())
REFERENCE = Path('/workspace/scratch/portfolio-audit')
missing = [f'{item["slug"]}-{w}' for item in INVENTORY for w in [1440, 390] if not (ROOT / 'artifacts/design-dom' / f'{item["slug"]}-{w}.json').exists()]
if missing:
    raise SystemExit('Missing browser captures: ' + ', '.join(missing))

@lru_cache(maxsize=None)
def store_image(path):
    data = path.read_bytes()
    suffix = path.suffix
    if suffix.lower() != '.svg':
        with Image.open(path) as image:
            suffix = '.' + {'JPEG': 'jpg'}.get(image.format, image.format.lower())
    name = hashlib.sha256(data).hexdigest()[:24] + suffix
    target = ASSETS / name
    if not target.exists():
        target.write_bytes(data)
    return './assets/' + name

def local_image(url):
    parsed = urllib.parse.urlsplit(url)
    path = parsed.path.removeprefix('/_framer')
    query = dict(urllib.parse.parse_qsl(parsed.query))
    for variant in VARIANTS:
        original = urllib.parse.urlsplit(variant['url'])
        if original.path == path and dict(urllib.parse.parse_qsl(original.query)) == query:
            return store_image(ROOT / 'source/variants' / variant['file'])
    file = ROOT / 'source/assets' / path.lstrip('/')
    if not file.is_file():
        raise ValueError('Missing design image: ' + url)
    return store_image(file)

components = {}
library = []
counts = {'screens': 0, 'nodes': 0, 'editableText': 0, 'imageLayers': 0, 'staticMediaLayers': 0, 'guideGroups': 0, 'references': 0}

def canonical(node, root=True):
    return {k: [canonical(child, False) for child in v] if k == 'children' else v for k, v in node.items() if k not in ['id', 'metadata', 'name'] and not (root and k in ['x', 'y'])}

def prefixed(node, prefix):
    node = copy.deepcopy(node)
    node['id'] = prefix + node['id']
    for child in node.get('children', []):
        child.update(prefixed(child, prefix))
    return node

def convert(node, prefix, screen_image, screen_size, parent=(0, 0), blend='normal'):
    n = copy.deepcopy(node)
    n['id'] = prefix + n['id']
    counts['nodes'] += 1
    x = parent[0] + n.get('x', 0)
    y = parent[1] + n.get('y', 0)
    meta = n.get('metadata', {})
    own_blend = meta.get('css', {}).get('mixBlendMode', 'normal')
    if own_blend != 'normal':
        blend = own_blend
    if n['type'] == 'text':
        counts['editableText'] += 1
        if n.get('fontFamily', '').startswith('Inter Tight'):
            n['fontFamily'] = 'Inter Tight'
        if blend in ['difference', 'multiply', 'screen', 'overlay']:
            n['fill'] = {'type': 'color', 'color': n['fill'], 'blendMode': blend}
    fill = n.get('fill')
    if isinstance(fill, dict) and fill.get('type') == 'image':
        fill['url'] = local_image(fill['url'])
        counts['imageLayers'] += 1
    if 'svg' in meta:
        data = meta.pop('svg')
        name = hashlib.sha256(data.encode()).hexdigest()[:24] + '.svg'
        (ASSETS / name).write_text(data)
        n['fill'] = {'type': 'image', 'url': './assets/' + name, 'mode': 'stretch'}
        counts['imageLayers'] += 1
    if meta.get('staticMedia'):
        counts['staticMediaLayers'] += 1
        if not isinstance(n.get('fill'), dict):
            w, h = n['width'], n['height']
            n['fill'] = {'type': 'image', 'url': screen_image, 'mode': 'stretch', 'transform': [screen_size[0] / w, 0, 0, screen_size[1] / h, -x / w, -y / h]}
            meta['representation'] = 'Static browser capture; playback remains in the website.'
    n['children'] = [convert(child, prefix, screen_image, screen_size, (x, y), blend) for child in n.get('children', [])] if 'children' in n else None
    if n.get('children') is None:
        n.pop('children', None)
    if n.get('name') == 'Button M' and n.get('children'):
        key = json.dumps(canonical(n), sort_keys=True)
        if key not in components:
            component = prefixed(n, 'lib-')
            component.update(reusable=True, x=30 + (len(library) % 6) * 225, y=300 + (len(library) // 6) * 80)
            components[key] = component['id']
            library.append(component)
        n = {'id': n['id'], 'type': 'ref', 'ref': components[key], 'name': n['name'], 'x': n['x'], 'y': n['y'], 'width': n['width'], 'height': n['height']}
    return n

def guide_group(capture, prefix):
    children = []
    for idx, grid in enumerate(capture['grids']):
        columns = [float(v) for v in re.findall(r'([\d.]+)px', grid['columns'])]
        if not columns:
            continue
        padding = [float(v) for v in re.findall(r'([\d.]+)px', grid['padding'])]
        top = padding[0] if padding else 0
        left = padding[-1] if len(padding) == 4 else padding[1] if len(padding) >= 2 else top
        x = grid['x'] + left
        gap = float(grid['gap'].removesuffix('px')) if grid['gap'].endswith('px') else 0
        for col, width in enumerate(columns):
            children.append({'id': f'{prefix}guide-{idx}-{col}', 'type': 'rectangle', 'name': f'{grid["name"]} — column {col + 1}', 'x': x, 'y': grid['y'] + top, 'width': width, 'height': max(1, grid['height'] - top), 'fill': '#ff007718', 'stroke': '#ff007755', 'strokeWidth': 1})
            x += width + gap
    counts['guideGroups'] += 1
    return {'id': prefix + 'guides', 'type': 'group', 'name': 'GRID GUIDES — enable to inspect', 'enabled': False, 'children': children}

document = {'version': '2.21', 'variables': {'color.background': {'type': 'color', 'value': '#ffffff'}, 'color.text': {'type': 'color', 'value': '#000000'}, 'spacing.desktop': {'type': 'number', 'value': 20}, 'spacing.mobile': {'type': 'number', 'value': 10}, 'grid.gap': {'type': 'number', 'value': 20}}, 'children': []}
y = 1200
for item in INVENTORY:
    route = urllib.parse.urlsplit(item['url']).path
    row_height = 0
    for width, x, ref_x in [(1440, 0, 2160), (390, 1560, 3720)]:
        slug = f'{item["slug"]}-{width}'
        prefix = slug.replace('_', '-') + '-'
        capture = json.loads((ROOT / 'artifacts/design-dom' / (slug + '.json')).read_text())
        image = store_image(ROOT / 'artifacts/screenshots' / ('production-' + slug + '.png'))
        frame = {'id': prefix + 'screen', 'type': 'frame', 'name': f'{route} · {width}px · EDITABLE DRAFT', 'x': x, 'y': y, 'width': width, 'height': capture['height'], 'fill': '$color.background', 'layout': 'none', 'clip': True, 'metadata': {'type': 'browser-import-draft', 'url': item['url'], 'viewport': width, 'nativePenRenderValidated': False}, 'children': [convert(n, prefix, image, (width, capture['height'])) for n in capture['children']]}
        frame['children'].append(guide_group(capture, prefix))
        document['children'].append(frame)
        baseline = REFERENCE / 'screenshots' / (slug + '.png')
        ref_image = store_image(baseline) if baseline.exists() else image
        document['children'].append({'id': prefix + 'reference', 'type': 'rectangle', 'name': f'{route} · {width}px · ORIGINAL SCREENSHOT', 'x': ref_x, 'y': y, 'width': width, 'height': capture['height'], 'fill': {'type': 'image', 'url': ref_image, 'mode': 'stretch'}, 'metadata': {'type': 'reference-only', 'editable': False}})
        counts['screens'] += 1
        counts['references'] += 1
        row_height = max(row_height, capture['height'])
    y += row_height + 180

board = {'id': 'library', 'type': 'frame', 'name': 'START HERE — components, tokens, validation status', 'x': 0, 'y': 0, 'width': 1980, 'height': 1080, 'fill': '#f0f0f0', 'layout': 'none', 'children': [
    {'id': 'intro', 'type': 'text', 'x': 30, 'y': 30, 'width': 1900, 'height': 220, 'textGrowth': 'fixed-width-height', 'fontFamily': 'Inter Tight', 'fontSize': 24, 'fill': '#111111', 'content': 'Nick Kozyrev — editable portfolio draft\n28 routes × desktop/mobile. Text, images and containers are separate layers.\nOriginal browser screenshots are alongside each page. GRID GUIDES are hidden groups.\nNative Pencil rendering is not yet verified. Video layers are static frames.\nInstall the bundled Inter Tight fonts before reviewing typography.'},
    *library
]}
if library:
    board['height'] = max(1080, 400 + ((len(library) + 5) // 6) * 80)
document['children'].insert(0, board)
(OUT / 'portfolio-draft.pen').write_text(json.dumps(document, ensure_ascii=False, indent=2))
counts.update(components=len(library), assetFiles=len(list(ASSETS.iterdir())), nativePenRenderValidated=False, schema='2.21')
(OUT / 'manifest.json').write_text(json.dumps(counts, indent=2))
print(json.dumps(counts, indent=2))
