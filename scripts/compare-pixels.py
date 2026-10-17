import json,os,urllib.parse
from pathlib import Path
from PIL import Image,ImageChops,ImageDraw

ROOT=Path(__file__).resolve().parents[1]
REFERENCE=Path(os.environ.get('PORTFOLIO_REFERENCE_SCREENSHOTS','/workspace/scratch/portfolio-audit/screenshots'))
results=[]
for item in json.loads((ROOT/'source/inventory.json').read_text()):
    slug=item['slug']
    for width in [1440,390]:
        original=REFERENCE/f'{slug}-{width}.png'
        candidate=ROOT/'artifacts/screenshots'/f'production-{slug}-{width}.png'
        if not original.exists() or not candidate.exists():
            results.append({'page':slug,'width':width,'error':'missing screenshot'});continue
        a=Image.open(original).convert('RGB');b=Image.open(candidate).convert('RGB')
        if a.size!=b.size:
            results.append({'page':slug,'width':width,'error':'different dimensions','original':a.size,'candidate':b.size});continue
        source=json.loads((ROOT/'tests/reference'/f'{slug}-{width}.json').read_text())
        mask=Image.new('1',a.size,1);draw=ImageDraw.Draw(mask);excluded=[]
        dynamic=source['frames']+[{'tag':'animated GIF','box':i['box']} for i in source['images'] if urllib.parse.urlsplit(i['src']).path.endswith('.gif')]
        for frame in dynamic:
            box=frame['box']
            if box['width'] and box['height']:
                bounds=(max(0,box['x']-2),max(0,box['y']-2),min(a.width,box['x']+box['width']+2),min(a.height,box['y']+box['height']+2))
                if bounds[2]<=bounds[0] or bounds[3]<=bounds[1]:continue
                draw.rectangle(bounds,fill=0)
                excluded.append({'type':frame['tag'],'box':box})
        bands=ImageChops.difference(a,b).split()
        maximum=ImageChops.lighter(ImageChops.lighter(bands[0],bands[1]),bands[2])
        above=maximum.point(lambda v:255 if v>12 else 0).convert('1')
        significant=ImageChops.logical_and(above,mask)
        total=sum(mask.histogram()[1:]);changed=sum(significant.histogram()[1:])
        results.append({'page':slug,'width':width,'threshold':12,'compared_pixels':total,'changed_pixels':changed,'changed_percent':round(changed/total*100,6) if total else None,'difference_bounds':significant.getbbox(),'excluded':excluded})
(ROOT/'artifacts/pixel-comparison.json').write_text(json.dumps(results,indent=2))
print(json.dumps({'comparisons':len(results),'zero_differences':sum(r.get('changed_pixels')==0 for r in results),'differences':[{k:v for k,v in r.items() if k!='excluded'} for r in results if r.get('changed_pixels',0)>0 or r.get('error')]},indent=2))
