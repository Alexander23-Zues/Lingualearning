// Explicitly labeled browser demonstration only. Cloud/SQLite enforce their own rules.
import {missionDifficulty} from './mission-difficulty';
export function previewMissionTools(data,persist){
 const memory=data.preview_missions||=( {paths:{},placements:{},reviews:{}} );
 const started=id=>data.attempts.some(a=>a.child_id===id&&a.adventure_step_id);
 const materials=grade=>data.materials.filter(m=>m.grade_level===grade&&['published','classroom'].includes(m.status));
 function path(grade){
  if(!memory.paths[grade]){
   const order=['lesson','dictionary','vocabulary','game','story','quiz'];
   const steps=materials(grade).sort((a,b)=>order.indexOf(a.kind)-order.indexOf(b.kind)).flatMap(m=>(m.kind==='game'?['word-builder','matching']:['read']).map(mode=>({id:`${m.id}:${m.version}:${mode}`,material_id:m.id,material_version:m.version,title:m.title,kind:m.kind,...(m.kind==='game'?{mode}:{})})));
   memory.paths[grade]={revision:1,quiz_pass_percent:80,stages:steps.length?[{id:'preview-start',title:'Arko ng Simula',subtitle:'Demonstration mission',difficulty:'beginner',steps}]:[]};
  }return structuredClone(memory.paths[grade]);
 }
 function state(child){
  const result=path(child.grade_level),placement=memory.placements[child.id];let blocked=false,current=null;
  const stale=placement&&placement.path_revision!==result.revision,max=placement?result.stages.findIndex(s=>s.id===placement.approved_stage_id):-1,start=placement?result.stages.findIndex(s=>s.id===placement.selected_stage_id):0;
  if(stale)blocked=true;
  result.stages.forEach((stage,index)=>{
   const skip=placement&&!stale&&index<start,wasBlocked=blocked;let done=0;
   stage.difficulty||=missionDifficulty(index,result.stages.length);
   stage.steps.forEach(step=>{
    const attempts=data.attempts.filter(a=>a.child_id===child.id&&a.adventure_step_id===step.id),last=attempts.at(-1),passed=attempts.some(a=>a.correct_count!=null&&(step.kind!=='quiz'||a.correct_count*100>=a.total_count*80));
    step.status=skip?'not-assigned':passed?'completed':blocked?'locked':'current';step.score=last?{correct:last.correct_count,total:last.total_count}:null;
    step.teacher_approved=Boolean(memory.reviews[child.id+':'+step.id]);step.reading_total=step.kind==='story'?1:0;step.reading_checked=0;
    if(!skip&&passed)done++;else if(!skip&&!blocked){current=step.id;blocked=true;}
   });
   stage.completed=done;stage.total=skip?0:stage.steps.length;stage.status=skip?'not-assigned':done===stage.steps.length&&done>0?'completed':wasBlocked?'locked':'active';
  });
  return {...result,current_step_id:current,placement:placement?{...placement,can_choose_start:!started(child.id)&&!stale,requires_review:Boolean(stale),maximum_start_index:max}:null};
 }
 return {path,state,started,materials,
  choose(child,p){const placement=memory.placements[child.id],definition=path(child.grade_level),ids=definition.stages.map(s=>s.id);if(!placement||started(child.id)||p.p_revision!==definition.revision||placement.path_revision!==definition.revision||!ids.includes(p.p_stage_id)||ids.indexOf(p.p_stage_id)>ids.indexOf(placement.approved_stage_id))throw new Error('Choose your teacher-approved starting mission or an earlier one before beginning.');placement.selected_stage_id=p.p_stage_id;persist();return state(child);},
  save(p){const old=path(p.p_grade);if(old.revision!==p.p_revision)throw new Error('Reload the changed mission sequence.');const steps=p.p_stages.flatMap(s=>s.steps),ids=new Set(steps.map(s=>s.id));if(!p.p_stages.length||p.p_stages.length>30||ids.size!==steps.length||p.p_stages.some(s=>!['lesson','game','story','quiz'].every(kind=>s.steps.some(step=>step.kind===kind))))throw new Error('Every mission needs distinct lesson, game, story and quiz activities.');memory.paths[p.p_grade]={...old,revision:old.revision+1,stages:structuredClone(p.p_stages)};persist();return path(p.p_grade);}
 };
}
