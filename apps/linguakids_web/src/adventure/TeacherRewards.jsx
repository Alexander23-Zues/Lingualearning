import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {useApp} from '../context';
import {Button,Empty,Field,Notice,Search,Select} from '../ui';
import {csvText,download} from '../domain';
import {uiText,useUiLanguage} from '../i18n';
import {useTeacherProgress} from './TeacherProgressContext';
import './mission-rewards.css';

export function TeacherRewardSummary({rewards}){
 useUiLanguage();
 if(!rewards)return <Notice>{uiText('Refresh mission progress to load achievements.')}</Notice>;
 return <section className="teacher-rewards teacher-reward-summary" aria-label={uiText('Student achievements')}>
  <h3>{uiText('Achievements & mission badges')}</h3>
  <p>{uiText('{0} mission badges earned',[rewards.earned_count])} · {uiText('Current assigned missions')}: {rewards.completed_missions}/{rewards.assigned_missions} ({rewards.completion_percent}%) · {uiText('Class rank')}: {rewards.rank==null?uiText('Not ranked yet'):`#${rewards.rank}${rewards.tied?' =':''}`}</p>
  {rewards.source==='local_pending_verification'&&<Notice>{uiText('Local collection only. Badges and rankings require independent cloud verification after transfer.')}</Notice>}
  <p>{uiText('Badges retain completed mission history. Rankings reflect the current assigned sequence and are not quiz grades.')}</p>
  {rewards.mission_badges.length?<ul>{rewards.mission_badges.map(badge=><li key={`${badge.grade_level}:${badge.id}`}><strong>{badge.title}</strong><small>{uiText(badge.difficulty)} · {new Date(badge.awarded_at).toLocaleDateString()} · {uiText(badge.verification==='local_pending_verification'?'Verification pending':'Verified mission completion')}</small></li>)}</ul>:<p>{uiText('No completed mission badges yet.')}</p>}
 </section>;
}

export function TeacherClassRewards({grade}){
 useUiLanguage();const {repository,user}=useApp(),progress=useTeacherProgress();
 const [query,setQuery]=useState(''),[page,setPage]=useState(1),[size,setSize]=useState(10);
 const demo=user?.account_kind==='review';
 const all=(progress.byGrade[grade]||[]).filter(row=>row.rewards&&Boolean(row.rewards.is_demo)===demo).sort((a,b)=>(a.rewards.rank??Infinity)-(b.rewards.rank??Infinity)||a.rewards.alias.localeCompare(b.rewards.alias));
 const needle=query.trim().toLocaleLowerCase(),rows=all.filter(row=>`${row.nickname} ${row.rewards.alias}`.toLocaleLowerCase().includes(needle));
 const pages=Math.max(1,Math.ceil(rows.length/size)),current=Math.min(page,pages);
 useEffect(()=>setPage(1),[query,size,grade]);
 const exportRows=[['Student ID','Student','Alias','Grade','Rank','Tied','Completed missions','Assigned missions','Assigned completion %','Earned mission badges','Verification'],...rows.map(row=>{const r=row.rewards;return [row.child_id,row.nickname,r.alias,grade,r.rank??'',r.tied?'Yes':'No',r.completed_missions,r.assigned_missions,r.completion_percent,r.earned_count,r.source];})];
 return <section className="panel teacher-rewards" aria-label={uiText('Class achievements and rankings')}>
  <h3>{uiText('Achievements & class rankings')} · {uiText('Grade ')}{grade}</h3>
  <p>{uiText('Completed missions rank first; assigned completion percentage breaks ties. Equal results share a rank. This does not change quiz grades.')}</p>
  {demo&&<Notice>{uiText('Demonstration class only. Real classroom learners are ranked separately.')}</Notice>}
  {repository.collection&&<Notice>{uiText('Local collection only. Badges and rankings require independent cloud verification after transfer.')}</Notice>}
  <div className="teacher-reward-metrics">{[[uiText('Learners with completed missions'),all.filter(row=>row.rewards.completed_missions>0).length],[uiText('Current mission completions'),all.reduce((n,row)=>n+row.rewards.completed_missions,0)],[uiText('Mission badges earned'),all.reduce((n,row)=>n+row.rewards.earned_count,0)]].map(([label,value])=><div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>
  <div className="teacher-reward-controls"><Search label="Search ranking" placeholder={uiText('Search student or alias')} value={query} onChange={setQuery}/><Select label="Learners per page" value={size} onChange={event=>setSize(Number(event.target.value))} values={[10,25,50].map(value=>[value,value])}/><Button variant="secondary" disabled={progress.loading||!rows.length} onClick={()=>download(`Grade-${grade}-mission-achievements.csv`,csvText(exportRows),'text/csv;charset=utf-8')}>{uiText('Export achievements CSV')}</Button><Button variant="secondary" disabled={progress.loading} onClick={progress.refresh}>{uiText('Refresh achievements')}</Button></div>
  {progress.errors[grade]?<Notice error>{progress.errors[grade]}</Notice>:!all.length?<Empty title={uiText(progress.loading?'Loading achievements…':'No mission achievement records yet')}>{uiText('Refresh mission progress after learners complete their assigned activities.')}</Empty>:<>
   <div className="table-wrap"><table><caption>{uiText('Rankings use aliases for students and teachers. Open the student record to identify the learner.')}</caption><thead><tr>{['Rank','Alias','Completed missions','Assigned completion','Badges','Record'].map(label=><th key={label}>{uiText(label)}</th>)}</tr></thead><tbody>{rows.slice((current-1)*size,current*size).map(row=>{const r=row.rewards;return <tr key={row.child_id}><td>{r.placement_review_required?uiText('Placement review required'):r.rank==null?uiText('Not ranked yet'):`#${r.rank}${r.tied?' =':''}`}</td><th scope="row">{r.alias}</th><td>{r.completed_missions}</td><td>{r.completed_missions}/{r.assigned_missions} · {r.completion_percent}%</td><td>{r.earned_count}</td><td><Link to={`/workspace/students?student=${encodeURIComponent(row.child_id)}`}>{uiText('Open record')}</Link></td></tr>;})}</tbody></table></div>
   {!rows.length&&<p>{uiText('No students match this search.')}</p>}<nav className="teacher-rank-pagination" aria-label={uiText('Achievement pages')}><Button variant="secondary" disabled={current<=1} onClick={()=>setPage(current-1)}>{uiText('Previous')}</Button><span>{uiText('Page {0} of {1}',[current,pages])}</span><Field label="Jump to page" type="number" min={1} max={pages} value={current} onChange={event=>{const value=Number(event.target.value);if(Number.isInteger(value)&&value>=1&&value<=pages)setPage(value);}}/><Button variant="secondary" disabled={current>=pages} onClick={()=>setPage(current+1)}>{uiText('Next')}</Button></nav>
  </>}
  <p>{uiText('Skipped missions and unverified answers earn no mission badge. Repeated submissions never add a second badge for the same grade and mission.')}</p>
  <p>{uiText('CSV exports all filtered learners across every page: rank, completed and assigned missions, completion percentage, badge count and verification status. It does not replace the quiz gradebook.')}</p>
 </section>;
}
