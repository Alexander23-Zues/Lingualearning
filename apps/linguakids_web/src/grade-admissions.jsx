import {useEffect,useState} from 'react';
import {useApp} from './context';
import {uiText} from './i18n';
import {Button,Field,Modal,Notice,Select,useAction} from './ui';
export function GradeAdmissions(){
 const {repository,refresh}=useApp(),action=useAction();
 const [rows,setRows]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[edit,setEdit]=useState(null),[release,setRelease]=useState(null),[issued,setIssued]=useState(null),[notice,setNotice]=useState('');
 async function load(){setLoading(true);setError('');try{setRows(await repository.rpc('admin_grade_roster'));}catch(e){setError(e.message);}finally{setLoading(false);}}
 useEffect(()=>{load();},[repository]);
 return <section className="panel grade-admissions"><div className="section-heading"><div><h3>{uiText('Teacher invitations by grade')}</h3><p>{uiText('Approve the teacher email before sharing classroom access. Each grade has one regular teacher.')}</p></div></div>
 {loading&&<p role="status">{uiText('Loading grade registrations…')}</p>}
 {error&&<Notice error>{error}<Button variant="secondary" onClick={load}>{uiText('Try again')}</Button></Notice>}
 {notice&&<Notice>{notice}</Notice>}
 {!loading&&!error&&<div className="grade-admission-grid">{rows.map(row=><article key={row.grade_level}><h4>{uiText('Grade {0}',[row.grade_level])}</h4><p>{row.profile_id?(row.email_confirmed?uiText('Verified teacher'):uiText('Awaiting email confirmation')):row.invitation_ready?uiText('Invitation ready'):uiText('Teacher not assigned')}</p><p>{row.email||row.approved_email||uiText('Choose the approved teacher email.')}</p><small>{uiText('Retained students')}: {row.student_count}</small><div className="actions">
 {!row.profile_id&&<Button variant="secondary" onClick={()=>{action.setError('');setEdit(row);}}>{uiText(row.invitation_ready?'Reissue invitation':'Authorize teacher')}</Button>}
 {row.profile_id&&<Button variant="secondary" onClick={()=>{action.setError('');setRelease(row);}}>{uiText(row.email_confirmed?'Replace teacher':'Release pending registration')}</Button>}
 </div></article>)}</div>}
 {edit&&<Modal title={uiText('Authorize Grade {0} teacher',[edit.grade_level])} onClose={()=>setEdit(null)}><form className="form-stack" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);action.run(async()=>{const result=await repository.rpc('admin_authorize_grade',{p_grade:edit.grade_level,p_email:String(f.get('email')).trim(),p_days:Number(f.get('days')),p_reason:String(f.get('reason')).trim()});setIssued({...result,link:location.origin+'/#/register?grade='+result.grade_level+'&invite='+result.invitation_code});setEdit(null);await load();});}}>
 <Field label="Approved teacher email" name="email" type="email" required defaultValue={edit.approved_email||''}/><Select label="Invitation expires in" name="days" defaultValue="7" values={[[1,'1 day'],[7,'7 days'],[14,'14 days'],[30,'30 days']]}/><Field label="Reason" name="reason" required minLength={3}/><p>{uiText('The invitation works only for this email and grade. Reissuing cancels the previous unused invitation.')}</p>{action.error&&<Notice error>{action.error}</Notice>}<Button type="submit" disabled={action.busy}>{uiText('Create private invitation')}</Button></form></Modal>}
 {issued&&<Modal title={uiText('Private teacher invitation')} onClose={()=>setIssued(null)}><p>{issued.email} · {uiText('Grade {0}',[issued.grade_level])}</p><p>{uiText('Share this link only with the assigned teacher. Email confirmation is still required.')}</p><Field label="Invitation link" readOnly value={issued.link}/><Button onClick={()=>action.run(async()=>{await navigator.clipboard.writeText(issued.link);setNotice(uiText('Invitation link copied.'));})}>{uiText('Copy invitation link')}</Button>{action.error&&<Notice error>{action.error}</Notice>}</Modal>}
 {release&&<Modal title={uiText(release.email_confirmed?'Replace grade teacher':'Release pending registration')} onClose={()=>setRelease(null)}><form className="form-stack" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);action.run(async()=>{const result=await repository.api('/v1/admin/grades/'+release.grade_level+'/release',{expected_user_id:release.profile_id,mode:release.email_confirmed?'replace':'pending',reason:String(f.get('reason')).trim()});setNotice(uiText('Grade {0} released. Student records were retained.',[result.grade_level]));setRelease(null);await load();await refresh();});}}>
 <p><strong>{release.email}</strong> · {uiText('Grade {0}',[release.grade_level])}</p><p>{uiText('This closes the selected login. Student profiles and activity history stay available for the next approved teacher.')}</p><p>{uiText('Owned student profiles')}: {release.owned_student_count} · {uiText('Recorded activities')}: {release.owned_attempt_count}</p><Field label="Reason" name="reason" required minLength={3}/><label className="checkbox"><input type="checkbox" required/>{uiText('I confirm the selected grade and teacher account.')}</label>{action.error&&<Notice error>{action.error}</Notice>}<Button type="submit" disabled={action.busy}>{uiText('Confirm grade release')}</Button></form></Modal>}
 </section>;
}
export function AccountModeBanner(){
 const {user,data}=useApp();
 if(user?.account_kind==='review')return <div className="review-mode-banner" role="status">{uiText('Review / demonstration account · Grades 1–6 · Demo students and results')}</div>;
 if(user?.role==='administrator'&&data?.demo_students_hidden)return <div className="review-mode-banner">{uiText('Demonstration student records are excluded from school reports.')}</div>;
 return null;
}
