"""Scoped playback and fresh recognition of archived student story recordings."""
import hashlib,io
from uuid import UUID
from typing import Annotated
import httpx
from fastapi import APIRouter,Depends,HTTPException,UploadFile,Query
from fastapi.responses import Response
from .security import educator,get_gateway
from .models import CurrentUser
from .config import Settings,get_settings,supabase_headers
from .offline_transfer import service
from .recording_archive import audio_object_path
router=APIRouter(prefix='/v1/offline/recordings',tags=['offline'])

async def owned_child(child_id,user,gateway):
 rows=await gateway._request('GET','child_profiles',params={'id':'eq.'+str(child_id),'adult_id':'eq.'+str(user.id),'select':'id,grade_level'})
 if not rows or rows[0]['grade_level'] not in user.grade_levels:raise HTTPException(403,'Choose a learner in your assigned classroom.')
 return rows[0]

@router.get('')
async def recordings(child_id:UUID,user:Annotated[CurrentUser,Depends(educator)],offset:int=Query(0,ge=0),gateway=Depends(get_gateway)):
 await owned_child(child_id,user,gateway)
 archives=await gateway._request('GET','offline_collection_archives',params={'owner_id':'eq.'+str(user.id),'select':'id,result,created_at','order':'created_at.desc','limit':30,'offset':offset})
 seen=set();result=[]
 for archive in archives:
  for rec in (archive.get('result') or {}).get('recording_index',[]):
   if rec.get('child_id')!=str(child_id) or rec.get('id') in seen:continue
   seen.add(rec['id']);result.append({**rec,'archive_id':archive['id'],'playable':bool(rec.get('audio_object_path'))})
 return {'items':result,'next_offset':offset+30 if len(archives)==30 else None}

async def load_recording(archive_id,recording_id,user,gateway,settings):
 rows=await gateway._request('GET','offline_collection_archives',params={'id':'eq.'+str(archive_id),'owner_id':'eq.'+str(user.id),'select':'result'})
 if not rows:raise HTTPException(404,'Private recording backup not found.')
 rec=next((r for r in (rows[0].get('result') or {}).get('recording_index',[]) if r.get('id')==str(recording_id)),None)
 if not rec or not rec.get('child_id'):raise HTTPException(404,'Recording not found in this backup.')
 await owned_child(UUID(rec['child_id']),user,gateway)
 path=rec.get('audio_object_path')
 if not path or path!=audio_object_path(user.id,rec):raise HTTPException(409,'Transfer the original backup again to prepare private recording playback.')
 backend=service(settings)
 try:
  async with backend.client.stream('GET',settings.supabase_url+'/storage/v1/object/offline-collections/'+path,headers=supabase_headers(settings.supabase_secret_key)) as response:
   response.raise_for_status();data=bytearray()
   async for chunk in response.aiter_bytes():
    if len(data)+len(chunk)>4*1024*1024:raise HTTPException(422,'Recording is too large for playback here.')
    data.extend(chunk)
  if hashlib.sha256(data).hexdigest()!=rec['sha256']:raise HTTPException(422,'Recording checksum failed. Keep the original backup.')
  return rec,bytes(data)
 except httpx.HTTPError as error:raise HTTPException(503,'Private recording could not be loaded. Keep the original backup.') from error
 finally:await backend.client.aclose()

@router.get('/{archive_id}/{recording_id}/audio')
async def audio(archive_id:UUID,recording_id:UUID,user:Annotated[CurrentUser,Depends(educator)],gateway=Depends(get_gateway),settings:Settings=Depends(get_settings)):
 _,data=await load_recording(archive_id,recording_id,user,gateway,settings)
 return Response(data,media_type='audio/wav',headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'})

@router.post('/{archive_id}/{recording_id}/check')
async def check(archive_id:UUID,recording_id:UUID,user:Annotated[CurrentUser,Depends(educator)],gateway=Depends(get_gateway),settings:Settings=Depends(get_settings)):
 from .ai_routes import student_reading
 rec,data=await load_recording(archive_id,recording_id,user,gateway,settings)
 if not rec.get('complete') or not rec.get('adventure_step_id') or rec.get('language')!='en' or rec.get('part_index') is None:raise HTTPException(409,'A complete recording linked to the exact English mission part is required. Older or partial audio remains available for listening.')
 opened=await gateway._request('POST','rpc/open_child_session',json={'p_child_id':rec['child_id']});token=opened['token']
 try:
  return await student_reading(audio=UploadFile(file=io.BytesIO(data),filename='recording.wav'),expected_text=rec.get('expected_text',''),language='en',student_token=token,adventure_step_id=rec['adventure_step_id'],page_index=rec.get('page') or 0,part_index=rec['part_index'],settings=settings)
 finally:
  try:await gateway._request('POST','rpc/close_child_session',json={'p_token':token})
  except httpx.HTTPError:pass
