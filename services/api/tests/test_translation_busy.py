import httpx,pytest
from app.config import Settings,get_settings
from app.models import AccountRole
from test_api import client_for
@pytest.mark.parametrize('status',[429,503,504])
def test_educator_translation_preserves_retryable_worker_response(monkeypatch,tmp_path,status):
 import app.main as main
 client,gateway=client_for(AccountRole.educator);gateway.model={'version':'fixture'}
 client.app.dependency_overrides[get_settings]=lambda:Settings(model_package_path=tmp_path,inference_shared_secret='fixture',inference_base_url='http://worker')
 monkeypatch.setattr(main,'assert_source_language',lambda *args:None)
 class Worker:
  async def __aenter__(self):return self
  async def __aexit__(self,*args):pass
  async def post(self,url,**kwargs):return httpx.Response(status,request=httpx.Request('POST',url),json={'detail':'busy'})
 monkeypatch.setattr(main.httpx,'AsyncClient',lambda **kwargs:Worker())
 r=client.post('/v1/translation',json={'text':'Hello','source_language':'en','target_language':'fil'})
 assert r.status_code==status and r.headers['Retry-After']=='2';assert 'busy' in r.json()['detail']
