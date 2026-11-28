import {grades} from './domain';
export function assignedGrades(user) {
  if(user?.role !== 'educator' || user.grade_levels === undefined)return grades;
  return grades.filter(g => user.grade_levels.includes(g));
}
export function scopeWorkspace(snapshot,user) {
  if(user?.role==='administrator' && snapshot.children?.some(c=>c.is_demo)){
    const children=snapshot.children.filter(c=>!c.is_demo),ids=new Set(children.map(c=>c.id));
    return {...snapshot,children,attempts:(snapshot.attempts||[]).filter(a=>ids.has(a.child_id)),demo_students_hidden:snapshot.children.length-children.length};
  }
  if(user?.role!=='educator')return snapshot;
  const allowed=assignedGrades(user), permits=g=>allowed.includes(Number(g));
  const children=(snapshot.children||[]).filter(c=>permits(c.grade_level));
  const ids=new Set(children.map(c=>c.id));
  const relevant=(snapshot.attempts||[]).filter(a=>ids.has(a.child_id)&&permits(a.grade_level));
  return {...snapshot,children,
    materials:(snapshot.materials||[]).filter(m=>permits(m.grade_level)),
    records:(snapshot.records||[]).filter(r=>r.data?.grade_level==null || permits(r.data.grade_level)),
    pending_attempts:relevant.filter(a=>a.assessment_type==='pending_online_scoring'),
    attempts:relevant.filter(a=>a.assessment_type!=='pending_online_scoring')};
}
