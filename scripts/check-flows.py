import asyncio,json,re,urllib.parse
from playwright.async_api import async_playwright
from verified_http import load
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]/'artifacts'

async def main():
    results=[]
    async with async_playwright() as p:
        browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--disable-dev-shm-usage'])
        context=await browser.new_context(service_workers='block')
        async def handle(route):
            req=route.request;host=urllib.parse.urlsplit(req.url).hostname or ''
            if host in ['localhost','127.0.0.1']:await route.continue_();return
            if any(host==d or host.endswith('.'+d) for d in ['framer.com','framerusercontent.com','framerstatic.com','framer.website']):await route.abort();return
            try:
                s,h,b=await asyncio.to_thread(load,(req.url,req.method,await req.all_headers(),req.post_data_buffer))
                await route.fulfill(status=s,headers=h,body=b)
            except Exception:
                try:await route.abort()
                except Exception:pass
        await context.route('**/*',handle)
        page=await context.new_page();await page.set_viewport_size({'width':1440,'height':1000})
        async def record(name,action,expected):
            try:
                await action();await page.wait_for_timeout(2200)
                ok=await expected();results.append({'check':name,'passed':ok,'url':page.url})
            except Exception as e:results.append({'check':name,'passed':False,'error':str(e)[:300]})
        await page.goto('http://127.0.0.1:4174/');await page.wait_for_timeout(1800)
        await record('home → grid',lambda:page.get_by_text('grid',exact=True).filter(visible=True).first.click(),lambda:asyncio.sleep(0,result=urllib.parse.urlsplit(page.url).path=='/works/grid'))
        await record('grid → list',lambda:page.get_by_text('list',exact=True).filter(visible=True).first.click(),lambda:asyncio.sleep(0,result=urllib.parse.urlsplit(page.url).path=='/works/list'))
        await record('list → Branding category',lambda:page.locator('a[href$="categories/branding/list"]').filter(visible=True).first.click(),lambda:asyncio.sleep(0,result=urllib.parse.urlsplit(page.url).path in ['/categories/branding','/categories/branding/list']))
        await record('category → Coffee Owl case',lambda:page.locator('a[href*="works/coffee-owl"]').filter(visible=True).first.click(),lambda:asyncio.sleep(0,result=urllib.parse.urlsplit(page.url).path=='/works/coffee-owl'))
        await record('browser Back',lambda:page.go_back(),lambda:asyncio.sleep(0,result=urllib.parse.urlsplit(page.url).path in ['/categories/branding','/categories/branding/list']))
        await page.set_viewport_size({'width':390,'height':1000})
        await page.goto('http://127.0.0.1:4174/');await page.wait_for_timeout(1800)
        await page.get_by_text('menu',exact=True).filter(visible=True).first.click();await page.wait_for_timeout(1000)
        await page.screenshot(path=str(ROOT/'screenshots/production-mobile-menu.png'),full_page=False)
        menu=await page.evaluate('document.body.innerText')
        results.append({'check':'menu identity and contacts','passed':'Nick Kozyrev' in menu and 'oblica' not in menu and 'instagram' not in menu and await page.locator('a[href="https://t.me/desire2223"]').count()>0})
        results.append({'check':'mobile menu opens','passed':bool(await page.get_by_text('close',exact=True).filter(visible=True).count()) and bool(await page.get_by_text('about',exact=True).filter(visible=True).count()),'visible_text':menu[:300]})
        await record('mobile menu → About',lambda:page.get_by_text('about',exact=True).filter(visible=True).first.click(),lambda:asyncio.sleep(0,result=page.url.endswith('/about')))
        await page.goto('http://127.0.0.1:4174/works/fast-bill');await page.wait_for_timeout(1800)
        videos=page.locator('video[src$=".mp4"]')
        if await videos.count():
            result=await videos.first.evaluate('''async v=>{v.muted=true;try{await Promise.race([v.play(),new Promise((_,r)=>setTimeout(()=>r(Error('play timeout')),10000))]);await new Promise(r=>setTimeout(r,1200));return {passed:v.currentTime>0,currentTime:v.currentTime,readyState:v.readyState,src:v.currentSrc}}catch(e){return {passed:false,error:String(e)}}}''')
            results.append({'check':'local Fast Bill MP4 playback',**result})
        await page.goto('http://127.0.0.1:4174/works/kringga-showreel');await page.wait_for_timeout(2500)
        frames=[f for f in page.frames if 'kinescope.io/embed/' in f.url]
        if frames:
            frame=frames[0]
            results.append({'check':'Kinescope iframe loaded','passed':True,'url':frame.url,'buttons':await frame.locator('button').all_text_contents(),'video_count':await frame.locator('video').count()})
            try:
                await frame.locator('button').first.click(timeout=8000)
                await page.wait_for_timeout(1500)
                v=frame.locator('video').first
                result=await v.evaluate('''async v=>{v.muted=true;try{await Promise.race([v.play(),new Promise((_,r)=>setTimeout(()=>r(Error('play timeout')),15000))]);await new Promise(r=>setTimeout(r,1800));return {passed:v.currentTime>0,currentTime:v.currentTime,readyState:v.readyState}}catch(e){return {passed:false,error:String(e)}}}''')
                results.append({'check':'Kinescope video playback',**result})
            except Exception as e:results.append({'check':'Kinescope video playback','passed':False,'error':str(e)[:250]})
        else:results.append({'check':'Kinescope iframe loaded','passed':False})
        await page.goto('http://127.0.0.1:4174/works/ghost-vpn');await page.wait_for_timeout(1800)
        results.append({'check':'Ghost VPN malformed video repaired','passed':await page.locator('iframe[src="https://kinescope.io/embed/0jegj5ZT28oXo5paWbtWVv"]').count()>0 and not await page.locator('video[src*="<iframe"]').count()})
        (ROOT/'production-flows.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
        for result in results:print(json.dumps(result,ensure_ascii=False),flush=True)
        await context.unroute_all(behavior='ignoreErrors');await browser.close()

asyncio.run(main())
