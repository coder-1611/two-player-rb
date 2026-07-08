#!/usr/bin/env python3
"""Drive the real Safari page on a USB-connected iPhone via Web Inspector.

Usage:
  phone_inspect.py --list                       # list open pages
  phone_inspect.py --js "<expression>"          # eval JS on the game page, print result
  phone_inspect.py --shot out.png               # save the game canvas as a real PNG
  phone_inspect.py --js "..." --shot out.png    # both
Requires: Settings -> Apps -> Safari -> Advanced -> Web Inspector = ON (iOS 18+),
the phone unlocked with the game open in Safari foreground.
"""
import asyncio, sys, json, base64, argparse, inspect
from pymobiledevice3.lockdown import create_using_usbmux
from pymobiledevice3.services.webinspector import WebinspectorService

FILTER_DEFAULT = "two-player"

async def get_lockdown():
    r = create_using_usbmux()
    if inspect.isawaitable(r):
        r = await r
    return r

async def run(args):
    lockdown = await get_lockdown()
    inspector = WebinspectorService(lockdown=lockdown)
    await inspector.connect()
    try:
        pages = await inspector.get_open_application_pages(timeout=args.timeout)
        infos = []
        for p in pages:
            infos.append({"url": getattr(p, "web_url", "") or "", "title": getattr(p, "web_title", "") or ""})
        if args.list:
            print(json.dumps(infos, indent=1)); return
        target = None
        for p in pages:
            u = (getattr(p, "web_url", "") or "")
            if args.filter.lower() in u.lower():
                target = p; break
        if target is None:
            print("NO_MATCH — open pages:"); print(json.dumps(infos, indent=1)); sys.exit(2)
        session = await inspector.inspector_session(target.application, target.page)
        await session.runtime_enable()
        out = {}
        if args.shot:
            expr = ("(function(){var c=document.getElementById('canvas');if(!c)return 'NOCANVAS';"
                    "try{return c.toDataURL('image/png');}catch(e){return 'ERR:'+e.message;}})()")
            res = await session.runtime_evaluate(expr, return_by_value=True)
            if isinstance(res, str) and res.startswith("data:image"):
                with open(args.shot, "wb") as f:
                    f.write(base64.b64decode(res.split(",", 1)[1]))
                out["shot"] = "OK " + args.shot
            else:
                out["shot"] = "FAIL " + str(res)[:120]
        if args.js:
            res = await session.runtime_evaluate(args.js, return_by_value=True)
            out["js"] = res
        print(json.dumps(out, default=str))
    finally:
        try: await inspector.close()
        except Exception: pass

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--js", default="")
    ap.add_argument("--shot", default="")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--filter", default=FILTER_DEFAULT)
    ap.add_argument("--timeout", type=float, default=10.0)
    args = ap.parse_args()
    asyncio.run(run(args))
