import {mergeRecordedAttempts,quizPercent,quizVersionKey} from './teacher-progress';

// These groups describe workflow, not reading ability or a child's grade.
export const missionGroups=[
 {key:'not-started',label:'Ready to start',color:'#6366f1',states:['not-started']},
 {key:'in-progress',label:'In progress',color:'#0891b2',states:['in-progress']},
 {key:'needs-attention',label:'Needs attention',color:'#d97706',states:['reading-review','quiz-retry','pending-scoring','placement-review']},
 {key:'completed',label:'Completed',color:'#059669',states:['completed']},
 {key:'not-ready',label:'Unavailable / not prepared',color:'#94a3b8',states:['unavailable','unprepared']},
];
export function missionDistribution(rows){
 return missionGroups.map(group=>({...group,count:rows.filter(row=>group.states.includes(row.summary.state)).length}));
}
export function latestQuizAnalytics(attempts,childIds){
 const latest=new Map();
 for(const attempt of mergeRecordedAttempts(attempts)){
  const percent=quizPercent(attempt);
  if(!childIds.has(attempt.child_id)||attempt.activity_kind!=='quiz'||percent===null||!Number.isFinite(percent)||percent<0||percent>100)continue;
  const key=`${attempt.child_id}:${quizVersionKey(attempt)}`,previous=latest.get(key);
  const time=value=>Date.parse(value.completed_at)||0;
  if(!previous||time(attempt)>time(previous)||time(attempt)===time(previous)&&String(attempt.id||attempt.submission_id||'')>String(previous.id||previous.submission_id||''))latest.set(key,attempt);
 }
 const values=[...latest.values()].map(quizPercent);
 return {count:values.length,students:new Set([...latest.values()].map(a=>a.child_id)).size,
  average:values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null,
  bands:[{label:'80–100%',color:'#059669',count:values.filter(v=>v>=80).length},
   {label:'50–79%',color:'#6366f1',count:values.filter(v=>v>=50&&v<80).length},
   {label:'Below 50%',color:'#d97706',count:values.filter(v=>v<50).length}]};
}
export function matchesMissionFilter(state,filter){
 if(!filter)return true;
 return missionGroups.find(group=>group.key===filter)?.states.includes(state)??state===filter;
}
