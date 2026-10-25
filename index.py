"""Vercel entrypoint: API routes plus a CDN-hosted Flutter web client."""
from fastapi import Request
from fastapi.responses import RedirectResponse

from services.api.app.main import app


@app.get('/', include_in_schema=False)
async def web_home(request: Request) -> RedirectResponse:
    # public/index.html is served by Vercel's CDN. Preserve PKCE callback codes.
    destination = '/index.html'
    if request.url.query:
        destination += '?' + request.url.query
    return RedirectResponse(destination, status_code=307)
