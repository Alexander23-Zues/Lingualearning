import {useCallback,useEffect,useRef,useState} from 'react';
import {useNavigate,useSearchParams} from 'react-router-dom';
import {useApp} from '../context';
import {AdventureMap} from './AdventureMap';
import {Button,Loading,Notice,Modal} from '../ui';
import {MissionCelebration} from './StudentRewards';
import {errorText} from '../domain';
import {stopSpeech} from '../speech';

export function StudentAdventure({Reader}){
  const {repository,child,locked,childSession}=useApp();
  const navigate=useNavigate();
  const [params,setParams]=useSearchParams();
  const [state,setState]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(false);
  const [selected,setSelected]=useState(null),[round,setRound]=useState(0);
  const [earned,setEarned]=useState([]),seenAwards=useRef(null),scope=useRef(child?.token),request=useRef(0);
  scope.current=child?.token;
  const [online,setOnline]=useState(navigator.onLine!==false);
  useEffect(()=>{
    const update=()=>setOnline(navigator.onLine!==false);
    window.addEventListener('online',update);window.addEventListener('offline',update);
    return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update);};
  },[]);
  useEffect(()=>{
    const old={muted:document.documentElement.dataset.muted,motion:document.documentElement.dataset.reducedMotion};
    document.documentElement.dataset.muted=String(child?.child.preferences?.sound===false);
    document.documentElement.dataset.reducedMotion=String(child?.child.preferences?.reduced_motion===true);
    return()=>{document.documentElement.dataset.muted=old.muted||'false';document.documentElement.dataset.reducedMotion=old.motion||'false';stopSpeech();};
  },[child?.token]);
  const load=useCallback(async()=>{
    if(!child?.token)return;
    const current=++request.current,token=child.token;
    setLoading(true);setError('');
    try{
      const result=await repository.studentRpc('student_adventure_state',{},child.token);
      if(current!==request.current||scope.current!==token)return;
      if(!result?.adventure)throw new Error('The adventure is not prepared yet. Ask your teacher to reopen your learning profile.');
      const badges=result.rewards?.mission_badges||[],ids=new Set(badges.map(b=>`${b.grade_level}:${b.id}`));
      if(seenAwards.current){const added=badges.filter(b=>!seenAwards.current.has(`${b.grade_level}:${b.id}`));if(added.length)setEarned(added);}
      seenAwards.current=ids;setState(result);return result;
    }catch(e){if(current===request.current&&scope.current===token)setError(errorText(e));}
    finally{if(current===request.current&&scope.current===token)setLoading(false);}
  },[repository,child?.token]);
  useEffect(()=>{
    setState(null);setSelected(null);setEarned([]);seenAwards.current=null;
    if(!child||!locked){navigate('/adult-unlock',{replace:true});return;}
    void load();
    return()=>{request.current++;};
  },[child?.token,locked,load,navigate]);
  function clearLink(){
    if(child?.initial_activity_id){const {initial_activity_id,...session}=child;childSession(session);}
    if(params.has('activity')||params.has('quiz')){const next=new URLSearchParams(params);next.delete('activity');next.delete('quiz');setParams(next,{replace:true});}
  }
  useEffect(()=>{
    const id=params.get('activity')||params.get('quiz')||child?.initial_activity_id;
    if(!state||!id)return;
    const step=state.adventure.stages.flatMap(s=>s.steps).find(s=>s.id===state.adventure.current_step_id);
    if(step?.material_id===id)start(step);
    else setError('This activity comes later. Finish your current adventure step first.');
    clearLink();
  },[state?.child?.id,params,child?.initial_activity_id]);
  function start(step){
    if(step.id!==state.adventure.current_step_id){setError('Finish the current adventure step first.');return;}
    if(step.status==='pending_online_scoring'){setError('Your answers are saved. Wait for the verified online score before continuing.');return;}
    const material=state.materials.find(m=>m.id===step.material_id&&m.version===step.material_version);
    if(!material){setError('This material changed. Ask your teacher to update the learning adventure.');return;}
    setError('');setSelected({step,material,revision:state.adventure.revision});setRound(0);
  }
  async function finish(answers,submissionId){
    const token=child.token;
    if(!repository.collection&&navigator.onLine===false)throw new Error('Connect to save this adventure step. Your next level opens after the saved result is verified.');
    const value=await repository.studentRpc('student_adventure_complete',{
      p_step_id:selected.step.id,p_revision:selected.revision,p_submission_id:submissionId,p_answers:answers,
    },child.token);
    if(scope.current!==token)return value;
    setState(current=>({...current,adventure:value.adventure||current.adventure}));
    await load();
    return value;
  }
  const backToTeacher=()=>{stopSpeech();navigate('/adult-unlock');};
  if(!child||!state)return <main className="startup-error"><Loading text="Opening your adventure…"/>{error&&<><Notice error>{error}</Notice><Button onClick={load} disabled={loading}>Try again</Button></>}<Button variant="secondary" onClick={backToTeacher}>← Back to teacher</Button></main>;
  const pending=state.adventure.stages.some(s=>s.steps.some(step=>step.status==='pending_online_scoring'));
  const connection=pending?'awaiting-scoring':repository.collection?'offline-collection':online?'online':'offline';
  return <>
    <AdventureMap student={child.child} adventure={state.adventure} stars={state.stars||0} rewards={state.rewards} connection={connection}
      reducedMotion={child.child.preferences?.reduced_motion===true} onStart={start} onTeacher={backToTeacher} onChooseStart={async stageId=>{setLoading(true);try{const adventure=await repository.studentRpc('student_choose_adventure_start',{p_stage_id:stageId,p_revision:state.adventure.revision},child.token);setState(current=>({...current,adventure}));await load();}finally{setLoading(false);}}} onRefresh={load} busy={loading} error={error}/>
    {earned.length>0&&!selected&&<Modal title="Bagong mission badge!" onClose={()=>setEarned([])}><MissionCelebration badges={earned}/><Button onClick={()=>setEarned([])}>Magpatuloy sa mapa</Button></Modal>}
    {selected&&<Reader key={`${selected.step.id}:${round}`} material={selected.material} student guidedStep={selected.step}
      initialLanguage="en" initialGameMode={selected.step.mode||'matching'} onComplete={finish}
      onReadingUpdate={result=>{const adventure=result.adventure_evidence?.adventure;if(adventure)setState(current=>({...current,adventure}));}}
      onRetry={()=>setRound(value=>value+1)} onClose={()=>{setSelected(null);clearLink();void load();}}/>}
  </>;
}
