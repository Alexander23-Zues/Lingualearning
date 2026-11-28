"""Same-origin cloud web app, with public configuration supplied at runtime."""
import os
import httpx
from pathlib import Path
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from services.api.app.main import app
from scripts.build_react import public_config


@app.get('/config.json', include_in_schema=False)
def config():
    public_environment = dict(os.environ)
    if public_environment.get('PUBLIC_SUPABASE_URL'):
        public_environment['SUPABASE_URL'] = public_environment['PUBLIC_SUPABASE_URL']
    return JSONResponse(public_config(public_environment, hosted=True), headers={'Cache-Control': 'no-store'})


@app.get('/ready', include_in_schema=False)
async def ready():
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.get('http://127.0.0.1:8001/health')
            response.raise_for_status()
            state = response.json()
        components = {'api': True, 'translation': bool(state.get('ready')), 'reading': bool(state.get('reading_ready'))}
        if os.environ.get('TTS_MODEL_ROOT'):
            components['offline_speech'] = bool(state.get('tts_ready'))
        return JSONResponse(components, status_code=200 if all(components.values()) else 503)
    except (httpx.HTTPError, ValueError):
        return JSONResponse({'api': True, 'inference': False}, status_code=503)


app.mount('/', StaticFiles(directory=Path('/app/public'), html=True), name='web')
