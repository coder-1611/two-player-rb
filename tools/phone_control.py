#!/usr/bin/env python3
"""Fully control Safari on a USB iPhone via Remote Automation (WebDriver).

Runs a SEQUENCE of steps in one persistent automation session:
  nav   : load a URL
  sleep : wait N seconds
  shot  : save a REAL screenshot (base64 PNG -> file)
  tap   : real tap at page coords [x, y]
  swipe : press-drag from [x1,y1] to [x2,y2] over ms
  js    : execute JavaScript ("return ..."), printed
  type  : type text into the focused element

Steps come from a JSON file (--steps f.json) — a list of one-key objects, e.g.
  [{"nav":"https://two-player-rb.vercel.app/"},{"sleep":8},{"shot":"/tmp/a.png"},
   {"js":"return document.title"},{"tap":[200,400]},{"shot":"/tmp/b.png"}]

Requires: Settings -> Apps -> Safari -> Advanced -> Remote Automation = ON
(plus Web Inspector). Phone unlocked. A confirmation banner appears on the
phone the first time — tap "Continue". Works over usbmux, no root/tunnel.
"""
import asyncio, sys, json, base64, argparse, inspect
from pymobiledevice3.lockdown import create_using_usbmux
from pymobiledevice3.services.webinspector import WebinspectorService, SAFARI
from pymobiledevice3.services.web_protocol.driver import WebDriver, By
from pymobiledevice3.services.web_protocol.automation_session import MouseButton, MouseInteraction

async def get_lockdown():
    r = create_using_usbmux()
    return await r if inspect.isawaitable(r) else r

async def save_shot(session, path):
    data = await session.screenshot_as_base64()
    with open(path, "wb") as f:
        f.write(base64.b64decode(data))
    return path

async def run(steps, url_first):
    lockdown = await get_lockdown()
    inspector = WebinspectorService(lockdown=lockdown)
    await inspector.connect()
    session = None
    try:
        safari = await inspector.open_app(SAFARI)
        session = await inspector.automation_session(safari)
        driver = WebDriver(session)
        await driver.start_session()
        if url_first:
            await driver.get(url_first)
        for st in steps:
            (op, val), = st.items()
            if op == "nav":
                await driver.get(val); print(json.dumps({"nav": val}))
            elif op == "sleep":
                await asyncio.sleep(float(val))
            elif op == "shot":
                print(json.dumps({"shot": await save_shot(session, val)}))
            elif op == "tap":
                x, y = val
                await session.perform_mouse_interaction(x, y, MouseButton.LEFT, MouseInteraction.SINGLE_CLICK)
                print(json.dumps({"tap": [x, y]}))
            elif op == "swipe":
                x1, y1, x2, y2 = val[:4]
                dur = val[4] if len(val) > 4 else 200
                await session.perform_mouse_interaction(x1, y1, MouseButton.LEFT, MouseInteraction.MOVE)
                await session.perform_mouse_interaction(x1, y1, MouseButton.LEFT, MouseInteraction.DOWN)
                await asyncio.sleep(dur / 1000.0)
                await session.perform_mouse_interaction(x2, y2, MouseButton.LEFT, MouseInteraction.MOVE)
                await session.perform_mouse_interaction(x2, y2, MouseButton.LEFT, MouseInteraction.UP)
                print(json.dumps({"swipe": val}))
            elif op == "js":
                try:
                    res = await driver.execute_script(val if val.strip().startswith("return") else "return (" + val + ")")
                except Exception as e:
                    res = "JSERR: " + str(e)
                print(json.dumps({"js": res}, default=str))
            elif op == "type":
                await session.evaluate_js_function(
                    "function(t){var e=document.activeElement;if(e){e.value=t;e.dispatchEvent(new Event('input',{bubbles:true}));}}", val)
                print(json.dumps({"type": val}))
            else:
                print(json.dumps({"unknown": op}))
    finally:
        try: await session.stop_session()
        except Exception: pass
        try: await inspector.close()
        except Exception: pass

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--steps", help="JSON file: list of one-key step objects")
    ap.add_argument("--url", default="", help="navigate here first")
    ap.add_argument("--shot", default="", help="shortcut: just screenshot to this path")
    ap.add_argument("--js", default="", help="shortcut: just run this JS")
    args = ap.parse_args()
    steps = []
    if args.steps:
        steps = json.load(open(args.steps))
    if args.shot:
        steps.append({"shot": args.shot})
    if args.js:
        steps.append({"js": args.js})
    asyncio.run(run(steps, args.url))
