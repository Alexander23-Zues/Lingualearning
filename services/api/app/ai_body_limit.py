"""Bound multipart bodies before parsing or spooling uploads."""
from starlette.responses import JSONResponse


class AiBodyLimit:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        path = scope.get('path', '')
        if scope['type']=='http' and scope.get('method')=='POST' and path=='/v1/offline/import':
            total=0
            class TooLarge(Exception):pass
            async def bounded_receive():
                nonlocal total
                message=await receive();total+=len(message.get('body',b''))
                if total>157300000:raise TooLarge()
                return message
            try:return await self.app(scope,bounded_receive,send)
            except TooLarge:return await JSONResponse({'detail':'Offline backup exceeds 150 MB.'},status_code=413)(scope,receive,send)
        lesson_import = path == '/v1/lessons/import'
        if scope['type'] != 'http' or scope.get('method') != 'POST' or not (lesson_import or path.startswith('/v1/ai/')):
            return await self.app(scope, receive, send)
        if lesson_import:
            limit, detail = 2_020_000, 'Choose a lesson file under 2 MB.'
        else:
            limit = 1_600_000 if path.endswith(('reading', 'student-reading')) else 6_000_000
            detail = 'AI upload exceeds the allowed size.'
        messages, total = [], 0
        while True:
            message = await receive()
            if message['type'] == 'http.disconnect':
                return
            total += len(message.get('body', b''))
            if total > limit:
                return await JSONResponse({'detail': detail}, status_code=413)(scope, receive, send)
            messages.append(message)
            if not message.get('more_body', False):
                break
        async def replay():
            return messages.pop(0) if messages else await receive()
        await self.app(scope, replay, send)
