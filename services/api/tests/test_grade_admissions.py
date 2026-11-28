from uuid import UUID
import httpx,pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.grade_admissions import router
from app.security import current_user,get_gateway
from app.config import Settings,get_settings
from app.models import CurrentUser
UID='00000000-0000-0000-0000-000000000011'
class Gateway:
 def __init__(self):self.calls=[];self.removed=False
 async def _request(self,method,path,**kwargs):
  self.calls.append(path)
  return {'already_removed':self.removed} if path.endswith('admin_begin_grade_release') else {'released':True,'grade_level':1}
def app(role='administrator',secret='sb_secret_fixture'):
 a=FastAPI();a.include_router(router);g=Gateway()
 a.dependency_overrides[current_user]=lambda:CurrentUser(id=UUID(UID),name='Fixture',email='a@example.org',role=role,status='active')
 a.dependency_overrides[get_gateway]=lambda:g
 a.dependency_overrides[get_settings]=lambda:Settings(supabase_url='https://fixture.supabase.co',supabase_secret_key=secret)
 return TestClient(a),g
def payload():return {'expected_user_id':UID,'mode':'pending','reason':'Abandoned registration'}
def test_educator_cannot_release_accounts():
 c,g=app('educator');assert c.post('/v1/admin/grades/1/release',json=payload()).status_code==403;assert not g.calls
def test_missing_admin_secret_fails_before_suspending_teacher():
 c,g=app(secret='');assert c.post('/v1/admin/grades/1/release',json=payload()).status_code==503;assert not g.calls
def test_invalid_grade_and_whitespace_reason_are_rejected():
 c,g=app();assert c.post('/v1/admin/grades/7/release',json=payload()).status_code==422
 assert c.post('/v1/admin/grades/1/release',json={**payload(),'reason':'   '}).status_code==422;assert not g.calls
def test_retry_after_auth_deletion_finishes_without_deleting_twice():
 c,g=app();g.removed=True;r=c.post('/v1/admin/grades/1/release',json=payload());assert r.status_code==200
 assert g.calls==['rpc/admin_begin_grade_release','rpc/admin_finish_grade_release']
def test_auth_outage_retains_reserved_slot_and_does_not_finish(monkeypatch):
 async def fail(self,*args,**kwargs):raise httpx.ConnectError('offline')
 monkeypatch.setattr(httpx.AsyncClient,'request',fail)
 c,g=app();r=c.post('/v1/admin/grades/1/release',json=payload());assert r.status_code==503
 assert g.calls==['rpc/admin_begin_grade_release'];assert 'retained' in r.json()['detail']
