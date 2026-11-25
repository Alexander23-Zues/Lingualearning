import {Link} from 'react-router-dom';
import {useApp} from '../context';
import {uiText,useUiLanguage} from '../i18n';
import {Button,Notice} from '../ui';
import {useTeacherProgress} from './TeacherProgressContext';
import {learnerProgress,quizPercent} from './teacher-progress';
import './teacher-progress.css';
import {TeacherRewardSummary} from './TeacherRewards';

export function StudentMissionSummary({child}) {
  useUiLanguage();
  const progress=useTeacherProgress();
  const record=progress.byChild.get(child.id),summary=learnerProgress(record);
  return <div className="student-mission-summary">
    <span className={`mission-status ${summary.state}`}>{uiText(progress.loading&&!record?'Loading mission progress…':summary.label)}</span>
    {record&&<>
      <p>{summary.stage?uiText('Level {0} · {1}',[summary.stageNumber,summary.stage.title]):uiText(summary.total?'All assigned missions finished':'Prepare this grade’s missions first')}</p>
      {summary.current&&<strong>{uiText('Next: {0}',[summary.current.title])}</strong>}
      {summary.total>0&&<><progress aria-label={uiText('Mission completion for {0}',[child.nickname])} max={summary.total} value={summary.completed}/><small>{uiText('{0} of {1} mission tasks completed',[summary.completed,summary.total])} · {summary.percent}%</small></>}
    </>}
  </div>;
}

export function CompactMissionProgress({child}){
  useUiLanguage();
  const progress=useTeacherProgress();
  const record=progress.byChild.get(child.id),summary=learnerProgress(record);
  return <div className="gradebook-mission-progress"><span className={`mission-status ${child.active?summary.state:'inactive'}`}>{uiText(!child.active?'Inactive':summary.label)}</span>{record&&summary.total>0&&<><span><strong>{summary.completed}/{summary.total}</strong> {uiText('tasks')} · {summary.percent}%</span>{summary.stage&&<small>{uiText('Level {0}',[summary.stageNumber])}</small>}</>}</div>;
}

export function QuizDevelopmentTable({attempts}) {
  useUiLanguage();
  const rows=learnerProgress({adventure:{stages:[]}},attempts).quizzes;
  const score=attempt=>`${attempt.correct_count}/${attempt.total_count} (${Math.round(quizPercent(attempt))}%)`;
  return <section className="student-quiz-development">
    <h3>{uiText('Quiz learning development')}</h3>
    <p>{uiText('Latest score is the current grade. Best and first scores show practice on the same quiz version; every attempt is retained.')}</p>
    {!rows.length?<p>{uiText('No scored quiz attempts yet.')}</p>:<div className="table-wrap"><table><thead><tr>{['Quiz / version','First','Latest grade','Best','Attempts'].map(label=><th key={label}>{uiText(label)}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.key}><th scope="row">{row.latest.material_title}<small className="student-id">v{row.latest.material_version??1}</small></th><td>{score(row.first)}</td><td>{score(row.latest)}<small className="student-id">{uiText(quizPercent(row.latest)>=80?'Passed':'Needs another try')}</small></td><td>{score(row.best)}</td><td>{row.attempts}</td></tr>)}</tbody></table></div>}
  </section>;
}

export function StudentMissionRecord({child,onPreview}) {
  useUiLanguage();
  const {data}=useApp(),progress=useTeacherProgress();
  const learner=progress.byChild.get(child.id),summary=learnerProgress(learner);
  if(!learner)return <Notice>{uiText(!child.active?'This profile is inactive. Its recorded results remain available.':progress.loading?'Loading mission progress…':'Mission progress could not be loaded. Refresh to try again.')}{child.active&&<Button variant="secondary" disabled={progress.loading} onClick={progress.refresh}>{uiText('Refresh mission progress')}</Button>}</Notice>;
  return <div className="student-mission-record">
    <StudentMissionSummary child={child}/>
    <TeacherRewardSummary rewards={learner.rewards}/>
    <p>{uiText('Completed tasks show sequence progress, not a pronunciation or mastery grade.')}</p>
    {summary.reviews.length>0&&<Link className="button secondary" to={`/workspace/journey?view=review&student=${encodeURIComponent(child.id)}`}>{uiText('Review observed reading')}</Link>}
    {summary.current&&<div className="mission-next"><div><small>{uiText('CURRENT TASK')}</small><h3>{summary.current.title}</h3><p>{uiText(summary.current.kind)} · {uiText(summary.label)}</p></div>{data.materials.some(m=>m.id===summary.current.material_id)&&<Button variant="secondary" onClick={()=>onPreview(data.materials.find(m=>m.id===summary.current.material_id))}>{uiText('Teacher preview')}</Button>}</div>}
    {learner.adventure.stages.map((stage,index)=><details className="mission-level-record" key={stage.id} open={stage.id===summary.stage?.id}><summary><strong>{uiText('Level {0}: {1}',[index+1,stage.title])}</strong><span>{stage.completed}/{stage.total} · {uiText(stage.status==='not-assigned'?'Earlier mission · not completed':stage.status==='completed'?'Completed':stage.status==='locked'?'Locked':'Current level')}{stage.difficulty?` · ${uiText(stage.difficulty)}`:''}</span></summary><ol>{stage.steps.map(step=><li key={step.id}><span>{step.title}<small>{uiText(step.kind)}{step.mode?` · ${step.mode}`:''}</small></span><span className={`mission-status ${step.status}`}>{uiText(({completed:'Completed',locked:'Locked',current:'Next task',needs_review:'Teacher reading review',pending_online_scoring:'Awaiting online scoring','not-assigned':'Not assigned'})[step.status]||step.status)}</span>{step.kind==='story'&&step.reading_total>0&&<small>{step.teacher_approved?uiText('Teacher-approved reading'):uiText('{0}/{1} English reading parts recognized',[step.reading_checked||0,step.reading_total])}</small>}</li>)}</ol></details>)}
  </div>;
}

export function ProgressLoadNotice() {
  const progress=useTeacherProgress();
  return <div className="teacher-progress-refresh"><div>{Object.entries(progress.errors).map(([grade,message])=><Notice key={grade} error>{uiText('Grade {0} progress unavailable',[grade])}: {message}</Notice>)}<small>{progress.loading?uiText('Updating mission records…'):progress.updatedAt?uiText('Mission records checked: {0}',[new Date(progress.updatedAt).toLocaleTimeString()]):uiText('Mission records have not loaded yet.')}</small></div><Button variant="secondary" icon="refresh" disabled={progress.loading} onClick={progress.refresh}>{uiText('Refresh mission progress')}</Button></div>;
}
