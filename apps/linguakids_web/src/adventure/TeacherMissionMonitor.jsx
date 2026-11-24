import {Link} from 'react-router-dom';
import {useApp} from '../context';
import {uiText,useUiLanguage} from '../i18n';
import {Button} from '../ui';
import {csvText,download} from '../domain';
import {useTeacherProgress} from './TeacherProgressContext';
import {learnerProgress} from './teacher-progress';

export function TeacherMissionMonitor({grade}){
  useUiLanguage();
  const {data}=useApp(),progress=useTeacherProgress();
  const learners=progress.byGrade[grade]||[];
  const children=data.children.filter(child=>child.active&&child.grade_level===Number(grade));
  const rows=children.map(child=>({child,summary:learnerProgress(progress.byChild.get(child.id))}));
  const exportRows=[['Student ID','Student','Grade','Level','Quiz','Version','Correct','Total','Outcome','Recorded'],...learners.flatMap(learner=>(learner.quiz_attempts||[]).map(attempt=>[
    learner.child_id,learner.nickname,grade,attempt.stage_id,attempt.material_title,attempt.material_version,attempt.correct_count??'',attempt.total_count,
    attempt.correct_count==null?'Awaiting online scoring':attempt.correct_count*100>=attempt.total_count*80?'Passed':'Needs another try',attempt.completed_at,
  ]))];
  return <section className="panel"><h3>{uiText('Student adventure progress')}</h3><p>{uiText('Open a student record for their full task sequence, first/latest/best quiz scores and attempt history.')}</p><Button variant="secondary" disabled={progress.loading||!learners.length} onClick={()=>download(`Grade-${grade}-adventure-quiz-attempts.csv`,csvText(exportRows),'text/csv;charset=utf-8')}>{uiText('Export adventure quiz attempts CSV')}</Button>
    {!children.length?<p>{uiText('No active learners in this grade yet.')}</p>:<div className="table-wrap"><table><thead><tr>{['Student','Current level / task','Mission tasks','Status','Record'].map(label=><th key={label}>{uiText(label)}</th>)}</tr></thead><tbody>{rows.map(({child,summary})=><tr key={child.id}><th scope="row">{child.nickname}<small className="student-id">{child.id.slice(0,6)}</small></th><td>{summary.stage?uiText('Level {0} · {1}',[summary.stageNumber,summary.stage.title]):'—'}<small className="student-id">{summary.current?.title}</small></td><td>{summary.total?`${summary.completed}/${summary.total} (${summary.percent}%)`:'—'}</td><td><span className={`mission-status ${summary.state}`}>{uiText(summary.label)}</span></td><td><Link to={`/workspace/students?student=${encodeURIComponent(child.id)}`}>{uiText('Open record')}</Link></td></tr>)}</tbody></table></div>}
  </section>;
}
