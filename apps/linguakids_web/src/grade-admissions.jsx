import {useEffect,useState} from 'react';
import {useApp} from './context';
import {uiText} from './i18n';
import {Button,Field,Modal,Notice,useAction} from './ui';
export function GradeAdmissions(){
 const {repository,refresh}=useApp(),action=useAction();
 const [rows,setRows]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[release,setRelease]=useState(null),[notice,setNotice]=useState('');
 async function load(){setLoading(true);setError('');try{setRows(await repository.rpc('admin_grade_roster'));}catch(e){setError(e.message);}finally{setLoading(false);}}
 useEffect(()=>{load();},[repository]);
 return <section className="panel grade-admissions"><div className="section-heading"><div><h3>{uiText('Teacher registrations by grade')}</h3><p>{uiText('Teachers register directly for an available grade and verify their email. No administrator approval is needed. Each grade has one regular teacher.')}</p></div></div>
 {loading&&<p role="status">{uiText('Loading grade registrations…')}</p>}
 {error&&<Notice error>{error}<Button variant="secondary" onClick={load}>{uiText('Try again')}</Button></Notice>}
 {notice&&<Notice>{notice}</Notice>}
 {!loading&&!error&&<div className="grade-admission-grid">{rows.map(row=><article key={row.grade_level}><h4>{uiText('Grade {0}',[row.grade_level])}</h4><p>{row.profile_id?(row.email_confirmed?uiText('Verified teacher'):uiText('Awaiting email confirmation')):uiText('Available for registration')}</p><p>{row.email||uiText('No teacher registered yet.')}</p><small>{uiText('Retained students')}: {row.student_count}</small><div className="actions">
 {row.profile_id&&<Button variant="secondary" onClick={()=>{action.setError('');setRelease(row);}}>{uiText(row.email_confirmed?'Replace teacher':'Release pending registration')}</Button>}
 </div></article>)}</div>}
 {release&&<Modal title={uiText(release.email_confirmed?'Replace grade teacher':'Release pending registration')} onClose={()=>setRelease(null)}><form className="form-stack" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);action.run(async()=>{const result=await repository.api('/v1/admin/grades/'+release.grade_level+'/release',{expected_user_id:release.profile_id,mode:release.email_confirmed?'replace':'pending',reason:String(f.get('reason')).trim()});setNotice(uiText('Grade {0} released. Student records were retained.',[result.grade_level]));setRelease(null);await load();await refresh();});}}>
 <p><strong>{release.email}</strong> · {uiText('Grade {0}',[release.grade_level])}</p><p>{uiText('This closes the selected login and frees the grade for registration. Student profiles and activity history remain retained; a newly registered teacher does not automatically receive the previous classroom records.')}</p><p>{uiText('Owned student profiles')}: {release.owned_student_count} · {uiText('Recorded activities')}: {release.owned_attempt_count}</p><Field label="Reason" name="reason" required minLength={3}/><label className="checkbox"><input type="checkbox" required/>{uiText('I confirm the selected grade and teacher account.')}</label>{action.error&&<Notice error>{action.error}</Notice>}<Button type="submit" disabled={action.busy}>{uiText('Confirm grade release')}</Button></form></Modal>}
 </section>;
}
export function AccountModeBanner(){
 const {user,data}=useApp();
 if(user?.account_kind==='review')return <div className="review-mode-banner" role="status">{uiText('Review / demonstration account · Grades 1–6 · Demo students and results')}</div>;
 if(user?.role==='administrator'&&data?.demo_students_hidden)return <div className="review-mode-banner">{uiText('Demonstration student records are excluded from school reports.')}</div>;
 return null;
}
