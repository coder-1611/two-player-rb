#!/usr/bin/env python3
"""node --check every inline <script> block of an HTML file (module scripts checked as modules)."""
import re, subprocess, sys, tempfile, os
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
html = open(path, encoding='utf-8').read()
blocks = re.findall(r'<script([^>]*)>(.*?)</script>', html, flags=re.S)
bad = 0; n = 0
for attrs, body in blocks:
    if 'src=' in attrs or not body.strip(): continue
    n += 1
    ext = '.mjs' if 'module' in attrs else '.js'
    with tempfile.NamedTemporaryFile('w', suffix=ext, delete=False, encoding='utf-8') as f: f.write(body); tmp = f.name
    r = subprocess.run(['node', '--check', tmp], capture_output=True, text=True)
    if r.returncode != 0: bad += 1; print('BAD block', n, r.stderr.strip()[:400])
    os.unlink(tmp)
print('checked %d inline script blocks, %d bad' % (n, bad))
sys.exit(1 if bad else 0)
