import {useEffect,useRef,useState} from 'react';
import {useApp} from '../context';
import {Button,Field,Notice,Select,useAction} from '../ui';
import {uiText,useUiLanguage} from '../i18n';
import {normalizeMissionBands,readingProfiles} from './mission-difficulty';
import {useTeacherProgress} from './TeacherProgressContext';

export function TeacherPlacement({child}){
 useUiLanguage();const {repository,data,refresh}=useApp(),action=useAction(),progress=useTeacherProgress();
 const rows=data.records.filter(row=>row.kind==='english_assessment'&&row.data.child_id===child.id).sort((a,b)=>String(b.data.assessment_date||'').localeCompare(String(a.data.assessment_date||''))||String(b.created_at||'').localeCompare(String(a.created_at||'')));
 const [state,setState]=useState(null),[path,setPath]=useState(null),[loadError,setLoadError]=useState(''),[loading,setLoading]=useState(true),[adding,setAdding]=useState(false),[notice,setNotice]=useState('');
 const [evidenceId,setEvidenceId]=useState(''),[stageId,setStageId]=useState('');const request=useRef(0),sourceKey=useRef('english:'+crypto.randomUUID());
 async function load(){const current=++request.current;setLoading(true);setLoadError('');try{const [definition,status]=await Promise.all([repository.rpc('educator_adventure',{p_grade:child.grade_level}),repository.rpc('educator_placement',{p_child_id:child.id})]);if(current===request.current){setPath(normalizeMissionBands(definition));setState(status);}}catch(error){if(current===request.current)setLoadError(error.message);}finally{if(current===request.current)setLoading(false);}}
 useEffect(()=>{setPath(null);setState(null);void load();return()=>{request.current++;};},[child.id,repository]);
 const evidence=rows.find(row=>row.id===evidenceId);
 useEffect(()=>{setEvidenceId(previous=>rows.some(row=>row.id===previous)?previous:rows[0]?.id||'');},[child.id,rows.map(row=>row.id).join(',')]);
 useEffect(()=>{if(path)setStageId(state?.placement?.approved_stage_id||path.stages.find(stage=>stage.difficulty===evidence?.data.recommended_difficulty)?.id||path.stages[0]?.id||'');},[path,state,evidenceId]);
 const placement=state?.placement,stale=state?.adventure?.placement?.requires_review;
 return <section className="teacher-placement" aria-label={uiText('English placement')}>
 <h3>{uiText('English assessment & starting mission')}</h3><p>{uiText('Record the separate English assessment, review the suggestion, then confirm the learner’s starting mission. This does not award quiz scores or mark earlier work completed.')}</p>
 {loadError&&<Notice error>{loadError}<Button variant="secondary" onClick={load}>{uiText('Try again')}</Button></Notice>}
 {notice&&<Notice>{notice}</Notice>}{action.error&&<Notice error>{action.error}</Notice>}
 {placement&&<Notice><strong>{uiText(stale?'Placement needs reconfirmation':'Teacher-confirmed starting point')}</strong><p>{path?.stages.find(stage=>stage.id===placement.approved_stage_id)?.title||placement.approved_stage_id}</p><p>{placement.reason}</p>{state.has_started&&<p>{uiText('The learner has started. Their starting point cannot be moved past unfinished work.')}</p>}</Notice>}
 {!rows.length&&<Notice>{uiText('Awaiting the separate English assessment. Mother Tongue results do not set English placement.')}</Notice>}
 <Button variant="secondary" disabled={action.busy} onClick={()=>setAdding(!adding)}>{uiText(adding?'Cancel assessment entry':'Record English assessment')}</Button>
 {adding&&<form className="form-stack panel" onSubmit={event=>{event.preventDefault();const form=event.currentTarget,f=new FormData(form);action.run(async()=>{const id=await repository.rpc('save_english_assessment',{p_child_id:child.id,p_data:{source_key:sourceKey.current,source_title:String(f.get('source')).trim(),assessment_date:f.get('date'),reading_profile:f.get('profile'),language:'en',notes:String(f.get('notes')||'').trim()}});await refresh();setEvidenceId(id);sourceKey.current='english:'+crypto.randomUUID();setAdding(false);setNotice(uiText('English evidence saved. A teacher must still confirm the starting mission.'));await load();});}}>
 <Field label="English assessment source" name="source" required minLength={3} maxLength={180} placeholder={uiText('Name of the actual school assessment')}/><Field label="Assessment date" name="date" type="date" required/>
 <Select label="Source reading category" name="profile" required defaultValue="" values={[["","Choose the category recorded by the teacher"],...readingProfiles]}/>
 <Field label="Assessment notes"><textarea name="notes" rows={3} maxLength={1000}/></Field><label className="checkbox"><input type="checkbox" required/>{uiText('I am recording an actual English assessment, not the Mother Tongue sheet.')}</label><Button type="submit" disabled={action.busy}>{uiText('Save English assessment')}</Button></form>}
 {rows.length>0&&<form className="form-stack panel" onSubmit={event=>{event.preventDefault();const f=new FormData(event.currentTarget);action.run(async()=>{await repository.rpc('confirm_adventure_placement',{p_child_id:child.id,p_evidence_id:evidenceId,p_stage_id:stageId,p_revision:path.revision,p_reason:String(f.get('reason')).trim()});await Promise.all([load(),progress.refresh()]);setNotice(uiText('Teacher placement confirmed. The learner may start there or choose an earlier mission before beginning.'));});}}>
 <Select label="English assessment evidence" value={evidenceId} onChange={e=>setEvidenceId(e.target.value)} values={rows.map(row=>[row.id,`${row.data.assessment_date} · ${row.data.source_title} · ${row.data.reading_profile}`])}/>
 <Notice>{uiText('System suggestion')}: <strong>{uiText(evidence?.data.recommended_difficulty||'Teacher review required')}</strong><p>{uiText('The source category suggests a difficulty group. The teacher decides the appropriate mission after reviewing the English evidence.')}</p></Notice>
 {state?.has_started&&!placement&&<Notice>{uiText('This learner has already started without a placement decision. Record the assessment for history; their existing mission progress is preserved.')}</Notice>}
 {path&&<Select label="Teacher-approved starting mission" value={stageId} disabled={loading||action.busy||state?.has_started} onChange={e=>setStageId(e.target.value)} values={path.stages.map((stage,index)=>[stage.id,`${index+1}. ${uiText(stage.difficulty)} · ${stage.title}`])}/>}
 <Field label="Teacher placement reason"><textarea name="reason" required minLength={10} maxLength={1000} rows={3}/></Field><label className="checkbox"><input type="checkbox" required/>{uiText('I reviewed the English assessment and confirm this starting mission.')}</label><Button type="submit" disabled={loading||action.busy||!!loadError||!path?.stages.length||!stageId||state?.has_started&&!placement}>{uiText(stale?'Reconfirm starting mission':'Confirm starting mission')}</Button></form>}
 </section>;
}
