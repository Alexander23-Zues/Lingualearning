"""Guided learning rules for the prepared, loopback-only SQLite collection app.

Cloud scoring is authoritative. A cloud quiz without a local marking key stays
pending; this engine never turns an unverified answer into a passing score.
"""
from copy import deepcopy
import re
from mission_placement import mission_difficulty,DIFFICULTIES

TITLES = ['Arko ng Simula','Gubat ng Salita','Lawa ng Pagsubok','Bundok ng Karunungan','Karagatan ng Kuwento']
SUBTITLES = ['Unang tuklas','Mga bagong salita','Subok at pagsasanay','Tuloy sa pagkatuto','Kuwento ng tagumpay']
ORDER = {'lesson':0,'dictionary':1,'vocabulary':1,'game':2,'story':3,'quiz':4}

def reading_parts(text):
    result=[];words=[];length=0
    for word in str(text or '').split():
        if words and (len(words)>=8 or length+1+len(word)>72):
            result.append(' '.join(words));words=[];length=0
        length+=(1 if words else 0)+len(word);words.append(word)
    if words:result.append(' '.join(words))
    return result

class Adventure:
    def __init__(self,state,profile,require):
        self.state=state;self.profile=profile;self.require=require
        self.data=state.setdefault('adventure',{'paths':{},'progress':{},'checks':{}})

    def materials(self,grade):
        return [m for m in self.state['materials'] if int(m['grade_level'])==int(grade) and (m['status']=='published' or m['status']=='classroom' and m.get('owner_id')==self.profile['id'])]

    def normalize(self,m,mode=None):
        mode=(mode or 'matching') if m['kind']=='game' else 'read'
        return {'id':f"{m['id']}:{m['version']}:{mode}",'material_id':m['id'],'material_version':m['version'],'title':m['title'],'kind':m['kind'],**({'mode':mode} if m['kind']=='game' else {})}

    def has_started(self,child_id):
        return bool(self.data.get('started',{}).get(child_id)) or any(a['child_id']==child_id and a.get('adventure_step_id') for a in self.state['attempts'])

    def path(self,grade):
        self.require(int(grade) in self.profile['grade_levels'],'This account can use only its assigned grade.',403)
        key=str(grade)
        if key not in self.data['paths']:
            grouped={kind:[] for kind in ORDER}
            for m in sorted(self.materials(grade),key=lambda m:(m.get('quiz_number') or 999999,m['title'],m['id'])):grouped[m['kind']].append(m)
            count=min([5]+[len(grouped[k]) for k in ['lesson','game','story','quiz']])
            stages=[{'id':f'stage-{i+1}','title':TITLES[i],'subtitle':SUBTITLES[i],'steps':[]} for i in range(count)]
            if count:
                for kind in sorted(ORDER,key=ORDER.get):
                    for index,m in enumerate(grouped[kind]):
                        pairs=m.get('body',{}).get('pairs',[])
                        builder=kind=='game' and bool(pairs) and all(2<=sum(c.isalpha() for c in p['en'])<=16 for p in pairs)
                        for mode in ['word-builder','matching'] if builder else [None]:stages[index%count]['steps'].append(self.normalize(m,mode))
            self.data['paths'][key]={'revision':1,'stages':stages,'quiz_pass_percent':80}
        return self.data['paths'][key]

    def progress(self,child):
        path=self.path(child['grade_level']);stages=deepcopy(path['stages']);first=None;blocked=False
        placement=self.data.get('placements',{}).get(child['id'])
        started=self.has_started(child['id'])
        stage_ids=[s['id'] for s in stages];chosen=0;maximum=None;stale=False
        if placement:
            stale=placement['path_revision']!=path['revision'] or placement['selected_stage_id'] not in stage_ids or placement['approved_stage_id'] not in stage_ids
            if stale:blocked=True
            else:chosen=stage_ids.index(placement['selected_stage_id']);maximum=stage_ids.index(placement['approved_stage_id'])
        records=self.data['progress'].setdefault(child['id'],{})
        checks=self.data['checks'].get(child['id'],{})
        for index,stage in enumerate(stages):
            stage['difficulty']=stage.get('difficulty',mission_difficulty(index,len(stages)))
            if placement and not stale and index<chosen:
                stage.update(status='not-assigned',completed=0,total=0)
                for step in stage['steps']:step.update(status='not-assigned',score=None)
                continue
            was_blocked=blocked;done=0
            for step in stage['steps']:
                record=records.get(step['id'],{})
                # Recovery after an interrupted disk write uses only an attempt tagged by the server.
                attempts=[a for a in self.state['attempts'] if a['child_id']==child['id'] and a.get('adventure_step_id')==step['id']]
                last=attempts[-1] if attempts else None
                passed=record.get('passed',False) or any(a.get('correct_count') is not None and (step['kind']!='quiz' or a['correct_count']*100>=a['total_count']*80) for a in attempts)
                parts=checks.get(step['id'],{})
                material=next((m for m in self.materials(child['grade_level']) if m['id']==step['material_id']),{})
                pages=material.get('body',{}).get('pages') or [material.get('body',{})]
                total=sum(len(reading_parts(p.get('english'))) for p in pages) if step['kind']=='story' else 0
                confirmed=sum(bool(c.get('passed')) for c in parts.values())
                status=record.get('status','current')
                if status=='needs_review' and (record.get('teacher_approved') or confirmed==total and total):status='current'
                if last and last.get('assessment_type')=='pending_online_scoring':status='pending_online_scoring'
                step.update(status='completed' if passed else 'locked' if blocked else status,
                            score={'correct':last['correct_count'],'total':last['total_count']} if last and last.get('correct_count') is not None else None,
                            reading_checked=confirmed,reading_total=total,teacher_approved=bool(record.get('teacher_approved')))
                if passed:done+=1
                elif not blocked:first=step['id'];blocked=True
            stage.update(completed=done,total=len(stage['steps']),status='completed' if done and done==len(stage['steps']) else 'locked' if was_blocked else 'active')
        return {'revision':path['revision'],'stages':stages,'current_step_id':first,'quiz_pass_percent':80,'placement':{'approved_stage_id':placement['approved_stage_id'],'selected_stage_id':placement['selected_stage_id'],'can_choose_start':not started and not stale,'requires_review':stale,'maximum_start_index':maximum} if placement else None}

    def confirm_placement(self,child,evidence_id,stage_id,revision,reason):
        self.require(child.get('active'),'Choose an active learner in your classroom.',403)
        path=self.path(child['grade_level']);self.require(path['revision']==revision,'The mission sequence changed. Reload before confirming.',409)
        self.require(stage_id in [s['id'] for s in path['stages']],'Choose a mission in this learner’s grade.')
        evidence=next((r for r in self.state['records'] if r['id']==evidence_id and r['kind']=='english_assessment' and r['owner_id']==self.profile['id'] and r['data']['child_id']==child['id'] and r['data']['language']=='en'),None)
        self.require(evidence,'Record the separate English assessment first.',403)
        self.require(isinstance(reason,str) and 10<=len(reason.strip())<=1000,'Explain the teacher-confirmed starting point.')
        placements=self.data.setdefault('placements',{});old=placements.get(child['id']);started=self.has_started(child['id'])
        self.require(not started or old and old['approved_stage_id']==stage_id,'This learner already started. Starting placement cannot move past unfinished work.',409)
        placements[child['id']]={'child_id':child['id'],'evidence_id':evidence_id,'approved_by':self.profile['id'],'approved_stage_id':stage_id,'selected_stage_id':old['selected_stage_id'] if started else stage_id,'path_revision':revision,'reason':reason.strip()}
        return self.progress(child)

    def choose_start(self,child,stage_id,revision):
        path=self.path(child['grade_level']);placement=self.data.get('placements',{}).get(child['id']);ids=[s['id'] for s in path['stages']]
        self.require(placement and placement['path_revision']==path['revision']==revision,'Ask your teacher to confirm your starting mission.',409)
        self.require(not self.has_started(child['id']),'Your adventure has started. Finish the current mission first.',403)
        self.require(stage_id in ids and placement['approved_stage_id'] in ids and ids.index(stage_id)<=ids.index(placement['approved_stage_id']),'Choose your assigned mission or an earlier one.',403)
        placement['selected_stage_id']=stage_id;return self.progress(child)

    def current(self,child,step_id,revision=None):
        state=self.progress(child)
        self.require(revision is None or int(revision)==state['revision'],'Your teacher updated the adventure. Reopen the map.',409)
        self.require(state['current_step_id']==step_id,'Finish the current adventure activity first.',403)
        return next(s for stage in state['stages'] for s in stage['steps'] if s['id']==step_id)

    def validate_completion(self,child,step):
        self.require(step['status']!='pending_online_scoring','Answers are saved. Transfer online for verified scoring before continuing.',409)
        if step['kind']=='story' and not step.get('teacher_approved'):
            self.require(step['reading_total']>0 and step['reading_checked']==step['reading_total'],'Read and check every English story part first, or ask your teacher for review.',409)

    def record_result(self,child,step,result):
        passed=result.get('correct_count') is not None and (step['kind']!='quiz' or result['correct_count']*100>=result['total_count']*80)
        row=self.data['progress'].setdefault(child['id'],{}).setdefault(step['id'],{})
        row.update(passed=row.get('passed',False) or passed,status='completed' if passed else 'pending_online_scoring' if result.get('correct_count') is None else 'current',last_attempt_id=result['id'])
        return {**result,'adventure_passed':passed,'adventure':self.progress(child)}

    def reading_context(self,child,step_id,page,part):
        step=self.current(child,step_id)
        self.require(step['kind']=='story' and page>=0 and part>=0,'Choose the current story reading part.',403)
        material=next((m for m in self.materials(child['grade_level']) if m['id']==step['material_id'] and m['version']==step['material_version']),None)
        self.require(material,'This story version changed. Ask your teacher to update the adventure.',409)
        pages=material['body'].get('pages') or [material['body']]
        parts=reading_parts(pages[page].get('english')) if page<len(pages) else []
        self.require(part<len(parts),'This story part is unavailable.',409)
        return parts[part]

    def record_reading(self,child,step_id,page,part,result):
        self.reading_context(child,step_id,page,part)
        if result.get('speech_detected') is False or result.get('recognition_status')=='no_speech':return {'recorded':False,'reason':'no_speech'}
        expected=int(result.get('expected_word_count') or 0);matched=len(result.get('matched_words',[]))
        self.require(expected>0,'The reading service did not return usable word counts.',503)
        passed=result.get('recognition_status')=='recognized' and matched==expected and len(result.get('extra_words',[]))<=max(1,expected//4)
        checks=self.data['checks'].setdefault(child['id'],{}).setdefault(step_id,{})
        key=f'{page}:{part}';old=checks.get(key,{})
        checks[key]={'passed':old.get('passed',False) or passed,'matched_count':max(matched,old.get('matched_count',0)),'expected_count':expected,'recognition_status':result.get('recognition_status')}
        record=self.data['progress'].setdefault(child['id'],{}).setdefault(step_id,{})
        if not passed:record['status']='needs_review'
        return {'recorded':True,'part_passed':passed,'adventure':self.progress(child)}

    def teacher_progress(self,grade):
        self.path(grade)
        return [{'child_id':c['id'],'nickname':c['nickname'],'adventure':self.progress(c),'quiz_attempts':[a for a in self.state['attempts'] if a['child_id']==c['id'] and a.get('adventure_step_id') and a['activity_kind']=='quiz']} for c in self.state['children'] if c['active'] and c['grade_level']==int(grade)]

    def approve(self,child,step_id,reason):
        step=self.current(child,step_id)
        self.require(step['kind']=='story' and 10<=len(reason.strip())<=1000,'Explain your observed reading review.',400)
        self.require(self.data['checks'].get(child['id'],{}).get(step_id),'A voiced AI reading attempt is required before teacher review.',409)
        self.data['progress'].setdefault(child['id'],{}).setdefault(step_id,{}).update(teacher_approved=True,teacher_note=reason.strip(),status='current')
        return self.progress(child)

    def save(self,grade,revision,stages):
        old=self.path(grade)
        self.require(old['revision']==revision,'Another edit changed the adventure. Reload before saving.',409)
        self.require(isinstance(stages,list) and 1<=len(stages)<=30,'Use one to thirty complete learning missions.',400)
        available={m['id']:m for m in self.materials(grade)};seen=set();represented=set();normalized=[];stage_ids=set();previous_rank=0
        for i,stage in enumerate(stages):
            stage_id=stage.get('id',f'stage-{i+1}');band=stage.get('difficulty',mission_difficulty(i,len(stages)))
            self.require(isinstance(stage_id,str) and re.fullmatch(r'[a-zA-Z0-9_-]{1,80}',stage_id) and stage_id not in stage_ids and band in DIFFICULTIES and DIFFICULTIES.index(band)>=previous_rank,'Use unique mission IDs ordered Beginner, Intermediate, Advanced.')
            previous_rank=DIFFICULTIES.index(band);stage_ids.add(stage_id)
            self.require(3<=len(stage.get('title','').strip())<=70 and 4<=len(stage.get('steps',[]))<=200,'Each level needs a title and activities.',400)
            steps=[]
            for step in stage['steps']:
                material=available.get(step['material_id']);self.require(material,'Use available assigned-grade materials only.',403)
                mode=step.get('mode','matching') if material['kind']=='game' else None
                self.require(mode in [None,'matching','word-builder'],'Choose a supported game mode.',400)
                if mode=='word-builder':self.require(all(2<=sum(c.isalpha() for c in pair['en'])<=16 for pair in material.get('body',{}).get('pairs',[])),'Word Garden needs words of 2–16 letters.',400)
                value=self.normalize(material,mode);self.require(value['id'] not in seen,'Each activity/mode belongs to one level only.',400)
                seen.add(value['id']);represented.add(material['id']);steps.append(value)
            self.require({'lesson','game','story','quiz'}.issubset(s['kind'] for s in steps),'Every level needs a lesson, game, story and quiz.',400)
            normalized.append({'id':stage_id,'difficulty':band,'title':stage['title'].strip(),'subtitle':str(stage.get('subtitle',''))[:70],'steps':steps})
        self.require(set(available).issubset(represented),'Include every available grade material in the adventure.',400)
        for child_id,placement in self.data.get('placements',{}).items():
            child=next((c for c in self.state['children'] if c['id']==child_id),None)
            if child and child['grade_level']==grade and self.has_started(child_id):
                self.require(placement['approved_stage_id'] in stage_ids and placement['selected_stage_id'] in stage_ids,'Keep the starting mission IDs of learners who already began.',409)
        result={'revision':revision+1,'stages':normalized,'quiz_pass_percent':80};self.data['paths'][str(grade)]=result
        return result
