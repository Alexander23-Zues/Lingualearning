"""Owner-authenticated backup transfer. Existing activity RPCs keep marking keys private."""
import asyncio,hashlib,io,json,zipfile
from pathlib import PurePosixPath
from typing import Annotated
from uuid import UUID
import httpx
from fastapi import APIRouter,Depends,File,HTTPException,UploadFile
from fastapi.responses import Response
from starlette.concurrency import run_in_threadpool
from .config import Settings,get_settings,supabase_headers
from .gateway import SupabaseGateway
from .models import CurrentUser
from .security import educator,get_gateway
from .guided_transfer import same_mission_sequence
from .recording_archive import store_recording_objects

router=APIRouter(prefix='/v1/offline',tags=['offline'])
MAX_ARCHIVE=150*1024*1024;MAX_UNPACKED=200*1024*1024
transfer_lock=asyncio.Lock()
BASELINE_FIELDS=set('source_key source_title source_row source_notes language assessment_type assessment_date letter_sounds rhymes sentences part1_total part1_level story_number total_story_words miscues words_read reading_seconds wpm accuracy_percent comprehension_correct comprehension_total experience_rating observation_level reading_profile'.split())
ENGLISH_FIELDS=set('source_key source_title language assessment_date reading_profile notes'.split())

def validate_archive(raw,user:CurrentUser):
    """Checksums detect damage. They are not signatures or proof of a child's performance."""
    def require(value,message):
        if not value:raise ValueError(message)
    if isinstance(raw,bytes):
        require(len(raw)<=MAX_ARCHIVE,'Backup is too large. Export a smaller collection.');source=io.BytesIO(raw)
    else:
        source=raw;source.seek(0,2);require(source.tell()<=MAX_ARCHIVE,'Backup is too large. Export a smaller collection.');source.seek(0)
    with zipfile.ZipFile(source) as z:
        entries=z.infolist();names=[i.filename for i in entries]
        require(len(entries)<=6000 and len(set(names))==len(names),'Backup has duplicate or excessive files.')
        require(sum(i.file_size for i in entries)<=MAX_UNPACKED,'Expanded backup is too large.')
        for i in entries:
            p=PurePosixPath(i.filename)
            require(not p.is_absolute() and '..' not in p.parts and '\\' not in i.filename and ':' not in i.filename and not i.is_dir(),'Unsafe backup filename.')
            require(not i.flag_bits&1 and i.file_size<=64*1024*1024,'Unsupported or oversized backup file.')
        require('manifest.json' in names and 'collection.json' in names,'Collection manifest is missing.')
        require(z.getinfo('manifest.json').file_size<=2*1024*1024 and z.getinfo('collection.json').file_size<=16*1024*1024,'Collection metadata is too large.')
        manifest=json.loads(z.read('manifest.json'))
        require(isinstance(manifest,dict) and set(manifest)==set(names)-{'manifest.json'},'Manifest does not describe every file.')
        for name,m in manifest.items():
            content=z.read(name)
            require(isinstance(m,dict) and len(content)==m.get('bytes') and hashlib.sha256(content).hexdigest()==m.get('sha256'),'Backup checksum failed: '+name)
        doc=json.loads(z.read('collection.json'))
        require(doc.get('format')=='linguakids-field-collection-v2','Export this backup again using the updated offline application.')
        require(doc.get('account_id')==str(user.id),'This backup belongs to another educator account.')
        UUID(doc['device_id']);UUID(doc['package_id'])
        students=doc.get('students');attempts=doc.get('attempts')
        adventure=doc.get('adventure',{})
        require(isinstance(adventure,dict) and isinstance(adventure.get('paths',{}),dict) and isinstance(adventure.get('placements',{}),dict),'Invalid mission backup.')
        require(isinstance(students,list) and len(students)<=2000 and isinstance(attempts,list) and len(attempts)<=20000,'Invalid collection records.')
        ids=set()
        for child in students:
            UUID(child['id']);require(child['id'] not in ids,'Duplicate student identity.');ids.add(child['id'])
            require(child.get('adult_id')==str(user.id) and child.get('grade_level') in user.grade_levels,'Student owner or grade does not match this account.')
            require(isinstance(child.get('nickname'),str) and 0<len(child['nickname'].strip())<=100,'Invalid student nickname.')
            require(child.get('learning_level','beginner') in ('beginner','developing','independent') and child.get('gender') in (None,'male','female'),'Invalid student details.')
        submissions=set()
        for attempt in attempts:
            UUID(attempt['submission_id']);UUID(attempt['material_id']);require(attempt['submission_id'] not in submissions,'Duplicate submission identity.');submissions.add(attempt['submission_id'])
            require(attempt.get('child_id') in ids and attempt.get('grade_level') in user.grade_levels,'Activity belongs to another classroom.')
            require(isinstance(attempt.get('material_version'),int) and isinstance(attempt.get('answers',{}),dict),'Invalid activity version or answers.')
            if attempt.get('adventure_step_id') is not None:require(isinstance(attempt['adventure_step_id'],str) and 0<len(attempt['adventure_step_id'])<=180 and type(attempt.get('adventure_revision')) is int and attempt['adventure_revision']>0,'Invalid guided activity identity.')
        recording_ids=set()
        require(isinstance(doc.get('recordings',[]),list) and len(doc.get('recordings',[]))<=5000,'Invalid recording list.')
        for rec in doc.get('recordings',[]):
            UUID(rec['id']);require(rec.get('child_id') is None or rec['child_id'] in ids,'Recording belongs to another student.')
            require(rec['id'] not in recording_ids,'Duplicate recording identity.');recording_ids.add(rec['id'])
            require(rec.get('file')=='audio/'+rec['id']+'.wav' and rec['file'] in manifest,'Recording audio is missing.')
            require(manifest[rec['file']]['sha256']==rec.get('sha256'),'Recording checksum failed.')
            require(isinstance(rec.get('expected_text',''),str) and len(rec.get('expected_text',''))<=2000,'Invalid recording text.')
            require(rec.get('language') in (None,'en','fil') and type(rec.get('complete',False)) is bool,'Invalid recording metadata.')
            for key in ('page','part_index'):
                require(rec.get(key) is None or type(rec[key]) is int and 0<=rec[key]<=10000,'Invalid recording position.')
            require(rec.get('adventure_step_id') is None or isinstance(rec['adventure_step_id'],str) and len(rec['adventure_step_id'])<=180,'Invalid recording mission.')
        classroom_records=doc.get('classroom_records',[])
        student_grades={child['id']:child['grade_level'] for child in students}
        require(isinstance(classroom_records,list) and len(classroom_records)<=5000,'Invalid classroom records.')
        for record in classroom_records:
            require(isinstance(record,dict),'Invalid classroom record.')
            if record.get('kind') not in ('reading_assessment','english_assessment'):continue
            data=record.get('data');require(isinstance(data,dict),'Invalid reading baseline.')
            require(record.get('owner_id')==str(user.id) and data.get('child_id') in ids and data.get('grade_level') in user.grade_levels and data.get('grade_level')==student_grades.get(data.get('child_id')),'Reading baseline belongs to another classroom.')
            require(isinstance(data.get('source_key'),str) and 0<len(data['source_key'])<=100,'Invalid reading baseline source.')
        return doc

def service(settings):
    if not settings.supabase_secret_key:raise HTTPException(503,'Online backup storage is not configured. Keep your local ZIP backup.')
    return SupabaseGateway(settings)

async def list_archives(user,gateway):
    rows=await gateway._request('GET','offline_collection_archives',params={'owner_id':'eq.'+str(user.id),'select':'id,status,result,created_at,updated_at','order':'created_at.desc','limit':30})
    return [{**row,'result':{k:v for k,v in (row.get('result') or {}).items() if k!='recording_index'}} for row in rows]

@router.get('/archives')
async def archives(user:Annotated[CurrentUser,Depends(educator)],gateway=Depends(get_gateway)):
    return await list_archives(user,gateway)

@router.get('/archives/{archive_id}/download')
async def download(archive_id:UUID,user:Annotated[CurrentUser,Depends(educator)],gateway=Depends(get_gateway),settings:Settings=Depends(get_settings)):
    rows=await gateway._request('GET','offline_collection_archives',params={'id':'eq.'+str(archive_id),'owner_id':'eq.'+str(user.id),'select':'object_path'})
    if not rows:raise HTTPException(404,'Backup not found in this account.')
    backend=service(settings)
    try:
        r=await backend.client.get(settings.supabase_url+'/storage/v1/object/offline-collections/'+rows[0]['object_path'],headers=supabase_headers(settings.supabase_secret_key));r.raise_for_status()
        return Response(r.content,media_type='application/zip',headers={'Content-Disposition':'attachment; filename="LinguaKids-private-backup.zip"','Cache-Control':'no-store'})
    except httpx.HTTPError as e:raise HTTPException(503,'Backup download is unavailable. Keep the original local copy.') from e
    finally:await backend.client.aclose()

@router.post('/import')
async def import_backup(user:Annotated[CurrentUser,Depends(educator)],file:UploadFile=File(...),gateway=Depends(get_gateway),settings:Settings=Depends(get_settings)):
    if transfer_lock.locked():raise HTTPException(429,'Another backup is being transferred. Keep this file and try again shortly.')
    async with transfer_lock:
        try:doc=await run_in_threadpool(validate_archive,file.file,user)
        except (ValueError,KeyError,TypeError,zipfile.BadZipFile,RuntimeError) as e:raise HTTPException(422,'Invalid offline backup: '+str(e)) from e
        digest=hashlib.sha256();size=0;await file.seek(0)
        while chunk:=await file.read(1024*1024):digest.update(chunk);size+=len(chunk)
        await file.seek(0)
        async def chunks():
            while chunk:=await file.read(1024*1024):yield chunk
        backend=service(settings);checksum=digest.hexdigest();path=str(user.id)+'/'+doc['package_id']+'/'+checksum+'.zip'
        try:
            # Preflight every existing student ID before any writes. Never reassign school records.
            known={}
            for start in range(0,len(doc['students']),100):
                ids=','.join(c['id'] for c in doc['students'][start:start+100])
                rows=await backend._request('GET','child_profiles',params={'id':'in.('+ids+')','select':'id,adult_id,grade_level,nickname,gender,active'})
                for row in rows:known[row['id']]=row
            for child in doc['students']:
                existing=known.get(child['id'])
                if existing and (existing['adult_id']!=str(user.id) or existing['grade_level']!=child['grade_level']):raise HTTPException(403,'A student identity conflicts with another account or grade. No classroom records were changed.')
            # Original JSON, notes, drafts and WAV recordings are saved before progress transfer.
            r=await backend.client.post(settings.supabase_url+'/storage/v1/object/offline-collections/'+path,headers={**supabase_headers(settings.supabase_secret_key),'Content-Type':'application/zip','Content-Length':str(size),'x-upsert':'true'},content=chunks(),timeout=120);r.raise_for_status()
            records=await backend._request('GET','offline_collection_archives',params={'owner_id':'eq.'+str(user.id),'checksum':'eq.'+checksum,'select':'*'})
            if records:archive=records[0]
            else:
                rows=await backend._request('POST','offline_collection_archives',headers={'Prefer':'return=representation'},json={'owner_id':str(user.id),'checksum':checksum,'object_path':path,'device_id':doc['device_id']});archive=rows[0]
            if archive['status']=='complete' and archive.get('result',{}).get('transfer_protocol',0)>=3:
                return {**{k:v for k,v in archive['result'].items() if k!='recording_index'},
                    'archive_id':archive['id'],'repeated':True,'students_added_this_transfer':0,
                    'activities_added_this_transfer':0,'guided_responses_checked':0,'reading_baselines_transferred':0}
            transferred=0;pending=[];new_students=0;baselines=0;guided_checked=0
            for child in doc['students']:
                if child['id'] in known:continue
                if new_students>=50:pending.append({'type':'students','reason':'More students remain; transfer the same backup again.'});break
                values={k:child[k] for k in ('id','nickname','grade_level','gender','learning_level','avatar_key') if k in child};values.update(adult_id=str(user.id),active=child.get('active',True))
                await backend._request('POST','child_profiles',json=values);known[child['id']]=values;new_students+=1
            for record in doc.get('classroom_records',[]):
                if record.get('kind') not in ('reading_assessment','english_assessment'):continue
                english=record['kind']=='english_assessment';fields=ENGLISH_FIELDS if english else BASELINE_FIELDS
                data=record['data']
                if data['child_id'] not in known:
                    pending.append({'type':'reading_baseline','reason':'Transfer the remaining student profiles, then retry this backup.'});continue
                existing=await gateway._request('GET','workspace_records',params={'owner_id':'eq.'+str(user.id),'kind':'eq.'+record['kind'],'data->>source_key':'eq.'+data['source_key'],'select':'data','limit':1})
                if existing:
                    prior=existing[0]['data']
                    if prior.get('child_id')!=data['child_id'] or any(prior.get(key)!=data.get(key) for key in fields):
                        pending.append({'type':'reading_baseline','reason':'An existing source row differs; the teacher must review both copies.'})
                    continue
                if baselines>=100:
                    pending.append({'type':'reading_baseline','reason':'More baselines remain; transfer the same backup again.'});break
                try:
                    await gateway._request('POST','rpc/'+('save_english_assessment' if english else 'save_reading_assessment'),json={'p_child_id':data['child_id'],'p_data':{key:value for key,value in data.items() if key in fields}})
                    baselines+=1
                except httpx.HTTPStatusError as error:
                    if error.response.status_code>=500:raise
                    pending.append({'type':'reading_baseline','reason':'The source baseline needs teacher review; its original values are preserved in the private backup.'})
            material_cache={};tokens={};paths={};guided_history={};guided_states={};placement_blocked=set()
            for cid,placement in doc.get('adventure',{}).get('placements',{}).items():
                if cid not in known or not isinstance(placement,dict):continue
                current=await gateway._request('POST','rpc/educator_placement',json={'p_child_id':cid})
                remote=current.get('placement') or {}
                if any(remote.get(key)!=placement.get(key) for key in ('approved_stage_id','selected_stage_id','path_revision')):
                    placement_blocked.add(cid);pending.append({'child_id':cid,'type':'placement','reason':'Confirm this learner’s English placement and starting choice online before transferring guided responses. The offline decision is retained in the private backup.'})
            try:
                for attempt in doc['attempts']:
                    if attempt['child_id'] not in known:continue
                    rows=await gateway._request('GET','learning_attempts',params={'submission_id':'eq.'+attempt['submission_id'],'select':'id,child_id,material_id,material_version'})
                    guided=bool(attempt.get('adventure_step_id'))
                    if rows:
                        row=rows[0]
                        if any(row[k]!=attempt[k] for k in ('child_id','material_id','material_version')):raise HTTPException(409,'A submission identity is already used by another response.')
                        if not guided:continue
                    if transferred>=100:pending.append({'type':'activities','reason':'More activities remain; transfer the same backup again.'});break
                    mid=attempt['material_id']
                    if mid not in material_cache:
                        ms=await gateway._request('GET','learning_materials',params={'id':'eq.'+mid,'select':'id,grade_level,version,status,owner_id'});material_cache[mid]=ms[0] if ms else None
                    m=material_cache[mid]
                    if not m or m['grade_level']!=attempt['grade_level'] or m['version']!=attempt['material_version'] or not(m['status']=='published' or m['status']=='classroom' and m['owner_id']==str(user.id)):
                        pending.append({'submission_id':attempt['submission_id'],'reason':'Material is new, changed or unavailable; original answers are in the private backup for teacher review.'});continue
                    cid=attempt['child_id']
                    if guided:
                        if cid in placement_blocked:continue
                        grade=attempt['grade_level']
                        if grade not in paths:
                            paths[grade]=await gateway._request('POST','rpc/educator_adventure',json={'p_grade':grade})
                            learners=await gateway._request('POST','rpc/educator_adventure_progress',json={'p_grade':grade})
                            for learner in learners:
                                guided_history[learner['child_id']]={a['submission_id'] for a in learner.get('quiz_attempts',[]) if a.get('submission_id')}
                                guided_states[learner['child_id']]={s['id']:s for stage in learner.get('adventure',{}).get('stages',[]) for s in stage.get('steps',[])}
                        local=doc.get('adventure',{}).get('paths',{}).get(str(grade))
                        if not same_mission_sequence(local,paths[grade]) or attempt['adventure_revision']!=paths[grade]['revision']:
                            pending.append({'child_id':cid,'submission_id':attempt['submission_id'],'reason':'The offline mission sequence differs from the current classroom sequence. Original answers are preserved for teacher review.'});continue
                        if rows and (attempt['submission_id'] in guided_history.get(cid,set()) or guided_states.get(cid,{}).get(attempt['adventure_step_id'],{}).get('status')=='completed'):continue
                        if guided_checked>=100:pending.append({'type':'missions','reason':'More guided responses remain; transfer this backup again.'});break
                    if known[cid].get('active') is False:
                        pending.append({'child_id':cid,'submission_id':attempt['submission_id'],'reason':'This learner is inactive. The saved response remains in the private backup for teacher review.'});continue
                    if cid not in tokens:tokens[cid]=(await gateway._request('POST','rpc/open_child_session',json={'p_child_id':cid}))['token']
                    # Existing student RPC recomputes scoring from private current keys; exported counts are ignored.
                    payload={'p_token':tokens[cid],'p_submission_id':attempt['submission_id'],'p_answers':attempt.get('answers',{})}
                    if guided:payload.update(p_step_id=attempt['adventure_step_id'],p_revision=paths[attempt['grade_level']]['revision'])
                    else:payload.update(p_material_id=mid,p_version=attempt['material_version'])
                    response=await backend.client.post(settings.supabase_url+'/rest/v1/rpc/'+('student_adventure_complete' if guided else 'student_complete_material'),headers=supabase_headers(settings.supabase_publishable_key),json=payload)
                    if not response.is_success:
                        if response.status_code>=500:response.raise_for_status()
                        pending.append({'child_id':cid,'submission_id':attempt['submission_id'],'reason':'This mission response requires online reading verification, teacher review, or completion of an earlier step. The original response and recording remain in the private backup.' if guided else 'Activity requires teacher review; original answers were preserved.'});continue
                    if not rows:transferred+=1
                    if guided:
                        guided_checked+=1
                        value=response.json();guided_states[cid]={s['id']:s for stage in value.get('adventure',{}).get('stages',[]) for s in stage.get('steps',[])}
                        guided_history.setdefault(cid,set()).add(attempt['submission_id'])
            finally:
                for token in tokens.values():
                    try:await backend.client.post(settings.supabase_url+'/rest/v1/rpc/close_child_session',headers=supabase_headers(settings.supabase_publishable_key),json={'p_token':token})
                    except httpx.HTTPError:pass
            edited=sum(c['id'] in known and any(known[c['id']].get(k)!=c.get(k) for k in ('nickname','gender')) for c in doc['students'])
            recording_index,audio_pending=await store_recording_objects(file.file,doc,archive,user,backend,settings);pending.extend(audio_pending)
            result={'transfer_protocol':3,'archive_saved':True,'students_added_this_transfer':new_students,'activities_added_this_transfer':transferred,'guided_responses_checked':guided_checked,'reading_baselines_transferred':baselines,'items_needing_review':len(pending),'pending_details':pending[:200],'existing_profile_edits_in_archive':edited,'recordings_preserved':len(doc.get('recordings',[])),'notes_and_drafts_preserved':True,'manual_material_and_classroom_review':True}
            await backend._request('PATCH','offline_collection_archives',params={'id':'eq.'+archive['id']},json={'status':'needs_review' if pending or edited else 'complete','result':{**result,'recording_index':recording_index}})
            return {**result,'archive_id':archive['id'],'repeated':False}
        except httpx.HTTPError as e:raise HTTPException(503,'Transfer was interrupted. Keep the local ZIP and retry the same file; saved students and activities will not be duplicated.') from e
        finally:await backend.client.aclose()
