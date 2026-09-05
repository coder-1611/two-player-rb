#!/usr/bin/env python3
"""Offline build: turn the multi-file game into ONE self-contained HTML.

- Inlines retrobowl.js (drops the document.write <script src> injection -> no src hijack).
- Embeds every html5game asset (text + PNG/OGG binaries as base64).
- Installs a MINIMAL shim that only rewrites the engine's html5game XHR URLs to data:
  URLs (no response-faking, no fetch/src/srcdoc/blob overrides). Firebase sync/auth
  traffic is NOT matched, so it passes straight through to the real network.
- Inlines <img src> (splash / icon) as data URIs.

Output: GSITES-SELFCONTAINED.html  (store this one file in RTDB; the embed just
fetches it and drops it in an iframe — no proxy-style code in the embed).
"""
import base64, os, re, sys

# ROOT = the game tree to build from (argv[1]), default this repo. OUT = argv[2].
ROOT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else os.path.join(ROOT, 'build', 'GSITES-SELFCONTAINED.html')
def rd(p, b=False):
    with open(os.path.join(ROOT, p), 'rb' if b else 'r', encoding=None if b else 'utf-8',
              errors=None if b else 'replace') as f:
        return f.read()

# Proper MIMEs so a data: URL works whether the engine reads it via XHR (arraybuffer),
# Image.src (needs image/*), or Audio.src (needs audio/*).
MIME = {'.txt':'text/plain;charset=utf-8', '.json':'application/json', '.js':'text/plain;charset=utf-8',
        '.png':'image/png', '.jpg':'image/jpeg', '.ogg':'audio/ogg', '.dat':'application/octet-stream'}

# ---- 1. embed every html5game asset as base64 (uniform: shim builds data: URLs) ----
assets = {}
h5 = os.path.join(ROOT, 'html5game')
for fn in sorted(os.listdir(h5)):
    fp = os.path.join(h5, fn)
    if not os.path.isfile(fp): continue
    ext = '.' + fn.rsplit('.', 1)[-1].lower() if '.' in fn else ''
    mime = MIME.get(ext, 'application/octet-stream')
    b64 = base64.b64encode(open(fp, 'rb').read()).decode('ascii')
    assets[fn] = [mime, b64]
import json
assets_js = 'window.__RB_ASSETS=' + json.dumps(assets) + ';'
print('embedded %d html5game assets (%.1f MB base64)' % (len(assets), len(assets_js)/1048576))

# ---- 2. the minimal shim: rewrite matching XHR URLs to data: URLs, pass everything else ----
shim_js = r"""
(function(){
  var A = window.__RB_ASSETS || {};
  function findKey(u){
    u = String(u).split('?')[0].split('#')[0];
    for (var k in A){ if (u===k || u.slice(-(k.length+1))==='/'+k || u.slice(-k.length)===k) return k; }
    return null;
  }
  function dataURL(k){ return 'data:' + A[k][0] + ';base64,' + A[k][1]; }
  // XHR (text data + OGG sounds): rewrite matching URLs to local data: URLs.
  var origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url){
    var k = findKey(url);
    if (k){ arguments[1] = dataURL(k); }
    return origOpen.apply(this, arguments);
  };
  // Image (PNG texture atlases): same rewrite via the src setter.
  var imgDesc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    configurable:true, enumerable:true,
    get:function(){ return imgDesc.get.call(this); },
    set:function(v){ var k=findKey(v); imgDesc.set.call(this, k ? dataURL(k) : v); }
  });
})();
"""

# ---- 3. inline the engine + the local poki stub (escape </script> so they can't close early) ----
engine = rd('retrobowl.js')
engine = re.sub(r'</\s*script\s*>', '<\\/script>', engine, flags=re.I)
poki = rd('html5game/uph_poki.js')          # local Poki stub (defines poki_loadbar); no external calls
poki = re.sub(r'</\s*script\s*>', '<\\/script>', poki, flags=re.I)

# ---- 4. transform index.html ----
html = rd('index.html')

# 4a. replace the document.write engine injection with inlined shim+engine (same parse position)
inject_re = re.compile(
    r"document\.write\('<script type=\"text/javascript\" src=\"retrobowl\.js'.*?<\\/script>'\);",
    re.S)
if not inject_re.search(html):
    print('ERROR: could not find the document.write engine injection'); sys.exit(1)
html = inject_re.sub("/* engine inlined below (self-contained build) */", html, count=1)

# close the launcher IIFE's <script>, then add assets+shim, then the engine, inline
marker = "/* engine inlined below (self-contained build) */\n        })();\n    </script>"
if marker not in html:
    # tolerate whitespace differences
    marker = re.search(r"/\* engine inlined below \(self-contained build\) \*/\s*\}\)\(\);\s*</script>", html).group(0)
addition = ("</script>\n"
            "    <script>" + assets_js + "</script>\n"
            "    <script>" + shim_js + "</script>\n"
            "    <script>\n" + poki + "\n</script>\n"
            "    <script>\n" + engine + "\n</script>")
html = html.replace(marker, marker[:marker.rfind('</script>')] + addition, 1)

# 4b. inline images as data URIs
def data_uri(path, mime):
    fp = os.path.join(ROOT, path)
    if not os.path.isfile(fp): return None
    return 'data:' + mime + ';base64,' + base64.b64encode(open(fp,'rb').read()).decode('ascii')
for src, mime in [('splash.png','image/png'), ('img/icon.jpg','image/jpeg'), ('favicon.jpg','image/jpeg')]:
    du = data_uri(src, mime)
    if du:
        html = html.replace('src="'+src+'"', 'src="'+du+'"').replace("src='"+src+"'", "src='"+du+"'")
        html = html.replace('href="'+src+'"', 'href="'+du+'"')
        # V350+ cache-busts the favicon (favicon.jpg?v=NNN): inline that form too
        html = re.sub(r'href="' + re.escape(src) + r'\?v=[0-9]+"', 'href="' + du + '"', html)

out = OUT
os.makedirs(os.path.dirname(out), exist_ok=True)
open(out, 'w', encoding='utf-8').write(html)
print('wrote %s  (%.1f MB)' % (out, os.path.getsize(out)/1048576))
# sanity: no leftover proxy patterns in the EMBED-relevant sense
for pat in ['createObjectURL', 'window.fetch=', 'window.fetch =', 'defineProperty', 'srcdoc']:
    print('  contains %-18s -> %d' % (pat, html.count(pat)))
print('  <script src="retrobowl.js"> injections left:', len(re.findall(r'src="retrobowl\.js', html)))
