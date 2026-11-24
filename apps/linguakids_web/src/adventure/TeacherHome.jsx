import {useState} from 'react';
import {Link} from 'react-router-dom';
import {useApp} from '../context';
import {assignedGrades} from '../grade-scope';
import {uiText,useUiLanguage} from '../i18n';
import {dateText} from '../domain';
import {Notice,Select,Icon} from '../ui';
import {useTeacherProgress} from './TeacherProgressContext';
import {ProgressLoadNotice} from './TeacherStudentProgress';
import {learnerProgress,mergeRecordedAttempts} from './teacher-progress';
import './teacher-progress.css';
import {TeacherAnalytics} from './TeacherAnalytics';

export function TeacherHome(){
  useUiLanguage();
  const {data,user}=useApp(),progress=useTeacherProgress();
  const grades=assignedGrades(user);
  const [grade,setGrade]=useState(grades.length===1?String(grades[0]):'');
  const children=data.children.filter(child=>child.active&&(!grade||child.grade_level===Number(grade)));
  const rows=children.map(child=>({child,summary:learnerProgress(progress.byChild.get(child.id),data.attempts.filter(a=>a.child_id===child.id))}));
  const known=rows.filter(row=>row.summary.state!=='unavailable');
  const priority=['placement-review','reading-review','quiz-retry','pending-scoring'];
  const attention=known.filter(row=>priority.includes(row.summary.state)).sort((a,b)=>priority.indexOf(a.summary.state)-priority.indexOf(b.summary.state)||a.child.nickname.localeCompare(b.child.nickname));
  const count=predicate=>known.length?known.filter(predicate).length:children.length?'—':0;
  const metrics=[
    ['Active students',children.length,'users','/workspace/students'],
    ['Started their mission sequence',count(row=>row.summary.completed>0||['quiz-retry','reading-review'].includes(row.summary.state)),'chart','/workspace/journey?view=progress'],
    ['Need teacher reading review',count(row=>row.summary.state==='reading-review'),'mic','/workspace/journey?view=review'],
    ['Finished all assigned missions',count(row=>row.summary.state==='completed'),'check','/workspace/students'],
  ];
  const visibleIds=new Set(children.map(child=>child.id));
  const allAttempts=mergeRecordedAttempts(data.attempts,progress.learners.flatMap(learner=>learner.quiz_attempts||[]));
  const recent=allAttempts
    .filter(attempt=>visibleIds.has(attempt.child_id)&&attempt.assessment_type!=='pending_online_scoring')
    .sort((a,b)=>new Date(b.completed_at)-new Date(a.completed_at)).slice(0,5);
  const classGrades=(grade?[Number(grade)]:grades).filter(value=>children.some(child=>child.grade_level===value));
  const announcements=data.records.filter(record=>record.kind==='announcement'&&record.status==='published');
  return <div className="teacher-class-dashboard">
    <div className="page-intro"><div><h2>{uiText('Class overview')}</h2><p>{uiText('Monitor mission progress, review results, and plan your next teaching action.')}</p></div><Select label={uiText('Class grade')} value={grade} onChange={event=>setGrade(event.target.value)} values={grades.length===1?grades.map(g=>[String(g),`Grade ${g}`]):[['','All my grades'],...grades.map(g=>[String(g),`Grade ${g}`])]}/></div>
    <div className="teacher-home-actions"><Link className="button" to="/workspace/students"><Icon name="users"/>{uiText('Students & missions')}</Link><Link className="button secondary" to="/workspace/journey?view=levels"><Icon name="layers"/>{uiText('Arrange grade missions')}</Link><Link className="button secondary" to="/workspace/reports"><Icon name="download"/>{uiText('Reports & gradebook')}</Link></div>
    <ProgressLoadNotice/>
    <div className="teacher-class-metrics">{metrics.map(([label,value,icon,href])=><Link key={label} to={href}><span className="teacher-metric-label">{uiText(label)}<Icon name={icon}/></span><strong>{value}</strong></Link>)}</div>
    {known.length<children.length&&<Notice>{uiText('Progress loaded for {0} of {1} students. Missing records are not counted as zero progress.',[known.length,children.length])}</Notice>}
    <TeacherAnalytics rows={rows} attempts={allAttempts} grade={grade}/>
    <div className="teacher-dashboard-columns">
      <section className="panel"><div className="teacher-section-head"><div><h2>{uiText('Needs attention')}</h2><p>{uiText('Reading reviews, quiz retries and responses waiting for online scoring.')}</p></div><Link to="/workspace/students">{uiText('View students')} →</Link></div>
        <div className="teacher-watchlist">{attention.slice(0,5).map(({child,summary})=><Link key={child.id} to={summary.state==='reading-review'?`/workspace/journey?view=review&student=${encodeURIComponent(child.id)}`:`/workspace/students?student=${encodeURIComponent(child.id)}${summary.state==='placement-review'?'&tab=placement':''}`}><div><strong>{child.nickname}</strong><small>{uiText('Grade {0}',[child.grade_level])} · {summary.current?.title}</small></div><span className={`mission-status ${summary.state}`}>{uiText(summary.label)}</span></Link>)}</div>
        {!attention.length&&<div className="teacher-attention-empty"><Icon name={progress.loading?'refresh':'check'}/><p>{uiText(progress.loading?'Checking mission records…':'No attention markers in the loaded mission records.')}</p></div>}
        {attention.length>5&&<Link to="/workspace/students">{uiText('View all students')}</Link>}
      </section>
      <section className="panel"><div className="teacher-section-head"><div><h2>{uiText('Mission completion by grade')}</h2><p>{uiText('Completed tasks in the assigned sequence')}</p></div><Icon name="chart"/></div>
        <div className="teacher-grade-progress">{classGrades.map(value=>{
          const gradeRows=rows.filter(row=>row.child.grade_level===value),loaded=gradeRows.filter(row=>row.summary.state!=='unavailable');
          const complete=loaded.reduce((sum,row)=>sum+row.summary.completed,0),total=loaded.reduce((sum,row)=>sum+row.summary.total,0);
          const available=loaded.length===gradeRows.length&&total>0;
          return <div key={value}><div><strong>{uiText('Grade {0}',[value])}</strong><span>{available?`${complete}/${total} ${uiText('tasks')}`:uiText('Progress unavailable')}</span></div><progress aria-label={uiText('Grade {0} task completion',[value])} max={available?total:1} value={available?complete:0}/></div>;
        })}{!classGrades.length&&<p>{uiText('Add students to start monitoring mission progress.')}</p>}<p className="mission-legend">{uiText('Task completion measures progress through missions, not a mastery grade.')}</p></div>
      </section>
    </div>
    <section className="panel teacher-recent-activity"><div className="teacher-section-head"><div><h2>{uiText('Recent learning activity')}</h2><p>{uiText('Latest saved results for the selected grade')}</p></div><Link to="/workspace/reports">{uiText('View gradebook')} →</Link></div>
      {recent.length?<div className="table-wrap"><table><thead><tr>{['Student','Activity','Result','Recorded'].map(label=><th key={label}>{uiText(label)}</th>)}</tr></thead><tbody>{recent.map(attempt=><tr key={attempt.submission_id||attempt.id}><td><Link to={`/workspace/students?student=${encodeURIComponent(attempt.child_id)}`}>{children.find(child=>child.id===attempt.child_id)?.nickname}</Link></td><td>{attempt.material_title}<small className="student-id">{uiText(attempt.activity_kind||'Activity')} · v{attempt.material_version||1}</small></td><td>{attempt.activity_kind==='quiz'&&attempt.correct_count!=null?`${attempt.correct_count}/${attempt.total_count}`:uiText('Completed task')}</td><td>{dateText(attempt.completed_at)}</td></tr>)}</tbody></table></div>:<p>{uiText('No recorded activities for this selection yet.')}</p>}
    </section>
    {announcements.length>0&&<details className="panel teacher-help"><summary>{uiText('Announcements')} ({announcements.length})</summary>{announcements.map(record=><Notice key={record.id}><strong>{record.title}</strong><br/>{record.data.details}</Notice>)}</details>}
    <details className="teacher-help"><summary>{uiText('How student progress is recorded')}</summary><p>{uiText('Latest score is the current quiz grade; first and best scores remain visible for the same quiz version. Retakes never erase history.')}</p><p>{uiText('Task completion is progress through the sequence. AI reading checks recognize words; they are not validated pronunciation grades.')}</p></details>
  </div>;
}
