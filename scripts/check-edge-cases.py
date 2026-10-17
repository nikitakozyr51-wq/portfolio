import asyncio,json,os,shutil
from pathlib import Path
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[1]
BASE=os.environ.get('PORTFOLIO_TEST_URL','http://127.0.0.1:4174')

async def main():
    results=[]
    async with async_playwright() as p:
        browser=await p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium'),headless=True,args=['--disable-dev-shm-usage'])
        page=await browser.new_page(viewport={'width':1440,'height':1000},reduced_motion='reduce')
        await page.route('**/*',lambda route:route.continue_() if route.request.url.startswith(BASE+'/') else route.abort())
        await page.add_init_script((ROOT/'scripts/image-visibility.js').read_text())
        for route in ['/','/works/grid','/works/list','/about','/works/coffee-owl','/news']:
            response=await page.goto(BASE+route,wait_until='domcontentloaded')
            await page.wait_for_timeout(1200)
            await page.evaluate('document.fonts.ready')
            for width in [320,768,809,810,1024,1199,1200,1920]:
                await page.set_viewport_size({'width':width,'height':1000})
                await page.wait_for_timeout(500)
                measured=await page.evaluate('''()=>({width:document.documentElement.scrollWidth,body:document.body.scrollWidth,height:document.body.scrollHeight})''')
                results.append({'check':'responsive overflow','route':route,'viewport':width,'passed':response.status==200 and max(measured['width'],measured['body'])<=width,'measured':measured})
            (ROOT/'artifacts/edge-cases.json').write_text(json.dumps(results,indent=2))
        await page.set_viewport_size({'width':1440,'height':1000})
        await page.goto(BASE+'/works/list');await page.wait_for_timeout(1000)
        card=page.locator('a').filter(has_text='Fast Bill').filter(visible=True).first
        await card.hover()
        await page.wait_for_timeout(1200)
        visible=await card.locator('img').evaluate_all('(imgs)=>imgs.filter(window.__auditImageVisible).map(i=>({src:i.currentSrc,loaded:i.complete&&i.naturalWidth>0}))')
        results.append({'check':'list hover images','passed':bool(visible) and all(i['loaded'] for i in visible),'images':visible})
        response=await page.goto(BASE+'/this-page-does-not-exist')
        results.append({'check':'404 status and home link','passed':response.status==404 and await page.locator('a[href="/"]').count()==1})
        await page.goto(BASE+'/');await page.wait_for_timeout(1000)
        await page.keyboard.press('Tab')
        results.append({'check':'keyboard Tab reaches a link','passed':await page.evaluate('document.activeElement.tagName==="A"')})
        await browser.close()
    (ROOT/'artifacts/edge-cases.json').write_text(json.dumps(results,indent=2))
    print(json.dumps({'checks':len(results),'failures':[r for r in results if not r['passed']]},indent=2))

asyncio.run(main())
