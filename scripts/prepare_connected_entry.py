"""Prepare the former preview address as an entry to the connected app."""
from pathlib import Path
import json

ROOT=Path(__file__).resolve().parents[1]


def entry_html():
    return '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Open connected LinguaKids</title><style>body{font-family:system-ui;background:#f6f3ff;color:#2a1b54;display:grid;place-content:center;min-height:90vh;padding:24px}main{background:white;padding:40px;border-radius:24px;max-width:520px}a{color:#5b34b8}</style><main><h1>Opening LinguaKids…</h1><p>This address now opens the connected system with your existing account and saved records.</p><a id="connected" href="http://localhost:3000/">Open connected LinguaKids</a></main><script>const target=new URL('http://localhost:3000/');target.search=location.search;target.hash=location.hash;document.getElementById('connected').href=target.href;location.replace(target.href);</script></html>'''


if __name__=='__main__':
    folder=ROOT/'.preview/react-entry'
    folder.mkdir(parents=True,exist_ok=True)
    (folder/'index.html').write_text(entry_html(),encoding='utf-8')
    (folder/'config.json').write_text(json.dumps({'CONNECTED_ENTRY':'http://localhost:3000/','PREVIEW':False}),encoding='utf-8')
    (folder/'flutter_service_worker.js').write_bytes((ROOT/'apps/linguakids_web/public/flutter_service_worker.js').read_bytes())
    print('Former preview address now points to the connected app.')
