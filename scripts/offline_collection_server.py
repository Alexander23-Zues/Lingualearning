"""Loopback-only field collection. SQLite is the authority; never contacts cloud services."""
from __future__ import annotations
import argparse,base64,csv,hashlib,hmac,http.cookies,io,json,os,secrets,sqlite3,threading,time,uuid,wave,zipfile
from datetime import datetime,timezone
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse,unquote
import urllib.request,urllib.error
import re,unicodedata,difflib
from urllib.parse import parse_qs
from contextlib import contextmanager,closing
from adventure_learning import Adventure
from email.parser import BytesParser
from email.policy import default as email_policy

def now():return datetime.now(timezone.utc).isoformat()
def uid():return str(uuid.uuid4())
def dump(value):return json.dumps(value,ensure_ascii=False,separators=(',',':'))
class CollectionError(Exception):
    def __init__(self,message,status=400):super().__init__(message);self.status=status
def require(value,message,status=400):
    if not value:raise CollectionError(message,status)
def clean(data):return {k:v for k,v in data.items() if 'token' not in k.lower() and 'password' not in k.lower()}

class Store:
    def __init__(self,path):
        self.path=Path(path);self.lock=threading.RLock();self.path.parent.mkdir(parents=True,exist_ok=True)
        with self.connect() as db:
            db.execute('pragma journal_mode=WAL')
            db.executescript('''create table if not exists settings(key text primary key,value text not null);
            create table if not exists state(id integer primary key check(id=1),value text not null);
            create table if not exists sessions(token text primary key,kind text not null,child text,expires real not null,locked integer not null default 0);
            create table if not exists events(id text primary key,kind text not null,payload text not null,at text not null);
            create table if not exists drafts(id text primary key,revision integer not null,payload text not null,at text not null);
            create table if not exists recordings(id text primary key,revision integer not null,metadata text not null,audio blob not null,sha256 text not null,at text not null);
            create table if not exists notes(id text primary key,payload text not null,at text not null);''')
    @contextmanager
    def connect(self):
        db=sqlite3.connect(self.path,timeout=30);db.row_factory=sqlite3.Row;db.execute('pragma synchronous=FULL');db.execute('pragma busy_timeout=30000')
        try:
            with db:yield db
        finally:db.close()
    def setting(self,key):
        with self.connect() as db:
            row=db.execute('select value from settings where key=?',(key,)).fetchone();return json.loads(row[0]) if row else None
    def initialize(self,profile,password,state,keys):
        with self.lock,self.connect() as db:
            require(not db.execute('select 1 from state').fetchone(),'An existing collection must never be reset.')
            salt=secrets.token_hex(24);hashed=hashlib.pbkdf2_hmac('sha256',password.encode(),bytes.fromhex(salt),250000).hex()
            for key,value in {'profile':profile,'password':{'salt':salt,'hash':hashed},'answer_keys':keys,'device_id':uid(),'package_id':uid()}.items():db.execute('insert into settings values(?,?)',(key,dump(value)))
            db.execute('insert into state values(1,?)',(dump(state),))
        self.backup()
    def snapshot(self):
        with self.connect() as db:
            row=db.execute('select value from state where id=1').fetchone();require(row,'Prepare the offline collection while online first.',503);return json.loads(row[0])
    def event(self,db,kind,payload,event_id=None):db.execute('insert or ignore into events values(?,?,?,?)',(event_id or uid(),kind,dump(clean(payload)),now()))
    def login(self,email,password):
        profile=self.setting('profile');secret=self.setting('password');require(profile and secret,'Prepare this laptop first.',503)
        require(profile.get('status')!='suspended','This prepared account has been retired. Register your assigned-grade teacher account online.',403)
        value=hashlib.pbkdf2_hmac('sha256',str(password).encode(),bytes.fromhex(secret['salt']),250000).hex()
        require(str(email).strip().lower()==profile['email'].lower() and hmac.compare_digest(value,secret['hash']),'Incorrect offline educator email or password.',401)
        token=secrets.token_urlsafe(40)
        with self.connect() as db:db.execute('insert into sessions values(?,?,?,?,0)',(hashlib.sha256(token.encode()).hexdigest(),'adult',None,time.time()+7*86400))
        return token,profile
    def session(self,token,kind='adult',unlocked=False):
        require((self.setting('profile') or {}).get('status')!='suspended','This prepared account has been retired. Register your assigned-grade teacher account online.',403)
        with self.connect() as db:r=db.execute('select * from sessions where token=? and kind=? and expires>?',(hashlib.sha256((token or '').encode()).hexdigest(),kind,time.time())).fetchone()
        require(r,'Log in to the prepared offline account.',401)
        require(not unlocked or not r['locked'],'Verify the educator password to leave student mode.',403);return dict(r)
    def allowed(self,adult,student=None):
        if adult:
            try:self.session(adult,unlocked=True);return None
            except CollectionError:pass
        r=self.session(student,'child');data=self.snapshot();child=next((c for c in data['children'] if c['id']==r['child'] and c.get('active')),None)
        require(child,'Reopen the student profile.',403);return child['id']
    def backup(self):
        with self.lock:
            dest=self.path.parent/'backups';dest.mkdir(exist_ok=True);tmp=dest/'latest.pending.sqlite3'
            with self.connect() as source,closing(sqlite3.connect(tmp)) as target:source.backup(target)
            os.replace(tmp,dest/'latest.sqlite3')
    def safe_backup(self):
        try:self.backup();self.backup_error=None
        except (OSError,sqlite3.Error) as error:self.backup_error=str(error)
    def rpc(self,name,p,adult=None):
        self.session(adult,unlocked=True);profile=self.setting('profile')
        if name=='claim_initial_administrator' or name=='record_account_event':return None
        if name=='workspace_snapshot':return self.snapshot()
        if name in ['educator_adventure','educator_adventure_progress','save_adventure','approve_adventure_reading','educator_placement','confirm_adventure_placement']:return self.adventure_rpc(name,p,adult=adult)
        with self.lock,self.connect() as db:
            state=json.loads(db.execute('select value from state where id=1').fetchone()[0]);result=None
            if name=='learning_material_editor':
                result=next((m for m in state['materials'] if m['id']==p['p_id']),None)
                require(result and result.get('owner_id')==profile['id'],'Only your own local materials can be edited.',403)
                if result['kind']=='quiz':
                    keys=self.setting('answer_keys').get(result['id'],{})
                    for question in result['body']['questions']:question['correct_option_id']=keys.get(question['id'])
                return result
            elif name in ['save_reading_assessment','save_english_assessment']:
                from reading_assessments import validate_baseline
                from mission_placement import validate_english_assessment
                kind='english_assessment' if name=='save_english_assessment' else 'reading_assessment'
                child=next((child for child in state['children'] if child['id']==p.get('p_child_id') and child.get('adult_id')==profile['id']),None)
                require(child and child['grade_level'] in profile['grade_levels'],'Choose a learner in your assigned classroom.',403)
                try:body=(validate_english_assessment if kind=='english_assessment' else validate_baseline)(p.get('p_data'))
                except (ValueError,TypeError) as error:raise CollectionError(str(error)) from error
                body.update(child_id=child['id'],grade_level=child['grade_level'],is_demo=child.get('is_demo',False))
                old=next((row for row in state['records'] if row.get('owner_id')==profile['id'] and row['kind']==kind and row['data'].get('source_key')==body['source_key']),None)
                if old:
                    require(old['data']==body,'This source row is already recorded. Use a new assessment version to preserve history.',409)
                    return old['id']
                result=uid();at=now();state['records'].append({'id':result,'owner_id':profile['id'],'kind':kind,'title':(('English assessment · ' if kind=='english_assessment' else 'Reading baseline · ')+body['source_title'])[:180],'status':'draft','data':body,'created_at':at,'updated_at':at})
            elif name in ['save_child_profile','save_learning_material','save_workspace_record']:
                data=dict(p['p_data']);collection={'save_child_profile':'children','save_learning_material':'materials','save_workspace_record':'records'}[name];old=next((r for r in state[collection] if r['id']==p.get('p_id')),None)
                require(not p.get('p_id') or old,'The record no longer exists.',404)
                require(not old or old.get('adult_id',old.get('owner_id'))==profile['id'],'You cannot change this shared material.',403)
                result=old['id'] if old else uid();at=now()
                if collection=='children':
                    require(1<=int(data.get('grade_level',0))<=6 and str(data.get('nickname','')).strip(),'Enter a nickname and Grade 1–6.')
                    require(int(data['grade_level']) in profile['grade_levels'],'This account can use only its assigned grade.',403)
                    data.update(adult_id=profile['id'],active=data.get('active',True),is_demo=profile.get('account_kind')=='review')
                elif collection=='materials':
                    require(data.get('kind') in ['lesson','story','game','quiz','dictionary','vocabulary'] and data.get('status') in ['draft','classroom','submitted','archived'],'Choose a valid local material type and visibility.')
                    require(1<=int(data.get('grade_level',0))<=6 and str(data.get('title','')).strip(),'Enter a title and Grade 1–6.')
                    if data['kind']=='quiz':
                        questions=data.get('body',{}).get('questions',[]);require(questions and all(q.get('correct_option_id') in {o['id'] for o in q.get('options',[])} for q in questions),'Each quiz question needs a correct option.')
                        keys=json.loads(db.execute("select value from settings where key='answer_keys'").fetchone()[0]);keys[result]={q['id']:q.pop('correct_option_id') for q in questions};db.execute("update settings set value=? where key='answer_keys'",(dump(keys),))
                    require(int(data['grade_level']) in profile['grade_levels'],'This account can use only its assigned grade.',403)
                    data.update(owner_id=profile['id'],version=(old or {}).get('version',0)+1)
                    if data['kind']=='quiz':data['quiz_number']=(old or {}).get('quiz_number') or 1+max([m.get('quiz_number',0) or 0 for m in state['materials'] if m['kind']=='quiz' and m['grade_level']==data['grade_level']]+[0])
                else:
                    require(data.get('kind') in ['plan','session'],'Only teaching plans and classroom sessions can be collected here.',403)
                    require(str(data.get('title','')).strip(),'Enter a title.')
                    if data['kind']=='session':require(0<=data['data'].get('correct_count',0)<=data['data'].get('total_count',0),'Correct responses cannot exceed total responses.')
                    require(int(data.get('data',{}).get('grade_level',0)) in profile['grade_levels'],'This account can use only its assigned grade.',403)
                    data['owner_id']=profile['id']
                row={**(old or {}),**data,'id':result,'updated_at':at,'created_at':(old or {}).get('created_at',at)}
                if collection=='materials' and row['kind']=='quiz':
                    # Editor receives a private key; student snapshots never do.
                    row['body']['questions']=[{k:v for k,v in q.items() if k!='correct_option_id'} for q in row['body']['questions']]
                state[collection]=[r for r in state[collection] if r['id']!=result]+[row]
            elif name=='set_material_favorite':state['favorites']=list((set(state.get('favorites',[]))|{p['p_id']}) if p['p_saved'] else (set(state.get('favorites',[]))-{p['p_id']}))
            elif name=='open_child_session':
                child=next((c for c in state['children'] if c['id']==p['p_child_id'] and c.get('active')),None);require(child,'Choose an active local student.',404)
                token=secrets.token_urlsafe(40);db.execute('insert into sessions values(?,?,?,?,0)',(hashlib.sha256(token.encode()).hexdigest(),'child',child['id'],time.time()+86400));db.execute('update sessions set locked=1 where token=?',(hashlib.sha256(adult.encode()).hexdigest(),));return {'token':token,'child':child}
            else:raise CollectionError('This online administrator operation is not available in local collection.',403)
            db.execute('update state set value=? where id=1',(dump(state),));self.event(db,name,p)
        self.safe_backup();return result
    def adventure_rpc(self,name,p,adult=None,student=None):
        if adult:self.session(adult,unlocked=True)
        session=self.session(student,'child') if student else None
        profile=self.setting('profile')
        with self.lock,self.connect() as db:
            state=json.loads(db.execute('select value from state where id=1').fetchone()[0]);engine=Adventure(state,profile,require)
            child=next((c for c in state['children'] if session and c['id']==session['child'] and c.get('active')),None)
            if session:require(child,'Reopen this learner.',403)
            if name=='student_adventure_state':
                materials=engine.materials(child['grade_level']);attempts=[a for a in state['attempts'] if a['child_id']==child['id']]
                result={'child':clean(child),'materials':materials,'attempts':attempts,'stars':sum(a.get('stars',0) for a in attempts),'badges':[],'saved_vocabulary':child.get('saved_vocabulary',[]),'adventure':engine.progress(child)}
            elif name=='educator_adventure':result=engine.path(p['p_grade'])
            elif name=='educator_adventure_progress':result=engine.teacher_progress(p['p_grade'])
            elif name=='save_adventure':result=engine.save(p['p_grade'],p['p_revision'],p['p_stages']);self.event(db,name,{'grade':p['p_grade'],'revision':result['revision']})
            elif name in ['educator_placement','confirm_adventure_placement']:
                target=next((c for c in state['children'] if c['id']==p['p_child_id'] and c.get('adult_id')==profile['id'] and c['grade_level'] in profile['grade_levels']),None);require(target,'Choose your assigned learner.',403)
                if name=='confirm_adventure_placement':
                    result=engine.confirm_placement(target,p['p_evidence_id'],p['p_stage_id'],p['p_revision'],p['p_reason']);self.event(db,name,clean(p))
                else:result={'placement':engine.data.get('placements',{}).get(target['id']),'has_started':engine.has_started(target['id']),'adventure':engine.progress(target)}
            elif name=='student_choose_adventure_start':result=engine.choose_start(child,p['p_stage_id'],p['p_revision'])
            elif name=='approve_adventure_reading':
                child=next((c for c in state['children'] if c['id']==p['p_child_id'] and c.get('active')),None)
                require(child and child['grade_level'] in profile['grade_levels'],'Choose your own learner.',403)
                result=engine.approve(child,p['p_step_id'],p['p_reason']);self.event(db,name,clean(p))
            elif name=='adventure_reading_context':result={'text':engine.reading_context(child,p['step_id'],p['page'],p['part'])}
            elif name=='adventure_record_reading':result=engine.record_reading(child,p['step_id'],p['page'],p['part'],p['result'])
            else:raise CollectionError('Adventure operation unavailable.',404)
            db.execute('update state set value=? where id=1',(dump(state),))
        self.safe_backup();return result
    def adventure_complete(self,p):
        session=self.session(p.get('p_token'),'child');profile=self.setting('profile')
        with self.lock:
            state=self.snapshot();child=next((c for c in state['children'] if c['id']==session['child'] and c.get('active')),None);require(child,'Reopen this learner.',403)
            engine=Adventure(state,profile,require)
            old=next((a for a in state['attempts'] if a['submission_id']==p['p_submission_id']),None)
            if old:
                require(old['child_id']==child['id'] and old.get('adventure_step_id')==p['p_step_id'],'This submission belongs to another activity.',409)
                step=next((s for stage in engine.path(child['grade_level'])['stages'] for s in stage['steps'] if s['id']==p['p_step_id']),None);require(step,'Adventure step unavailable.',409)
                result=engine.record_result(child,step,old)
            else:
                step=engine.current(child,p['p_step_id'],p['p_revision']);engine.validate_completion(child,step)
                result=self.student_rpc('student_complete_material',{'p_token':p['p_token'],'p_material_id':step['material_id'],'p_version':step['material_version'],'p_submission_id':p['p_submission_id'],'p_answers':p['p_answers']},_guided=True,_step=step,_revision=p['p_revision'])
                state=self.snapshot();engine=Adventure(state,profile,require);result=engine.record_result(child,step,result)
            with self.connect() as db:db.execute('update state set value=? where id=1',(dump(state),))
        self.safe_backup();return result
    def student_rpc(self,name,p,_guided=False,_step=None,_revision=None):
        if name in ['student_adventure_state','student_choose_adventure_start']:return self.adventure_rpc(name,p,student=p.get('p_token'))
        if name=='student_adventure_complete':return self.adventure_complete(p)
        session=self.session(p.get('p_token'),'child');state=self.snapshot();child=next((c for c in state['children'] if c['id']==session['child'] and c.get('active')),None);require(child,'Reopen this learner.',403)
        if name=='close_child_session':
            with self.connect() as db:db.execute('delete from sessions where token=?',(session['token'],))
            return None
        materials=[m for m in state['materials'] if m['grade_level']==child['grade_level'] and m['status'] in ['published','classroom']]
        if name=='student_learning_state':return {'child':{k:v for k,v in child.items() if k!='adult_id'},'materials':materials,'attempts':[r for r in state['attempts'] if r['child_id']==child['id']],'stars':sum(r.get('stars',0) for r in state['attempts'] if r['child_id']==child['id']),'badges':[],'saved_vocabulary':child.get('saved_vocabulary',[])}
        with self.lock,self.connect() as db:
            state=json.loads(db.execute('select value from state where id=1').fetchone()[0])
            if name=='student_save_vocabulary':
                require(any(m['id']==p['p_material_id'] for m in materials),'Material unavailable.',403)
                for c in state['children']:
                    if c['id']==child['id']:c['saved_vocabulary']=list(set(c.get('saved_vocabulary',[]))|{p['p_material_id']})
                result=None
            elif name=='student_complete_material':
                require(_guided or str(child['grade_level']) not in state.get('adventure',{}).get('paths',{}),'Open this activity through your guided adventure.',403)
                old=next((r for r in state['attempts'] if r['submission_id']==p['p_submission_id']),None)
                if old:
                    require(old['child_id']==child['id'] and old['material_id']==p['p_material_id'] and old['answers']==p['p_answers'],'This submission ID is already used for another response.',409);return old
                m=next((m for m in materials if m['id']==p['p_material_id']),None);require(m and m['version']==p['p_version'],'The material version changed. Reopen it.',409)
                answers=p.get('p_answers',{});require(isinstance(answers,dict),'Invalid answers.')
                if m['kind']=='quiz':
                    key=self.setting('answer_keys').get(m['id'])
                    require(set(answers)=={q['id'] for q in m['body']['questions']} and all(answers[q['id']] in {o['id'] for o in q['options']} for q in m['body']['questions']),'Answer every quiz question.')
                    total=len(m['body']['questions']);correct=sum(answers.get(q)==a for q,a in key.items()) if key else None
                elif m['kind']=='game':
                    pairs=m['body'].get('pairs',[]);require(pairs and all(answers.get(pair['en'])==pair['fil'] for pair in pairs),'Finish each word pair.');total=len(pairs);correct=total
                else:total=correct=1
                stars=0 if correct is None else (3 if correct==total else 2 if correct*2>=total else 1) if m['kind']=='quiz' else 2 if m['kind']=='game' else 1
                if any(r['child_id']==child['id'] and r['material_id']==m['id'] and r['material_version']==m['version'] for r in state['attempts']):stars=0
                result={'id':uid(),'submission_id':p['p_submission_id'],'child_id':child['id'],'material_id':m['id'],'material_version':m['version'],'material_title':m['title'],'grade_level':m['grade_level'],'quiz_number':m.get('quiz_number'),'activity_kind':m['kind'],'correct_count':correct,'total_count':total,'stars':stars,'completed_at':now(),'answers':answers,'storage':'local_collection','assessment_type':'pending_online_scoring' if correct is None else 'quiz_score' if m['kind']=='quiz' else 'activity_completion'}
                if _guided:
                    result['adventure_step_id']=_step['id'];result['adventure_revision']=_revision
                    result['stage_id']=next(s['id'] for s in Adventure(state,self.setting('profile'),require).path(child['grade_level'])['stages'] if any(item['id']==_step['id'] for item in s['steps']))
                result['material_snapshot']={k:v for k,v in m.items() if k!='owner_id'}
                result['question_responses']=[{'question_id':q['id'],'prompt':q['prompt'],'selected_option_id':answers[q['id']],'selected_option_text':next(o['text'] for o in q['options'] if o['id']==answers[q['id']]),'correct':answers[q['id']]==key[q['id']] if key else None} for q in m['body']['questions']] if m['kind']=='quiz' else []
                state['attempts'].append(result)
            else:raise CollectionError('This activity needs an online service.',503)
            db.execute('update state set value=? where id=1',(dump(state),));self.event(db,name,{**p,'child_id':child['id']},p.get('p_submission_id'))
        self.safe_backup();return result
    def capture(self,kind,data,adult=None,student=None,audio=None):
        child=self.allowed(adult,student);data=clean(data)
        if child:require(not data.get('child_id') or data['child_id']==child,'Wrong learner.',403);data['child_id']=child
        if data.get('child_id'):require(any(c['id']==data['child_id'] for c in self.snapshot()['children']),'The recording or draft references an unknown local learner.',400)
        key=str(data.get('id',''));require(0<len(key)<=100 and all(c.isalnum() or c in '-_:' for c in key),'Invalid collection identifier.')
        revision=int(data.get('revision',0));require(revision>=0,'Invalid revision.')
        if audio is not None:
            try:
                with wave.open(io.BytesIO(audio)) as w:
                    require(w.getnchannels()==1 and w.getsampwidth()==2 and w.getframerate()==16000,'Use 16 kHz mono PCM WAV audio.')
                    frames=w.getnframes();require(0<frames<=16000*45 and len(w.readframes(frames))==frames*2,'Record up to 45 seconds of complete audio.');data['duration_seconds']=frames/16000
            except (wave.Error,EOFError):raise CollectionError('Invalid WAV recording.')
            require(len(audio)<=1_500_000,'Audio is too large.');digest=hashlib.sha256(audio).hexdigest()
        at=now()
        with self.lock,self.connect() as db:
            if audio is None:
                db.execute('insert into drafts values(?,?,?,?) on conflict(id) do update set revision=excluded.revision,payload=excluded.payload,at=excluded.at where excluded.revision>=drafts.revision',(key,revision,dump(data),at))
            else:db.execute('insert into recordings values(?,?,?,?,?,?) on conflict(id) do update set revision=excluded.revision,metadata=excluded.metadata,audio=excluded.audio,sha256=excluded.sha256,at=excluded.at where excluded.revision>=recordings.revision',(key,revision,dump(data),audio,digest,at))
        if audio is not None and data.get('complete'):self.safe_backup()
        return {'id':key,'saved_at':at,'storage':'sqlite','revision':revision}
    def stats(self):
        state=self.snapshot()
        with self.connect() as db:
            return {'students':len(state['children']),'attempts':len(state['attempts']),'drafts':db.execute('select count(*) from drafts').fetchone()[0],'recordings':db.execute('select count(*) from recordings').fetchone()[0],'notes':db.execute('select count(*) from notes').fetchone()[0],'saved_on_disk':str(self.path),'backup':str(self.path.parent/'backups/latest.sqlite3'),'recent_recordings':[dict(r) for r in db.execute('select id,metadata,sha256,at from recordings order by at desc limit 20')],'draft_records':[json.loads(r[0]) for r in db.execute('select payload from drafts order by at desc limit 30')]}
    def export(self):
        self.backup();buf=io.BytesIO();manifest={};state=self.snapshot()
        with self.lock,self.connect() as db,zipfile.ZipFile(buf,'w',zipfile.ZIP_DEFLATED) as archive:
            def add(name,content):
                raw=content.encode('utf-8') if isinstance(content,str) else content;archive.writestr(name,raw);manifest[name]={'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}
            recordings=[dict(r) for r in db.execute('select * from recordings')]
            collected={'format':'linguakids-field-collection-v2','account_id':self.setting('profile')['id'],'package_id':self.setting('package_id') or self.setting('device_id'),'exported_at':now(),'device_id':self.setting('device_id'),'students':state['children'],'attempts':state['attempts'],'materials_created':[m for m in state['materials'] if m.get('owner_id')==self.setting('profile')['id']],'classroom_records':state['records'],'adventure':state.get('adventure',{}),'drafts':[json.loads(r[0]) for r in db.execute('select payload from drafts')],'notes':[json.loads(r[0]) for r in db.execute('select payload from notes')],'events':[dict(r) for r in db.execute('select * from events')],'recordings':[{**json.loads(r['metadata']),'sha256':r['sha256'],'saved_at':r['at'],'file':'audio/'+r['id']+'.wav'} for r in recordings]}
            add('collection.json',json.dumps(collected,ensure_ascii=False,indent=2))
            def sheet(name,rows,fields):
                out=io.StringIO(newline='');writer=csv.writer(out);writer.writerow(fields)
                for row in rows:
                    vals=[]
                    for key in fields:
                        value=row.get(key,'');value=dump(value) if isinstance(value,(dict,list)) else str(value if value is not None else '')
                        vals.append("'"+value if value.lstrip().startswith(('=','+','-','@')) else value)
                    writer.writerow(vals)
                add(name,'\ufeff'+out.getvalue())
            sheet('students.csv',collected['students'],['id','nickname','grade_level','gender','learning_level','created_at'])
            sheet('activity-results.csv',collected['attempts'],['id','child_id','material_title','grade_level','activity_kind','correct_count','total_count','assessment_type','answers','question_responses','completed_at'])
            sheet('recordings.csv',collected['recordings'],['id','child_id','expected_text','language','duration_seconds','complete','file','sha256','saved_at'])
            sheet('notes.csv',collected['notes'],['id','child_id','recording_id','text','human_transcript','created_at'])
            for r in recordings:add('audio/'+r['id']+'.wav',r['audio'])
            add('README.txt','Local collection data. This archive is not automatically uploaded to Railway. Raw answers and audio are retained; recognition is not a pronunciation diagnosis. Store this archive privately. collection.json preserves original text; CSV files escape spreadsheet formulas.\n')
            archive.writestr('manifest.json',json.dumps(manifest,indent=2))
        raw=buf.getvalue();dest=self.path.parent/'exports';dest.mkdir(exist_ok=True);path=dest/('collection-'+datetime.now().strftime('%Y%m%d-%H%M%S')+'-'+secrets.token_hex(3)+'.zip')
        with path.open('xb') as f:f.write(raw);f.flush();os.fsync(f.fileno())
        return raw,path.name

def handler_for(store,web,ai=None):
    web=Path(web).resolve()
    class Handler(SimpleHTTPRequestHandler):
        def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(web),**kwargs)
        def log_message(self,*args):pass
        def tokens(self):
            c=http.cookies.SimpleCookie();c.load(self.headers.get('Cookie',''));return c['lk_collection'].value if 'lk_collection' in c else None
        def guard(self):
            expected={'localhost:'+str(self.server.server_port),'127.0.0.1:'+str(self.server.server_port)}
            require(self.client_address[0]=='127.0.0.1' and self.headers.get('Host') in expected,'Collection is available only on this laptop.',403)
            origin=self.headers.get('Origin');require(not origin or urlparse(origin).netloc in expected,'Invalid request origin.',403)
        def send(self,value,status=200,content_type='application/json',headers=None):
            raw=dump(value).encode() if content_type=='application/json' else value
            self.send_response(status);self.send_header('Content-Type',content_type);self.send_header('Content-Length',str(len(raw)));self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff')
            for k,v in (headers or {}).items():self.send_header(k,v)
            self.end_headers();self.wfile.write(raw)
        def body(self):
            length=int(self.headers.get('Content-Length','0'));require(0<=length<=2_000_000,'Request too large.',413);return self.rfile.read(length)
        def do_GET(self):
            try:
                self.guard();path=urlparse(self.path).path;adult=self.tokens()
                if path=='/config.json':return self.send({'LOCAL_COLLECTION':True,'capture_audio':True,'COLLECTION_ACCOUNT_ID':store.setting('profile')['id']})
                if path=='/health':return self.send({'app':'linguakids-offline-collection','status':'ok','storage':'sqlite','cloud_required':False,'database':str(store.path.resolve())})
                if path=='/collection/session':
                    try:store.session(adult);return self.send({'session':{'user':{'id':store.setting('profile')['id']}},'recovery':False})
                    except CollectionError:return self.send({'session':None,'recovery':False})
                if path=='/collection/profile':store.session(adult);return self.send(store.setting('profile'))
                if path=='/collection/preferences':
                    store.session(adult);return self.send(store.setting('preferences') or {'locale':'en','text_scale':1,'muted':False,'reduced_motion':False})
                if path=='/v1/dictionary':
                    store.session(adult,unlocked=True)
                    term=unicodedata.normalize('NFC',parse_qs(urlparse(self.path).query).get('q',[''])[0]).strip()
                    require(0<len(term)<=80 and re.fullmatch(r"[\w\s'’\-]+",term),'Enter a word or short phrase.',422)
                    library=json.loads((web/'offline-library.json').read_text(encoding='utf-8'))
                    grade=max(store.setting('profile')['grade_levels']);words=[w for w in library.get('dictionary',[]) if w.get('grade',1)<=grade]
                    entries=[]
                    for word in words:
                        if word['en'].casefold()==term.casefold():entries.append({'language':'en','part_of_speech':'Saved translation','definitions':['Filipino: '+word['fil']]})
                        elif word['fil'].casefold()==term.casefold():entries.append({'language':'fil','part_of_speech':'Saved translation','definitions':['English: '+word['en']]})
                    suggestions=difflib.get_close_matches(term,[w[k] for w in words for k in ['en','fil']],n=5,cutoff=.6) if not entries else []
                    return self.send({'word':term,'entries':entries,'suggestions':suggestions,'offline':True,'source':'saved bilingual word list'})
                if path=='/collection/stats':store.session(adult,unlocked=True);return self.send(store.stats())
                if path=='/v1/offline/recordings':
                    store.session(adult,unlocked=True);query=parse_qs(urlparse(self.path).query);child_id=query.get('child_id',[''])[0];offset=int(query.get('offset',['0'])[0])
                    child=next((c for c in store.snapshot()['children'] if c['id']==child_id and c.get('adult_id')==store.setting('profile')['id'] and c['grade_level'] in store.setting('profile')['grade_levels']),None)
                    require(child,'Choose a learner in your assigned classroom.',403);require(0<=offset,'Invalid page.')
                    with store.connect() as db:rows=[dict(r) for r in db.execute('select id,metadata,sha256,at from recordings order by at desc')]
                    items=[{**json.loads(r['metadata']),'id':r['id'],'sha256':r['sha256'],'saved_at':r['at'],'playable':True,'archive_id':'local'} for r in rows if json.loads(r['metadata']).get('child_id')==child_id]
                    return self.send({'items':items[offset:offset+30],'next_offset':offset+30 if len(items)>offset+30 else None})
                if path=='/collection/export':
                    store.session(adult,unlocked=True);raw,name=store.export();return self.send(raw,content_type='application/zip',headers={'Content-Disposition':'attachment; filename="'+name+'"'})
                if path.startswith('/collection/audio/'):
                    store.session(adult,unlocked=True);key=path.rsplit('/',1)[1]
                    with store.connect() as db:row=db.execute('select audio from recordings where id=?',(key,)).fetchone()
                    require(row,'Recording not found.',404);return self.send(row[0],content_type='audio/wav')
                require(not path.startswith('/collection/'),'Not found.',404)
                resolved=(web/unquote(path).lstrip('/')).resolve();require(resolved.is_relative_to(web),'Invalid path.',403)
                return super().do_GET()
            except CollectionError as e:self.send({'detail':str(e)},e.status)
            except (ValueError,KeyError,TypeError):self.send({'detail':'Invalid request.'},400)
            except Exception:self.send({'detail':'Local storage could not be read. Keep this laptop and its data folder; try again.'},500)
        def do_POST(self):
            try:
                self.guard();path=urlparse(self.path).path;adult=self.tokens();raw=self.body()
                if path.startswith('/collection/recordings/'):
                    data=json.loads(base64.b64decode(self.headers.get('X-LinguaKids-Meta','')).decode());data['id']=path.rsplit('/',1)[1]
                    return self.send(store.capture('recording',data,adult,self.headers.get('X-Student-Token'),raw))
                if path.startswith('/v1/'):
                    child=self.headers.get('X-Student-Token');store.allowed(adult,child)
                    require(ai,'Audio/data are saved locally. The local AI service is not configured; no result was invented.',503)
                    if path in ['/v1/ai/jobs','/v1/ai/history']:return self.send([])
                    target='/v1/ai/reading' if path=='/v1/ai/student-reading' else path
                    require(target in ['/v1/ai/reading','/v1/ai/speak','/v1/translation'],'This online operation is unavailable in collection mode.',503)
                    if target=='/v1/ai/speak':require(ai.get('speech_ready'),'Recording is available. This laptop has no offline natural-voice model configured.',503)
                    if target=='/v1/translation':
                        obj=json.loads(raw);obj.update(model_version=ai.get('model_version','local-offline'));raw=dump(obj).encode();target='/translate'
                    reading_context=None
                    if path=='/v1/ai/student-reading':
                        message=BytesParser(policy=email_policy).parsebytes(('Content-Type: '+self.headers.get('Content-Type','')+'\r\nMIME-Version: 1.0\r\n\r\n').encode()+raw)
                        fields={part.get_param('name',header='content-disposition'):part.get_payload(decode=True).decode('utf-8') for part in message.iter_parts() if not part.get_filename()}
                        if fields.get('adventure_step_id'):
                            reading_context={'step_id':fields['adventure_step_id'],'page':int(fields.get('page_index',0)),'part':int(fields.get('part_index',0))}
                            canonical=store.adventure_rpc('adventure_reading_context',reading_context,student=child)
                            require(fields.get('language')=='en' and fields.get('expected_text','').strip()==canonical['text'],'Read the English story part shown in your current adventure.',409)
                    headers={'Content-Type':self.headers.get('Content-Type','application/json'),'X-Inference-Key':ai['secret']}
                    try:
                        req=urllib.request.Request('http://127.0.0.1:8003'+target,data=raw,headers=headers)
                        with urllib.request.urlopen(req,timeout=65) as response:
                            result=response.read();kind=response.headers.get_content_type()
                        if kind=='application/json':
                            value=json.loads(result)
                            if reading_context:value['adventure_evidence']=store.adventure_rpc('adventure_record_reading',{**reading_context,'result':value},student=child)
                            original=clean(json.loads(raw)) if self.headers.get('Content-Type','').startswith('application/json') else None
                            with store.connect() as db:store.event(db,'ai_result',{'operation':path,'input':original,'result':value,'recording_id':self.headers.get('X-Recording-Id'),'child_id':store.allowed(adult,child)})
                            return self.send(value)
                        return self.send(result,content_type=kind)
                    except urllib.error.HTTPError as e:raise CollectionError('Recording/input remains saved locally. The local AI model could not process this request.',503) from e
                    except (urllib.error.URLError,TimeoutError):raise CollectionError('Recording/input remains saved locally. Start the local AI service or check it later.',503)
                data=json.loads(raw or b'{}')
                if path=='/collection/login':
                    token,profile=store.login(data.get('email',''),data.get('password',''));return self.send({'profile':profile,'session':{'user':{'id':profile['id']}}},headers={'Set-Cookie':'lk_collection='+token+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800'})
                if path=='/collection/logout':
                    with store.connect() as db:db.execute('delete from sessions where token=?',(hashlib.sha256((adult or '').encode()).hexdigest(),))
                    return self.send({},headers={'Set-Cookie':'lk_collection=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'})
                if path=='/collection/rpc':return self.send(store.rpc(data['name'],data.get('parameters',{}),adult))
                if path=='/collection/student-rpc':return self.send(store.student_rpc(data['name'],data.get('parameters',{})))
                if path=='/collection/drafts':return self.send(store.capture('draft',data,adult,self.headers.get('X-Student-Token')))
                if path=='/collection/preferences':
                    store.session(adult,unlocked=True)
                    with store.connect() as db:db.execute('insert into settings values(?,?) on conflict(key) do update set value=excluded.value',('preferences',dump(data)))
                    return self.send({})
                if path=='/collection/notes':
                    store.session(adult,unlocked=True);require(str(data.get('text','')).strip(),'Enter the collected answer or observation.');data={**clean(data),'id':data.get('id') or uid(),'created_at':now()}
                    with store.connect() as db:db.execute('insert into notes values(?,?,?)',(data['id'],dump(data),now()))
                    store.backup();return self.send(data)
                raise CollectionError('Unavailable in offline collection.',404)
            except CollectionError as e:self.send({'detail':str(e)},e.status)
            except (ValueError,KeyError,TypeError):self.send({'detail':'Invalid collection request. Nothing was confirmed as saved.'},400)
            except Exception:self.send({'detail':'Could not save to the local disk. Keep this page open and retry; pending input stays in the local outbox.'},507)
    return Handler

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--data',type=Path,required=True);parser.add_argument('--web',type=Path,required=True);parser.add_argument('--port',type=int,default=8787);parser.add_argument('--ai-config',type=Path);parser.add_argument('--export',action='store_true');args=parser.parse_args()
    store=Store(args.data/'collection.sqlite3');require(store.setting('profile'),'Prepare the collection first.',503)
    if args.export:
        _,name=store.export();print('Backup saved: '+str(args.data/'exports'/name));return
    ai=json.loads(args.ai_config.read_text()) if args.ai_config and args.ai_config.exists() else None
    server=ThreadingHTTPServer(('127.0.0.1',args.port),handler_for(store,args.web,ai));print('Offline collection ready at http://localhost:'+str(args.port),flush=True)
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close();store.backup()
if __name__=='__main__':main()
