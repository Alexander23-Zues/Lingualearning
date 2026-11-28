import {uiText,useUiLanguage} from '../i18n';
import {Button,Icon} from '../ui';
import {learnerProgress,mergeRecordedAttempts} from './teacher-progress';

export function TeacherRoster({students,progress,attempts,busy,onOpen,onDetails,onEdit}){
  useUiLanguage();
  return <div className="teacher-roster"><table className="teacher-roster-table"><caption className="sr-only">{uiText('Student mission monitoring')}</caption><thead><tr>{['Student','Current task','Progress','Latest quiz','Status','Actions'].map(label=><th key={label}>{uiText(label)}</th>)}</tr></thead><tbody>
    {students.map(child=>{
      const record=progress.byChild.get(child.id),summary=learnerProgress(record);
      const quizzes=mergeRecordedAttempts(attempts.filter(attempt=>attempt.child_id===child.id),record?.quiz_attempts||[])
        .filter(attempt=>attempt.activity_kind==='quiz'&&attempt.correct_count!=null&&attempt.total_count>0)
        .sort((a,b)=>new Date(b.completed_at)-new Date(a.completed_at));
      const latest=quizzes[0];
      return <tr key={child.id} data-student-id={child.id}>
        <th scope="row"><div className="roster-person"><span className="roster-initial" aria-hidden="true">{child.nickname.trim().slice(0,1).toUpperCase()}</span><div><button className="roster-name" onClick={()=>onDetails(child)}>{child.nickname}</button><small>{uiText('Grade {0}',[child.grade_level])} · {uiText(child.learning_level)}{child.gender?` · ${uiText(child.gender==='male'?'Male':'Female')}`:''}</small></div></div></th>
        <td data-label={uiText('Current task')}><span className="roster-task">{child.active?(summary.current?.title||uiText(summary.state==='completed'?'All assigned missions finished':summary.label)):uiText('Inactive profile')}</span>{summary.stage&&<small>{uiText('Level {0}',[summary.stageNumber])} · {summary.stage.title}</small>}</td>
        <td data-label={uiText('Progress')}>{record&&summary.total>0?<div className="roster-progress"><span><strong>{summary.percent}%</strong><small>{summary.completed}/{summary.total} {uiText('tasks')}</small></span><progress aria-label={uiText('Mission completion for {0}',[child.nickname])} max={summary.total} value={summary.completed}/></div>:<span className="roster-muted">—</span>}</td>
        <td data-label={uiText('Latest quiz')}><strong>{latest?`${latest.correct_count}/${latest.total_count}`:'—'}</strong><small>{uiText('{0} attempts',[quizzes.length])}</small></td>
        <td data-label={uiText('Status')}><span className={`mission-status ${child.active?summary.state:'inactive'}`}>{uiText(!child.active?'Inactive':progress.loading&&!record?'Loading…':summary.label)}</span></td>
        <td className="roster-action-cell"><div className="roster-actions"><Button variant="secondary" aria-label={uiText('Mission record & results')} onClick={()=>onDetails(child)}>{uiText('View record')}</Button><Button variant="ghost" className="roster-icon-action" icon="arrow" aria-label={uiText('Continue assigned mission')} title={uiText('Continue assigned mission')} disabled={!child.active||busy} onClick={()=>onOpen(child)}><span className="roster-mobile-label">{uiText('Continue')}</span></Button><Button variant="ghost" className="roster-icon-action" aria-label={uiText('Edit profile')} title={uiText('Edit profile')} onClick={()=>onEdit(child)}><Icon name="edit"/></Button></div></td>
      </tr>;
    })}
  </tbody></table></div>;
}
