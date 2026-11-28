import asyncio,httpx
from app.config import Settings
from app.runtime_status import checked_model_status
def test_installed_manifest_does_not_claim_model_is_responding(monkeypatch):
 async def down(*args,**kwargs):raise httpx.ConnectError('offline')
 monkeypatch.setattr(httpx.AsyncClient,'get',down)
 status=asyncio.run(checked_model_status(Settings(),{'available':True,'version':'baseline'}))
 assert status['installed'] is True and status['available'] is False and not status['pronunciation_grading_validated']
def test_reports_loaded_runtime_without_claiming_pronunciation_validation(monkeypatch):
 async def ready(*args,**kwargs):return httpx.Response(200,json={'ready':True,'model_version':'actual-runtime','reading_ready':True,'tts_ready':False},request=httpx.Request('GET','http://fixture/health'))
 monkeypatch.setattr(httpx.AsyncClient,'get',ready)
 status=asyncio.run(checked_model_status(Settings(),{'available':True,'version':'manifest-version'}))
 assert status['available'] and status['reading_ready'];assert status['version']=='actual-runtime';assert status['translation_teacher_evaluation_verified'] is False
