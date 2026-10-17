"""Render via Chromium; fetch HTTPS through the environment proxy with Python's verified CA trust.

Chromium's NSS store lacks this environment's proxy CA. The request adapter keeps
TLS certificate verification enabled in urllib, and caches verified GET responses.
"""
import asyncio, hashlib, json, os, urllib.request, urllib.error, urllib.parse
from pathlib import Path
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[1]/'artifacts'
ROOT.mkdir(exist_ok=True)
CACHE=ROOT/'verified-cache'; CACHE.mkdir(exist_ok=True)

BASE='https://desiredesign.framer.website'
NETWORK=[]

def load(request):
    url,method,headers,body=request
    key=hashlib.sha256(url.encode()).hexdigest()
    meta=CACHE/(key+'.json'); blob=CACHE/(key+'.bin')
    if method=='GET' and meta.exists() and blob.exists():
        info=json.loads(meta.read_text());return info['status'],info['headers'],blob.read_bytes()
    clean={k:v for k,v in headers.items() if k.lower() not in ['host','connection','accept-encoding','content-length']}
    clean['Accept-Encoding']='identity'
    req=urllib.request.Request(url,data=body,headers=clean,method=method)
    try:r=urllib.request.urlopen(req,timeout=35)
    except urllib.error.HTTPError as e:r=e
    with r:
        data=r.read();status=r.status
        h={k:v for k,v in r.headers.items() if k.lower() not in ['content-length','content-encoding','transfer-encoding','connection']}
    if method=='GET' and status==200:
        blob.write_bytes(data);meta.write_text(json.dumps({'url':url,'status':status,'headers':h}))
    return status,h,data
