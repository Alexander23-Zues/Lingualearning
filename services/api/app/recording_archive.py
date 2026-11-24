"""Keep playback objects private and bounded; original WAVs remain in the ZIP backup."""
import zipfile
from .config import supabase_headers
FIELDS={'id','child_id','material_id','material_version','page','part_index','adventure_step_id','expected_text','language','complete','duration_seconds','sha256','saved_at'}
def audio_object_path(owner,record):return f"{owner}/recordings/{record['id']}/{record['sha256']}.wav"
async def store_recording_objects(source,doc,previous,user,backend,settings):
 old={r['id']:r for r in (previous.get('result') or {}).get('recording_index',[])};index=[];pending=[];added=0
 with zipfile.ZipFile(source) as archive:
  for rec in doc.get('recordings',[]):
   if not rec.get('child_id'):continue
   value={k:v for k,v in rec.items() if k in FIELDS};path=audio_object_path(user.id,rec);prior=old.get(rec['id'],{})
   if prior.get('audio_object_path')==path and prior.get('sha256')==rec['sha256']:value['audio_object_path']=path
   elif added>=100:pending.append({'child_id':rec['child_id'],'type':'audio','reason':'More recordings remain for playback; transfer the same backup again.'})
   else:
    entry=archive.getinfo(rec['file'])
    if entry.file_size>4*1024*1024:pending.append({'child_id':rec['child_id'],'type':'audio','reason':'A large recording remains available in the original private ZIP.'})
    else:
     response=await backend.client.post(settings.supabase_url+'/storage/v1/object/offline-collections/'+path,headers={**supabase_headers(settings.supabase_secret_key),'Content-Type':'audio/wav','x-upsert':'true'},content=archive.read(entry));response.raise_for_status()
     value['audio_object_path']=path;added+=1
   index.append(value)
 return index,pending
