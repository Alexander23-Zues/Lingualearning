import {useEffect,useState} from 'react';
import {Button,Empty,Modal,Notice,Search,Select,Toolbar} from './ui';
import {csvText,download} from './domain';
import {uiText,useUiLanguage} from './i18n';

export function baselineRows(records,children){
 const students=new Map(children.map(child=>[child.id,child]));
 return records.filter(row=>row.kind==='reading_assessment'&&students.has(row.data?.child_id))
  .map(row=>({...row,child:students.get(row.data.child_id)}))
  .sort((a,b)=>b.data.assessment_date.localeCompare(a.data.assessment_date)||a.child.nickname.localeCompare(b.child.nickname));
}
const language=data=>uiText(data.language==='en'?'English':'Mother Tongue / Filipino');
export const baselineValue=(data,key,suffix='')=>data[key]===null||data[key]===undefined
 ?uiText((key==='rhymes'&&data.letter_sounds>6)||(key==='sentences'&&data.letter_sounds<=6)||(data.story_number==null&&['miscues','words_read','reading_seconds','wpm','accuracy_percent','comprehension_correct','experience_rating','observation_level'].includes(key))?'Not administered':'Not recorded')
 :`${data[key]}${suffix}`;
export function baselineExport(rows){
 return [['Student','Grade','Assessment language','Date','Type','Source reading profile','Part 1 level','Part 1 total / 30','Letters / 10','Rhymes / 10','Sentences / 10','Story','Words read','Miscues','Reading seconds','WPM','Correct words %','Comprehension / 5','Experience / 5','Observation level','Teacher review required','Source key'],
 ...rows.map(({child,data:d})=>[child.nickname,child.grade_level,language(d),d.assessment_date,d.assessment_type,d.reading_profile,d.part1_level,d.part1_total,d.letter_sounds,d.rhymes??'',d.sentences??'',d.story_number??'',d.words_read??'',d.miscues??'',d.reading_seconds??'',d.wpm??'',d.accuracy_percent??'',d.comprehension_correct??'',d.experience_rating??'',d.observation_level??'','Yes',d.source_key])];
}
function BaselineScope(){return <Notice>{uiText('Source assessment only. These records do not change quiz grades, complete missions, or unlock levels. Mother Tongue results are not English placement evidence.')}</Notice>;}
export function StudentBaselines({child,records}){
 useUiLanguage();const rows=baselineRows(records,[child]);
 return <section className="reading-baselines" aria-label={uiText('Baseline assessment')}><BaselineScope/>
 {!rows.some(row=>row.data.language==='en')&&!records.some(row=>row.kind==='english_assessment'&&row.data.child_id===child.id)&&<p className="baseline-pending">{uiText('English placement: awaiting the separate English assessment and teacher confirmation.')}</p>}
 {!rows.length&&<Empty title={uiText('No baseline assessment recorded')}>{uiText('Student mission results are available in the Missions and Results tabs.')}</Empty>}
 {rows.map(({id,data:d})=><article className="panel baseline-detail" key={id}>
 <div className="baseline-heading"><div><span className="eyebrow">{language(d)} · {d.assessment_type}</span><h3>{uiText(d.reading_profile)}</h3><p>{d.assessment_date} · {uiText('Source row')} {d.source_row}</p></div><span className="baseline-review">{uiText('Awaiting teacher verification')}</span></div>
 <h4>{uiText('Part 1 · Foundational reading')}</h4><dl className="baseline-metrics">
 {[["Letter sounds",'letter_sounds',' / 10'],['Rhymes','rhymes',' / 10'],['Sentences','sentences',' / 10'],['Part 1 total','part1_total',' / 30']].map(([label,key,suffix])=><div key={key}><dt>{uiText(label)}</dt><dd>{baselineValue(d,key,suffix)}</dd></div>)}
 </dl><p>{uiText('Source Part 1 category')}: <strong>{uiText(d.part1_level)}</strong></p>
 <p className="muted">{uiText(d.letter_sounds>6?'Sentence route: the form includes 10 automatic rhyme credits. The blank rhyme score is not an observed 10/10.':'Rhyme route: sentences were not administered. The total is letter sounds plus rhymes.')}</p>
 <h4>{uiText('Part 2 · Story reading')}</h4>
 {d.story_number==null?<p>{uiText('Not administered')}</p>:<><p>{uiText('Story')} {d.story_number} · {d.total_story_words} {uiText('words')}</p><dl className="baseline-metrics">
 {[["Words read",'words_read',''],['Miscues','miscues',''],['Recorded duration','reading_seconds',' s'],['Words per minute','wpm',''],['Correct words','accuracy_percent','%'],['Comprehension','comprehension_correct',' / 5'],['Experience rating','experience_rating',' / 5'],['Observation level','observation_level',' / 4']].map(([label,key,suffix])=><div key={key}><dt>{uiText(label)}</dt><dd>{baselineValue(d,key,suffix)}</dd></div>)}
 </dl></>}
 {!!d.quality_flags?.length&&<Notice><strong>{uiText('Source values to check')}</strong><ul>{d.quality_flags.map(flag=><li key={flag}>{uiText(flag==='duration_exceeds_form_one_minute'?'Recorded duration exceeds the form’s one-minute instruction; the original duration and WPM are retained.':'Comprehension was not recorded; it is not a zero score.')}</li>)}</ul></Notice>}
 <details><summary>{uiText('Source & interpretation')}</summary><p>{d.source_title}</p><p>{d.source_notes}</p><p>{uiText('Printed reading categories are retained as supplied. A teacher must verify the transcription and interpretation before using this baseline for a learning decision.')}</p></details>
 </article>)}</section>;
}
export function ClassBaselines({records,children:students,onClose,onStudent}){
 useUiLanguage();const [query,setQuery]=useState(''),[grade,setGrade]=useState(''),[profile,setProfile]=useState(''),[page,setPage]=useState(1);
 const all=baselineRows(records,students),rows=all.filter(row=>row.child.nickname.toLowerCase().includes(query.toLowerCase())&&(!grade||row.child.grade_level===Number(grade))&&(!profile||row.data.reading_profile===profile));
 useEffect(()=>setPage(1),[query,grade,profile]);
 const pages=Math.max(1,Math.ceil(rows.length/10)),current=Math.min(page,pages);
 return <Modal title={uiText('Reading baselines')} onClose={onClose} wide><div className="reading-baselines"><BaselineScope/>
 <p>{uiText('English placement is managed in each learner’s English placement tab.')}</p>
 <Toolbar><Search value={query} onChange={setQuery} placeholder={uiText('Search student names')}/><Select label="Baseline grade" value={grade} onChange={e=>setGrade(e.target.value)} values={[['','All my grades'],...[...new Set(all.map(row=>row.child.grade_level))].sort().map(g=>[g,`Grade ${g}`])]}/><Select label="Source reading profile" value={profile} onChange={e=>setProfile(e.target.value)} values={[['','All reading profiles'],...[...new Set(all.map(row=>row.data.reading_profile))].sort()]}/></Toolbar>
 <div className="teacher-progress-refresh"><span>{uiText('{0} assessment records',[rows.length])}</span><Button variant="secondary" disabled={!rows.length} onClick={()=>download('linguakids-reading-baselines.csv',csvText(baselineExport(rows)),'text/csv;charset=utf-8')}>{uiText('Export baseline CSV')}</Button></div>
 {!!rows.length?<div className="baseline-table-wrap"><table><caption>{uiText('Source baselines · awaiting teacher verification')}</caption>
 <thead><tr>{['Student','Language / date','Source reading profile','Part 1','WPM','Correct words','Comprehension'].map(label=><th key={label}>{uiText(label)}</th>)}</tr></thead>
 <tbody>{rows.slice((current-1)*10,current*10).map(({id,child,data:d})=><tr key={id}>
 <th scope="row"><button className="baseline-student" onClick={()=>onStudent(child)}>{child.nickname}</button><small>{uiText('Grade ')}{child.grade_level}</small></th>
 <td data-label={uiText('Language / date')}>{language(d)}<small>{d.assessment_date}</small></td>
 <td data-label={uiText('Source reading profile')}>{uiText(d.reading_profile)}{d.quality_flags?.length>0&&<small>{uiText('Source values to check')}</small>}</td>
 <td data-label={uiText('Part 1')}>{d.part1_total}/30<small>{uiText(d.part1_level)}</small></td>
 <td data-label={uiText('WPM')}>{baselineValue(d,'wpm')}</td>
 <td data-label={uiText('Correct words')}>{baselineValue(d,'accuracy_percent','%')}</td>
 <td data-label={uiText('Comprehension')}>{baselineValue(d,'comprehension_correct','/5')}</td>
 </tr>)}</tbody></table></div>:<Empty title={uiText('No baseline assessments match')}>{uiText('Change your filters or add a source assessment.')}</Empty>}
 <div className="teacher-progress-refresh"><span>{uiText('Page {0} of {1}',[current,pages])}</span><div className="actions"><Button variant="secondary" disabled={current<=1} onClick={()=>setPage(current-1)}>{uiText('Previous')}</Button><Button variant="secondary" disabled={current>=pages} onClick={()=>setPage(current+1)}>{uiText('Next')}</Button></div></div>
 <p className="muted">{uiText('CSV exports the filtered baseline records, including all pages. Blank cells mean not recorded or not administered; a recorded zero remains 0. These are source assessment values, not system quiz grades.')}</p>
 </div></Modal>;
}
