import asyncio,json,urllib.parse,sys,os,shutil
from pathlib import Path
from playwright.async_api import async_playwright
from verified_http import load
REPO=Path(__file__).resolve().parents[1]
ROOT=REPO/'tests/reference'
OUT=REPO/'artifacts'
OUT.mkdir(exist_ok=True)
BASE=os.environ.get('PORTFOLIO_TEST_URL','http://127.0.0.1:4174')
(OUT/'design-dom').mkdir(exist_ok=True)
(OUT/'screenshots').mkdir(exist_ok=True)

async def main():
    results=[]
    pages=json.loads((REPO/'source/inventory.json').read_text())
    shard=int(sys.argv[1]) if len(sys.argv)>1 else 0
    shards=int(sys.argv[2]) if len(sys.argv)>2 else 1
    prior=OUT/f'production-comparison-{shard}.json'
    if prior.exists():results=json.loads(prior.read_text())
    done={(r['url'],r['viewport']) for r in results}
    pages=[item for idx,item in enumerate(pages) if idx % shards == shard]
    if len(sys.argv)>3:pages=[item for item in pages if urllib.parse.urlsplit(item['url']).path in sys.argv[3:]]
    async with async_playwright() as p:
        browser=await p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium'),headless=True,args=['--disable-dev-shm-usage'])
        for item in pages:
            path=urllib.parse.urlsplit(item['url']).path
            for width in [1440,390]:
                if (item['url'],width) in done:continue
                original_path=ROOT/f'{item["slug"]}-{width}.json'
                if not original_path.exists():continue
                original=json.loads(original_path.read_text())
                page=await browser.new_page(viewport={'width':width,'height':1000},device_scale_factor=1,service_workers='block')
                await page.add_init_script((REPO/'scripts/image-visibility.js').read_text())
                failed=[];blocked=[];errors=[]
                async def handler(route):
                    req=route.request;host=urllib.parse.urlsplit(req.url).hostname or ''
                    if host == urllib.parse.urlsplit(BASE).hostname:
                        await route.continue_();return
                    if any(host==d or host.endswith('.'+d) for d in ['framer.com','framerusercontent.com','framerstatic.com','framer.website']):
                        blocked.append(req.url);await route.abort();return
                    try:
                        status,headers,body=await asyncio.to_thread(load,(req.url,req.method,await req.all_headers(),req.post_data_buffer))
                        await route.fulfill(status=status,headers=headers,body=body)
                    except Exception as e:failed.append({'url':req.url,'error':str(e)});await route.abort()
                await page.route('**/*',handler)
                page.on('pageerror',lambda e:errors.append(str(e)))
                page.on('response',lambda r:failed.append({'url':r.url,'status':r.status}) if r.status>=400 else None)
                await page.goto(BASE+path,wait_until='domcontentloaded',timeout=45000)
                await page.wait_for_timeout(2200)
                await page.evaluate('() => Promise.race([document.fonts.ready,new Promise(r=>setTimeout(r,8000))])')
                height=await page.evaluate('document.body.scrollHeight')
                for y in range(0,height,800):
                    await page.evaluate('(y)=>scrollTo(0,y)',y);await page.wait_for_timeout(150)
                await page.wait_for_timeout(1800);await page.evaluate('scrollTo(0,0)');await page.wait_for_timeout(700)
                await page.wait_for_function('''() => [...document.images].filter(i=>i.getAttribute('src') && window.__auditImageVisible(i)).every(i=>i.complete)''',timeout=20000)
                await page.evaluate('''() => Promise.all([...document.images].filter(i=>i.naturalWidth).map(i=>i.decode().catch(()=>{})))''')
                data=await page.evaluate('''() => ({text:document.body.innerText,height:document.body.scrollHeight,width:document.documentElement.scrollWidth,images:[...document.images].filter(window.__auditImageVisible).map(i=>({src:i.currentSrc,complete:i.complete,naturalWidth:i.naturalWidth})),elements:[...document.querySelectorAll('h1,h2,h3,header,nav,main,footer,[data-framer-name]')].filter(i=>i.getBoundingClientRect().width>0).map(i=>({tag:i.tagName,name:i.getAttribute('data-framer-name'),text:i.innerText?.slice(0,100),box:i.getBoundingClientRect().toJSON()}))})''')
                (OUT/f'production-{item["slug"]}-{width}.json').write_text(json.dumps(data,ensure_ascii=False,indent=2))
                # Compare visible structural boxes, excluding the Framer service badge.
                def meaningful(elements):return [x for x in elements if x['name'] not in ['Backdrop','Content','Logo','Text','Bottom','Border','Light'] and x['tag']!='IFRAME']
                a=meaningful(original['elements']);b=meaningful(data['elements']);deltas=[]
                for x,y in zip(a,b):
                    if (x['tag'],x['name'])==(y['tag'],y['name']):
                        delta=max(abs(x['box'][k]-y['box'][k]) for k in ['x','y','width','height'])
                        if delta>1:deltas.append({'name':x['name'],'tag':x['tag'],'delta':round(delta,3)})
                result={'url':item['url'],'viewport':width,'text_equal':original['text']==data['text'],'original_height':original['height'],'local_height':data['height'],'overflow':data['width']>width,'original_elements':len(a),'local_elements':len(b),'geometry_differences_over_1px':deltas,'failed':failed,'blocked_framer':sorted(set(blocked)),'errors':errors,'broken_images':[i for i in data['images'] if not i['complete'] or not i['naturalWidth']]}
                result['structure_equal']=[(x['tag'],x['name']) for x in a]==[(x['tag'],x['name']) for x in b]
                await page.screenshot(path=str(OUT/'screenshots'/f'production-{item["slug"]}-{width}.png'),full_page=True)
                design=await page.evaluate((REPO/'scripts/capture-design.js').read_text())
                (OUT/'design-dom'/f'{item["slug"]}-{width}.json').write_text(json.dumps(design,ensure_ascii=False))
                results.append(result)
                (OUT/f'production-comparison-{shard}.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
                print(json.dumps({k:v for k,v in result.items() if k not in ['geometry_differences_over_1px','blocked_framer'] }|{'geometry_differences':len(deltas),'blocked_framer':len(set(blocked))},ensure_ascii=False),flush=True)
                await page.unroute_all(behavior='ignoreErrors')
                await page.close()
        await browser.close()

asyncio.run(main())
