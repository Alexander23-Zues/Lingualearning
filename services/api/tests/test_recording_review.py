import asyncio,hashlib,io,zipfile
from types import SimpleNamespace
from uuid import UUID
import httpx,pytest
from fastapi import HTTPException
from app import recording_review as review
from app.recording_archive import audio_object_path,store_recording_objects

OWNER='00000000-0000-0000-0000-000000000001'
CHILD='00000000-0000-0000-0000-000000000002'
REC='00000000-0000-0000-0000-000000000003'
user=SimpleNamespace(id=UUID(OWNER),grade_levels=[1])
settings=SimpleNamespace(supabase_url='https://example.test',supabase_secret_key='synthetic-key')
def run(coro):return asyncio.run(coro)

def test_owner_and_grade_are_checked_before_playback_listing():
 class Gateway:
  async def _request(self,*args,**kwargs):return [{'id':CHILD,'grade_level':2}]
 with pytest.raises(HTTPException) as error:run(review.owned_child(UUID(CHILD),user,Gateway()))
 assert error.value.status_code==403

def test_playback_rejects_tampered_object_path_before_storage_access():
 rec={'id':REC,'child_id':CHILD,'sha256':'0'*64,'audio_object_path':'another-owner/audio.wav'}
 class Gateway:
  async def _request(self,method,path,**kwargs):
   assert kwargs['params'].get('owner_id',kwargs['params'].get('adult_id'))=='eq.'+OWNER
   return [{'result':{'recording_index':[rec]}}] if path=='offline_collection_archives' else [{'grade_level':1}]
 with pytest.raises(HTTPException) as error:run(review.load_recording(UUID(OWNER),UUID(REC),user,Gateway(),settings))
 assert error.value.status_code==409

def test_playback_stream_checks_digest_and_closes_private_client(monkeypatch):
 raw=b'private synthetic audio';rec={'id':REC,'child_id':CHILD,'sha256':hashlib.sha256(raw).hexdigest()};rec['audio_object_path']=audio_object_path(OWNER,rec)
 class Gateway:
  async def _request(self,method,path,**kwargs):return [{'result':{'recording_index':[rec]}}] if path=='offline_collection_archives' else [{'grade_level':1}]
 class Client:
  closed=False
  def stream(self,*args,**kwargs):return httpx.AsyncClient(transport=httpx.MockTransport(lambda request:httpx.Response(200,content=raw))).stream('GET','https://example.test/audio')
  async def aclose(self):self.closed=True
 client=Client();monkeypatch.setattr(review,'service',lambda settings:SimpleNamespace(client=client))
 assert run(review.load_recording(UUID(OWNER),UUID(REC),user,Gateway(),settings))[1]==raw
 assert client.closed
 rec['sha256']='1'*64;rec['audio_object_path']=audio_object_path(OWNER,rec)
 with pytest.raises(HTTPException) as error:run(review.load_recording(UUID(OWNER),UUID(REC),user,Gateway(),settings))
 assert error.value.status_code==422

def test_fresh_recognition_uses_scoped_session_and_always_closes_it(monkeypatch):
 from app import ai_routes
 rec={'id':REC,'child_id':CHILD,'language':'en','complete':True,'adventure_step_id':'story:1:read','part_index':0,'page':1,'expected_text':'The bird.'}
 async def load(*args):return rec,b'wav'
 calls=[]
 class Gateway:
  async def _request(self,method,path,**kwargs):calls.append((path,kwargs['json']));return {'token':'synthetic-token'}
 async def recognize(**kwargs):
  assert kwargs['student_token']=='synthetic-token' and kwargs['page_index']==1 and kwargs['part_index']==0
  assert await kwargs['audio'].read()==b'wav'
  raise HTTPException(503,'Synthetic busy service')
 monkeypatch.setattr(review,'load_recording',load);monkeypatch.setattr(ai_routes,'student_reading',recognize)
 with pytest.raises(HTTPException):run(review.check(UUID(OWNER),UUID(REC),user,Gateway(),settings))
 assert calls[-1]==('rpc/close_child_session',{'p_token':'synthetic-token'})
 rec['part_index']=None;calls.clear()
 with pytest.raises(HTTPException) as error:run(review.check(UUID(OWNER),UUID(REC),user,Gateway(),settings))
 assert error.value.status_code==409 and not calls

def test_audio_index_is_server_computed_and_retry_does_not_upload_again():
 raw=b'wav';rec={'id':REC,'child_id':CHILD,'file':'audio/'+REC+'.wav','sha256':hashlib.sha256(raw).hexdigest(),'audio_object_path':'forged'}
 source=io.BytesIO()
 with zipfile.ZipFile(source,'w') as z:z.writestr(rec['file'],raw)
 calls=[]
 class Client:
  async def post(self,url,**kwargs):calls.append(url);return httpx.Response(200,request=httpx.Request('POST',url))
 backend=SimpleNamespace(client=Client())
 index,pending=run(store_recording_objects(source,{'recordings':[rec]},{},user,backend,settings))
 assert index[0]['audio_object_path']==audio_object_path(OWNER,rec) and not pending and len(calls)==1
 again,pending=run(store_recording_objects(source,{'recordings':[rec]},{'result':{'recording_index':index}},user,backend,settings))
 assert again==index and len(calls)==1
