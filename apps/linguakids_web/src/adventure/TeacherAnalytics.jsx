import {Link} from 'react-router-dom';
import {uiText,useUiLanguage} from '../i18n';
import {Icon} from '../ui';
import {latestQuizAnalytics,missionDistribution} from './teacher-analytics';

export function TeacherAnalytics({rows,attempts,grade}){
 useUiLanguage();
 const groups=missionDistribution(rows),total=rows.length;
 const quiz=latestQuizAnalytics(attempts,new Set(rows.map(row=>row.child.id)));
 const circumference=2*Math.PI*66;let offset=0;
 const linkFor=mission=>`/workspace/students?${new URLSearchParams({...(grade?{grade}:{}),mission,profile:'active'})}`;
 return <section className="teacher-analytics" aria-label={uiText('Class learning analytics')}>
 <div className="teacher-analytics-heading"><div><span className="eyebrow">{uiText('LEARNING SNAPSHOT')}</span><h2>{uiText('Your classroom at a glance')}</h2></div><span>{uiText(grade?'Grade {0} · current records':'All my grades · current records',[grade])}</span></div>
 <div className="teacher-analytics-grid">
 <article className="panel analytics-card"><div className="teacher-section-head"><div><h3>{uiText('Mission status')}</h3><p>{uiText('Where learners are in their assigned sequence')}</p></div><span className="analytics-icon"><Icon name="users"/></span></div>
 <div className="mission-distribution"><div className="mission-donut" role="img" aria-label={uiText('{0} students. {1}',[total,groups.map(group=>`${uiText(group.label)}: ${group.count}`).join('; ')])}>
 <svg viewBox="0 0 172 172" aria-hidden="true"><circle cx="86" cy="86" r="66" fill="none" stroke="#eef2f7" strokeWidth="19"/>{groups.filter(group=>group.count).map(group=>{
  const length=group.count/total*circumference,segment=<circle key={group.key} cx="86" cy="86" r="66" fill="none" stroke={group.color} strokeWidth="19" strokeDasharray={`${length} ${circumference-length}`} strokeDashoffset={-offset} transform="rotate(-90 86 86)"/>;offset+=length;return segment;
 })}</svg><div className="donut-total"><strong>{total}</strong><span>{uiText('students')}</span></div></div>
 <ul className="analytics-legend">{groups.map(group=><li key={group.key}><Link to={linkFor(group.key)}><span className="analytics-dot" style={{background:group.color}}/><span>{uiText(group.label)}</span><strong>{group.count}</strong><span aria-hidden="true">›</span></Link></li>)}</ul></div>
 <p className="analytics-footnote">{uiText('Select a status to open the matching students. Missing mission records remain unavailable.')}</p></article>
 <article className="panel analytics-card"><div className="teacher-section-head"><div><h3>{uiText('Latest quiz performance')}</h3><p>{uiText('One latest graded result per student and quiz version')}</p></div><span className="analytics-icon teal"><Icon name="chart"/></span></div>
 {quiz.count?<><div className="quiz-analytics-summary"><div><strong>{Math.round(quiz.average)}<span>%</span></strong><small>{uiText('Average latest score')}</small></div><p>{uiText('Recorded results: {0} · Students: {1}',[quiz.count,quiz.students])}</p></div><div className="quiz-band-list">{quiz.bands.map(band=><div className="quiz-band" key={band.label}><div><span><i className="analytics-dot" style={{background:band.color}}/>{uiText(band.label)}</span><strong>{band.count} <small>{uiText('results')}</small></strong></div><div className="quiz-band-track" role="img" aria-label={`${uiText(band.label)}: ${band.count} / ${quiz.count}`}><span style={{width:`${100*band.count/quiz.count}%`,background:band.color}}/></div></div>)}</div></>:<div className="analytics-empty"><Icon name="chart"/><strong>{uiText('No graded quiz results yet')}</strong><p>{uiText('This chart appears after a student completes a scored quiz. Missing work is not a zero.')}</p></div>}
 <div className="analytics-footer"><p>{uiText('Retakes stay in history. Pending scores and school baseline assessments are excluded.')}</p><Link to={`/workspace/reports${grade?`?grade=${grade}`:''}`}>{uiText('Open gradebook')} <span aria-hidden="true">→</span></Link></div></article>
 </div></section>;
}
