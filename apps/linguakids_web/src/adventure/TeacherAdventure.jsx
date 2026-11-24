import {useEffect,useRef,useState} from 'react';
import {uiText,useUiLanguage} from '../i18n';
import {useSearchParams} from 'react-router-dom';
import {useApp} from '../context';
import {assignedGrades} from '../grade-scope';
import {supportsWordGarden} from '../word-garden';
import {Button,Field,Loading,Modal,Notice,Select,useAction} from '../ui';
import {useTeacherProgress} from './TeacherProgressContext';
import {ProgressLoadNotice} from './TeacherStudentProgress';
import {TeacherMissionMonitor} from './TeacherMissionMonitor';
import {refreshSequenceMaterials,sequenceNeedsLibraryUpdate} from './teacher-sequence';
import './teacher-adventure.css';
import {addMission,difficultyBands,normalizeMissionBands} from './mission-difficulty';

export function TeacherAdventure(){
  useUiLanguage();
  const {repository,user,data}=useApp(),action=useAction();
  const progress=useTeacherProgress(),[params,setParams]=useSearchParams();
  const grades=assignedGrades(user);
  const [grade,setGrade]=useState(grades.includes(Number(params.get('grade')))?Number(params.get('grade')):data.children.find(child=>child.id===params.get('student'))?.grade_level||grades[0]||1),[path,setPath]=useState(null),[loading,setLoading]=useState(false),[review,setReview]=useState(null),[saved,setSaved]=useState(''),[loadError,setLoadError]=useState('');
  const request=useRef(0);
  const [newDifficulty,setNewDifficulty]=useState('beginner');
  const view=['levels','progress','review'].includes(params.get('view'))?params.get('view'):'progress';
  const learners=progress.byGrade[grade]||[];
  async function load(){
    const current=++request.current;
    setLoading(true);setLoadError('');setSaved('');
    try{const definition=await repository.rpc('educator_adventure',{p_grade:Number(grade)});if(current===request.current)setPath(normalizeMissionBands(definition));}
    catch(error){if(current===request.current)setLoadError(error.message||'Could not load this grade’s mission sequence. Try again.');}
    finally{if(current===request.current)setLoading(false);}
  }
  useEffect(()=>{setPath(null);void load();return()=>{request.current++;};},[grade,repository]);
  function changeStage(index,field,value){setPath(p=>({...p,stages:p.stages.map((s,i)=>i===index?{...s,[field]:value}:s)}));}
  function move(from,index,to,offset){
    setPath(previous=>{
      const stages=structuredClone(previous.stages),[step]=stages[from].steps.splice(index,1);
      if(from===to)stages[to].steps.splice(Math.max(0,Math.min(stages[to].steps.length,index+offset)),0,step);
      else stages[to].steps.push(step);
      return {...previous,stages};
    });
  }
  const used=new Set(path?.stages.flatMap(s=>s.steps.map(step=>step.material_id))||[]);
  const missing=(data?.materials||[]).filter(m=>m.grade_level===Number(grade)&&['published','classroom'].includes(m.status)&&!used.has(m.id));
  const focusedMaterial=data.materials.find(material=>material.id===params.get('material')&&material.grade_level===Number(grade));
  const focusedStage=path?.stages.find(stage=>stage.steps.some(step=>step.material_id===focusedMaterial?.id));
  const reviews=learners.filter(learner=>!params.get('student')||learner.child_id===params.get('student')).flatMap(learner=>learner.adventure.stages.flatMap(stage=>stage.steps.filter(step=>step.status==='needs_review').map(step=>({learner,stage,step}))));
  return <div className="teacher-adventure">
    <div className="page-intro"><div><h2>{uiText('Missions')}</h2><p>{uiText('Manage the sequence for each grade, monitor progress, and review English reading checks.')}</p></div></div>
    <Select label="Adventure grade" value={grade} disabled={action.busy} onChange={event=>{setPath(null);setReview(null);setGrade(Number(event.target.value));const next=new URLSearchParams(params);next.delete('student');setParams(next,{replace:true});}} values={grades.map(g=>[g,`Grade ${g}`])}/>
    <div className="actions">{[['progress','Student progress'],['review',`Reading reviews (${reviews.length})`],['levels','Arrange mission sequence']].map(([key,title])=><Button key={key} variant={view===key?'primary':'secondary'} onClick={()=>{const next=new URLSearchParams(params);next.set('view',key);setParams(next,{replace:true});}}>{title}</Button>)}</div>
    <ProgressLoadNotice/>
    {loadError&&<Notice error>{loadError}</Notice>}
    {action.error&&<Notice error>{action.error}</Notice>}{saved&&<Notice>{saved}</Notice>}{loading&&<Loading/>}
    {!path&&!loading&&<Button variant="secondary" onClick={load}>Reload adventure</Button>}
    {path&&view==='levels'&&<fieldset disabled={action.busy} className="adventure-sequence-fields">
      <div className="actions"><Select label="Difficulty for new mission" value={newDifficulty} onChange={e=>setNewDifficulty(e.target.value)} values={difficultyBands}/><Button variant="secondary" disabled={path.stages.length>=30} onClick={()=>setPath(previous=>addMission(previous,newDifficulty))}>{uiText('Add mission')}</Button></div>
      <Notice>{uiText('Missions are grouped Beginner, Intermediate, then Advanced. Each mission needs its own lesson, game, English story and quiz. Add reviewed materials before saving an additional mission.')}</Notice>
      {focusedMaterial&&<Notice><strong>{focusedMaterial.title}</strong><br/>{focusedStage?`This material is in ${focusedStage.title}. Open that level below to change its position.`:'This material has not been included yet. Add it below, then review and save the sequence.'}</Notice>}
      {sequenceNeedsLibraryUpdate(path,data.materials,grade)&&<Notice><strong>The material library has changed.</strong><p>Prepare an updated sequence to use current versions and remove archived activities. New tasks are placed in Level 1 for you to arrange. Previously recorded results stay in the student record.</p><Button variant="secondary" onClick={()=>setPath(previous=>refreshSequenceMaterials(previous,data.materials,grade))}>Prepare library updates</Button></Notice>}
      <Notice>Editing preserves recorded quiz attempts. Completed credit is retained for unchanged material versions and game modes. Updated materials require a new check. Every level needs a lesson, game, story and quiz.</Notice>
      {!path.stages.length&&<Notice error>Add available lessons, games, English stories and quizzes for this grade before preparing its adventure.</Notice>}
      {missing.length>0&&<section className="panel"><h3>New grade materials to include</h3>{missing.map(material=><div className="adventure-edit-step" key={material.id}><span>{material.kind} · {material.title}</span><Button variant="secondary" onClick={()=>setPath(p=>({...p,stages:p.stages.map((s,i)=>i? s:{...s,steps:[...s.steps,...(material.kind==='game'?(supportsWordGarden(material.body?.pairs)?['matching','word-builder']:['matching']):['read']).map(mode=>({id:`${material.id}:${material.version}:${mode}`,material_id:material.id,material_version:material.version,title:material.title,kind:material.kind,...(material.kind==='game'?{mode}:{})}))]})}))} disabled={!path.stages.length}>Add to Level 1</Button></div>)}</section>}
      {path.stages.map((stage,i)=><details className="panel adventure-edit-level" key={stage.id}><summary><strong>Level {i+1}: {stage.title}</strong> · {uiText(stage.difficulty)} · {stage.steps.length} tasks</summary><Field label={`Level ${i+1} title`} value={stage.title} maxLength={70} onChange={event=>changeStage(i,'title',event.target.value)}/><Field label={`Level ${i+1} subtitle`} value={stage.subtitle||''} maxLength={70} onChange={event=>changeStage(i,'subtitle',event.target.value)}/><Select label={`Difficulty for mission ${i+1}`} value={stage.difficulty} onChange={event=>{const difficulty=event.target.value;setPath(previous=>({...previous,stages:previous.stages.map(item=>item.id===stage.id?{...item,difficulty}:item).sort((a,b)=>difficultyBands.indexOf(a.difficulty)-difficultyBands.indexOf(b.difficulty))}));}} values={difficultyBands}/>{!stage.steps.length&&<Button variant="ghost" onClick={()=>setPath(previous=>({...previous,stages:previous.stages.filter(item=>item.id!==stage.id)}))}>{uiText('Remove empty draft mission')}</Button>}<ol>{stage.steps.map((step,j)=><li key={step.id} className="adventure-edit-step"><span><small>{j+1}. {step.kind}{step.mode?` · ${step.mode}`:''}</small><strong>{step.title}</strong></span><div className="actions"><Button variant="ghost" disabled={j===0} aria-label={`Move ${step.title} earlier`} onClick={()=>move(i,j,i,-1)}>↑</Button><Button variant="ghost" disabled={j===stage.steps.length-1} aria-label={`Move ${step.title} later`} onClick={()=>move(i,j,i,1)}>↓</Button><Select label={`Level for ${step.title}${step.mode?` ${step.mode}`:''}`} value={i} onChange={e=>move(i,j,Number(e.target.value),0)} values={path.stages.map((s,index)=>[index,`Level ${index+1}`])}/></div></li>)}</ol></details>)}
      <div className="actions"><Button disabled={action.busy||!path.stages.length} onClick={()=>action.run(async()=>{const result=await repository.rpc('save_adventure',{p_grade:Number(grade),p_revision:path.revision,p_stages:path.stages});setPath(result);setSaved('Adventure sequence saved. Students will be asked to reopen an outdated activity.');})}>Save level sequence</Button><Button variant="secondary" disabled={action.busy} onClick={load}>Discard unsaved edits / Reload</Button></div>
    </fieldset>}
    {view==='progress'&&<TeacherMissionMonitor grade={grade}/>}
    {view==='review'&&<section className="panel"><h3>Teacher reading review</h3><p>The AI checks recognized words, not validated pronunciation quality. Listen to the child read, then approve only if your own review confirms the passage. Approval does not create a quiz score.</p>{!reviews.length&&<p>{progress.errors[grade]?'Reading checks could not be loaded. Refresh to try again.':progress.loading?'Checking reading reviews…':'No uncertain reading checks awaiting review.'}</p>}{params.get('student')&&<Button variant="secondary" onClick={()=>{const next=new URLSearchParams(params);next.delete('student');setParams(next,{replace:true});}}>Show all reading reviews</Button>}{reviews.map(item=><article className="adventure-reading-review" key={item.learner.child_id+item.step.id}><div><strong>{item.learner.nickname}</strong><p>{item.stage.title} · {item.step.title}</p><small>{item.step.reading_checked}/{item.step.reading_total} English reading parts confirmed by AI.</small></div><Button variant="secondary" onClick={()=>setReview(item)}>Review observed reading</Button></article>)}<Button variant="secondary" onClick={progress.refresh} disabled={progress.loading}>Refresh reading checks</Button></section>}
    {review&&<Modal title={`Review ${review.learner.nickname}'s reading`} onClose={()=>setReview(null)}><form className="form-stack" onSubmit={event=>{event.preventDefault();const reason=new FormData(event.currentTarget).get('reason');action.run(async()=>{await repository.rpc('approve_adventure_reading',{p_child_id:review.learner.child_id,p_step_id:review.step.id,p_reason:reason});setReview(null);await progress.refresh();setSaved('Teacher reading approval saved. The learner can reopen the story and finish this step.');});}}><p>{review.step.title}</p><p>Observe the learner reading the full English story before approving. AI uncertainty alone is not a failed pronunciation grade.</p><Field label="Teacher observation and reason" name="reason" required minLength={10} maxLength={1000}/><label className="checkbox"><input type="checkbox" required/>I observed the child read this story and approve their reading.</label>{action.error&&<Notice error>{action.error}</Notice>}<Button type="submit" disabled={action.busy}>Approve observed reading</Button></form></Modal>}
  </div>;
}

