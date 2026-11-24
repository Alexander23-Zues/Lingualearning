import hashlib,io,json,zipfile
from uuid import UUID
import pytest
from app.models import CurrentUser
from app.offline_transfer import validate_archive
OWNER='00000000-0000-0000-0000-000000000001';CHILD='00000000-0000-0000-0000-000000000002'
def user():return CurrentUser(id=UUID(OWNER),email='owner@school.test',name='Owner',role='educator',status='active',grade_levels=[1])
def document():return {'format':'linguakids-field-collection-v2','account_id':OWNER,'device_id':OWNER,'package_id':OWNER,'students':[{'id':CHILD,'adult_id':OWNER,'nickname':'Demo child','grade_level':1,'learning_level':'beginner'}],'attempts':[],'recordings':[]}
def archive(doc=None,extra=None,corrupt=False):
 files={'collection.json':json.dumps(doc or document()).encode(),**(extra or {})};m={n:{'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()} for n,b in files.items()}
 if corrupt:m['collection.json']['sha256']='0'*64
 out=io.BytesIO()
 with zipfile.ZipFile(out,'w') as z:
  for n,b in files.items():z.writestr(n,b)
  z.writestr('manifest.json',json.dumps(m))
 return out.getvalue()
def test_accepts_owner_backup_without_exposing_marking_keys():
 assert validate_archive(archive(),user())['students'][0]['id']==CHILD
def test_rejects_other_owner_and_grade():
 d=document();d['account_id']=CHILD
 with pytest.raises(ValueError,match='another educator'):validate_archive(archive(d),user())
 d=document();d['students'][0]['grade_level']=2
 with pytest.raises(ValueError,match='owner or grade'):validate_archive(archive(d),user())
@pytest.mark.parametrize('name',['../private.txt','/etc/passwd','audio\\escape.wav','C:/secret'])
def test_zip_path_traversal_rejected(name):
 with pytest.raises(ValueError,match='Unsafe|Manifest'):validate_archive(archive(extra={name:b'x'}),user())
def test_checksum_corruption_rejected():
 with pytest.raises(ValueError,match='checksum'):validate_archive(archive(corrupt=True),user())
def test_duplicate_student_id_rejected():
 d=document();d['students']*=2
 with pytest.raises(ValueError,match='Duplicate student'):validate_archive(archive(d),user())
def test_audio_cannot_be_assigned_to_another_learner():
 d=document();d['recordings']=[{'id':OWNER,'child_id':OWNER,'file':'audio/'+OWNER+'.wav','sha256':hashlib.sha256(b'audio').hexdigest()}]
 with pytest.raises(ValueError,match='another student'):validate_archive(archive(d,{'audio/'+OWNER+'.wav':b'audio'}),user())
def test_changed_manifest_cannot_hide_extra_file():
 raw=archive();out=io.BytesIO(raw)
 with zipfile.ZipFile(out,'a') as z:z.writestr('hidden.txt','x')
 with pytest.raises(ValueError,match='every file'):validate_archive(out.getvalue(),user())

@pytest.mark.parametrize('change',[{'owner_id':CHILD},{'data':{'child_id':OWNER,'grade_level':1,'source_key':'test:1'}},{'data':{'child_id':CHILD,'grade_level':2,'source_key':'test:1'}}])
def test_baseline_cannot_cross_owner_child_or_grade(change):
 d=document();d['classroom_records']=[{'kind':'reading_assessment','owner_id':OWNER,'data':{'child_id':CHILD,'grade_level':1,'source_key':'test:1'},**change}]
 with pytest.raises(ValueError,match='another classroom'):validate_archive(archive(d),user())

def test_retry_skips_existing_baselines_before_applying_batch_limit(monkeypatch):
 import asyncio,httpx
 from types import SimpleNamespace
 from fastapi import UploadFile
 from app import offline_transfer as transfer
 doc=document();doc['classroom_records']=[{'kind':'reading_assessment','owner_id':OWNER,'data':{'child_id':CHILD,'grade_level':1,'source_key':f'test:{i}'}} for i in range(101)]
 class Client:
  async def post(self,*args,**kwargs):return httpx.Response(200,json={},request=httpx.Request('POST','https://example.test'))
  async def aclose(self):pass
 class Backend:
  client=Client()
  async def _request(self,method,path,**kwargs):
   if path=='child_profiles':return doc['students']
   if method=='GET':return [{'id':OWNER,'status':'needs_review'}]
   return None
 class Gateway:
  saved=[]
  async def _request(self,method,path,**kwargs):
   if method=='GET':
    key=kwargs['params']['data->>source_key'][3:]
    row=next(r for r in doc['classroom_records'] if r['data']['source_key']==key)
    return [{'data':row['data']}] if key!='test:100' else []
   self.saved.append(kwargs['json']['p_data']['source_key'])
 gateway=Gateway();monkeypatch.setattr(transfer,'service',lambda settings:Backend())
 result=asyncio.run(transfer.import_backup(user(),UploadFile(file=io.BytesIO(archive(doc))),gateway,SimpleNamespace(supabase_url='https://example.test',supabase_secret_key='synthetic-key')))
 assert result['reading_baselines_transferred']==1 and gateway.saved==['test:100']
 assert result['items_needing_review']==0

def test_all_grade_account_cannot_mislabel_student_baseline_grade():
 d=document();d['classroom_records']=[{'kind':'reading_assessment','owner_id':OWNER,'data':{'child_id':CHILD,'grade_level':2,'source_key':'test:1'}}]
 owner=user();owner.grade_levels=[1,2,3,4,5,6]
 with pytest.raises(ValueError,match='another classroom'):validate_archive(archive(d),owner)

@pytest.mark.parametrize('changed_sequence',[False,True])
def test_guided_backup_replays_through_mission_checker_or_stays_pending(monkeypatch,changed_sequence):
 import asyncio,httpx
 from types import SimpleNamespace
 from fastapi import UploadFile
 from app import offline_transfer as transfer
 mid='00000000-0000-0000-0000-000000000003';sid='00000000-0000-0000-0000-000000000004'
 step={'id':mid+':1:read','material_id':mid,'material_version':1,'kind':'lesson'}
 cloud={'revision':1,'stages':[{'id':'mission-1','steps':[step]}]}
 doc=document();doc['attempts']=[{'submission_id':sid,'material_id':mid,'material_version':1,'grade_level':1,'child_id':CHILD,'answers':{},'adventure_step_id':step['id'],'adventure_revision':1,'correct_count':999}]
 doc['adventure']={'paths':{'1':{**cloud,'revision':2 if changed_sequence else 1}}}
 calls=[]
 class Client:
  async def post(self,url,**kwargs):
   if '/rpc/student_' in url:
    calls.append((url,kwargs['json']));assert 'correct_count' not in kwargs['json']
   return httpx.Response(200,json={'adventure':cloud,'adventure_passed':True},request=httpx.Request('POST',url))
  async def aclose(self):pass
 class Backend:
  client=Client()
  async def _request(self,method,path,**kwargs):
   if path=='child_profiles':return doc['students']
   if path=='offline_collection_archives' and method=='GET':return []
   if path=='offline_collection_archives' and method=='POST':return [{'id':OWNER,'status':'needs_review'}]
 class Gateway:
  async def _request(self,method,path,**kwargs):
   if path=='learning_attempts':return []
   if path=='learning_materials':return [{'id':mid,'grade_level':1,'version':1,'status':'published','owner_id':None}]
   if path=='rpc/educator_adventure':return cloud
   if path=='rpc/educator_adventure_progress':return [{'child_id':CHILD,'adventure':cloud,'quiz_attempts':[]}]
   if path=='rpc/open_child_session':return {'token':'synthetic-token'}
   raise AssertionError(path)
 monkeypatch.setattr(transfer,'service',lambda settings:Backend())
 result=asyncio.run(transfer.import_backup(user(),UploadFile(file=io.BytesIO(archive(doc))),Gateway(),SimpleNamespace(supabase_url='https://example.test',supabase_secret_key='synthetic-key',supabase_publishable_key='synthetic-publishable')))
 if changed_sequence:
  assert not calls and result['items_needing_review']==1 and result['activities_added_this_transfer']==0
 else:
  assert calls[0][0].endswith('/rpc/student_adventure_complete')
  assert calls[0][1]['p_step_id']==step['id'] and result['guided_responses_checked']==1 and result['activities_added_this_transfer']==1
