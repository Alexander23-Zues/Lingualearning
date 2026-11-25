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
 function rewards(child,includeBoard=false){
  const awards=(memory.awards||={})[child.id]||=( {} );let changed=false;
  for(const stage of state(child).stages){const key=`${child.grade_level}:${stage.id}`;if(stage.status==='completed'&&!awards[key]){awards[key]={id:stage.id,title:stage.title,difficulty:stage.difficulty,grade_level:child.grade_level,awarded_at:new Date().toISOString(),verification:'preview'};changed=true;}}
  if(changed)persist();
  const board=data.children.filter(c=>c.active&&c.grade_level===child.grade_level&&c.adult_id===child.adult_id&&Boolean(c.is_demo)===Boolean(child.is_demo)).sort((a,b)=>a.id.localeCompare(b.id)).map((c,index)=>{const current=state(c),assigned=current.stages.filter(s=>s.status!=='not-assigned').length,completed=current.stages.filter(s=>s.status==='completed').length;return {child_id:c.id,alias:`Explorer SAMPLE-${index+1}`,completed_missions:completed,assigned_missions:assigned,completion_percent:assigned?Math.round(10000*completed/assigned)/100:0,placement_review_required:Boolean(current.placement?.requires_review)};});
  const greater=(a,b)=>a.completed_missions>b.completed_missions||a.completed_missions===b.completed_missions&&a.completion_percent>b.completion_percent;
  const eligible=board.filter(row=>row.completed_missions>0&&!row.placement_review_required);
  board.forEach(row=>{row.rank=eligible.includes(row)?1+eligible.filter(other=>greater(other,row)).length:null;row.tied=row.rank!==null&&eligible.filter(other=>!greater(row,other)&&!greater(other,row)).length>1;});
  board.sort((a,b)=>(a.rank??Infinity)-(b.rank??Infinity)||a.alias.localeCompare(b.alias));
  const own=board.find(row=>row.child_id===child.id),badges=Object.values(awards).filter(b=>b.grade_level===child.grade_level),{child_id,...clean}=own;
  return {...clean,grade_level:child.grade_level,source:'preview',class_size:board.length,earned_count:badges.length,mission_badges:badges,is_demo:Boolean(child.is_demo),ranking_basis:'completed_missions_then_assigned_percent',milestones:[1,3,5,10].map(target=>({id:`missions-${target}`,target,earned:badges.length>=target,progress:Math.min(target,badges.length)})),...(includeBoard?{leaderboard:board.map(({child_id,...row})=>({...row,is_you:child_id===child.id}))}:{})};
 }
 return {path,state,started,materials,rewards,
  choose(child,p){const placement=memory.placements[child.id],definition=path(child.grade_level),ids=definition.stages.map(s=>s.id);if(!placement||started(child.id)||p.p_revision!==definition.revision||placement.path_revision!==definition.revision||!ids.includes(p.p_stage_id)||ids.indexOf(p.p_stage_id)>ids.indexOf(placement.approved_stage_id))throw new Error('Choose your teacher-approved starting mission or an earlier one before beginning.');placement.selected_stage_id=p.p_stage_id;persist();return state(child);},
  save(p){const old=path(p.p_grade);if(old.revision!==p.p_revision)throw new Error('Reload the changed mission sequence.');const steps=p.p_stages.flatMap(s=>s.steps),ids=new Set(steps.map(s=>s.id));if(!p.p_stages.length||p.p_stages.length>30||ids.size!==steps.length||p.p_stages.some(s=>!['lesson','game','story','quiz'].every(kind=>s.steps.some(step=>step.kind===kind))))throw new Error('Every mission needs distinct lesson, game, story and quiz activities.');memory.paths[p.p_grade]={...old,revision:old.revision+1,stages:structuredClone(p.p_stages)};persist();return path(p.p_grade);}
 };
}
