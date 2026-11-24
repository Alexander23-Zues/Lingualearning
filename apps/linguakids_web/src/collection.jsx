import {useEffect,useState} from 'react';
import {Link,Navigate,useLocation} from 'react-router-dom';
import {useApp} from './context';
import {Button,Field,Loading,Notice,Select,useAction} from './ui';
import './collection.css';

export function CollectionCapture(){
  const {repository,user,child,locked}=useApp(),location=useLocation();
  useEffect(()=>{
    if(!repository.collection||!user||!location.pathname.startsWith('/workspace')&&!location.pathname.startsWith('/student')&&location.pathname!=='/collection')return;
    function capture(event){
      const form=event.target.closest('form');if(!form||form.querySelector('input[type="password"]'))return;
      const fields={};form.querySelectorAll('input,textarea,select').forEach((input,index)=>{
        if(['password','file','hidden','submit','button'].includes(input.type)||/password|token|secret/i.test(input.name))return;
        const name=input.name||input.getAttribute('aria-label')||input.closest('label')?.querySelector('span')?.textContent||'field-'+index;
        fields[name]=input.type==='checkbox'?input.checked:input.value;
      });
      const id=form.dataset.collectionDraftId ||= crypto.randomUUID();
      void repository.captureDraft({id,kind:'form_draft',route:location.pathname,title:form.closest('dialog')?.querySelector('h1,h2,h3')?.textContent||document.querySelector('.workspace-main h2')?.textContent||'Collection form',child_id:locked?child?.child.id:null,fields},locked?child?.token:null).catch(()=>{});
    }
    document.addEventListener('input',capture);document.addEventListener('change',capture);return()=>{document.removeEventListener('input',capture);document.removeEventListener('change',capture);};
  },[repository,user?.id,location.pathname,child?.token,locked]);
  return null;
}
export function CollectionBanner(){
  const {repository,user,locked}=useApp();const[status,setStatus]=useState(repository.collectionStatus?.()||{});
  useEffect(()=>repository.collection?repository.subscribeCollection(setStatus):undefined,[repository]);
  if(!repository.collection)return null;
  return <aside className="collection-banner" aria-label="Offline collection status">
    <strong>Offline collection · this laptop</strong>
    <span role="status">{status.pending?`${status.pending} input(s) waiting for local disk`:status.lastSaved?'Saved to local database':'Local database · no cloud upload'}</span>
    {status.error&&<span role="alert">{status.error}</span>}
    {user&&!locked&&<Link to="/collection">Collection & backup</Link>}
    {status.pending>0&&<button type="button" onClick={()=>repository.flush()}>Retry local save</button>}
  </aside>;
}
export function CollectionPage(){
  const{repository,user,locked,child,data}=useApp(),action=useAction();const[stats,setStats]=useState(null);
  async function load(){try{setStats(await repository.collectionStats());}catch(e){action.setError(e.message);}}
  useEffect(()=>{if(repository.collection&&user&&!locked)load();},[repository,user?.id,locked]);
  if(!repository.collection)return <Navigate to="/workspace/home" replace/>;
  if(locked)return <Navigate to="/adult-unlock" replace/>;
  if(!user)return <Navigate to="/login" replace/>;
  return <main className="collection-page"><header><Link to="/workspace/home">← Educator workspace</Link><h1>Offline data collection</h1><p>Profiles, submitted responses, draft inputs, and recorded audio are stored on this laptop. This is a separate collection archive; it does not automatically change Railway grades.</p></header>
    <div className="actions"><Button onClick={()=>action.run(async()=>{await repository.exportCollection();await load();})} disabled={action.busy}>Export collection backup</Button><Button variant="secondary" onClick={load}>Refresh counts</Button></div>
    {action.error&&<Notice error>{action.error}</Notice>}
    {stats?<><section className="panel"><h2>Saved on this laptop</h2><div className="collection-counts">{[['Students',stats.students],['Submitted activities',stats.attempts],['Input drafts',stats.drafts],['Audio recordings',stats.recordings],['Collection notes',stats.notes]].map(([label,count])=><div key={label}><strong>{count}</strong><span>{label}</span></div>)}</div><p>Database: <code>{stats.saved_on_disk}</code></p><p>Automatic backup: <code>{stats.backup}</code></p><p>Export creates a ZIP with JSON, CSV, WAV audio, and checksums. Keep a second copy on your USB drive before leaving the client.</p></section>
    <section className="panel"><h2>Collected answer or teacher observation</h2><form className="form-stack" onSubmit={e=>{e.preventDefault();const form=e.currentTarget,f=new FormData(form);action.run(async()=>{await repository.saveCollectionNote({child_id:f.get('child')||null,recording_id:f.get('recording')||null,text:f.get('text'),human_transcript:f.get('transcript')||''});form.reset();await load();});}}>
      <Select label="Student" name="child" values={[["","General observation"],...(data?.children||[]).map(c=>[c.id,`${c.nickname} · Grade ${c.grade_level}`])]}/>
      <Field label="Recording ID (optional)" name="recording"/>
      <Field label="Typed answer or observation"><textarea required name="text" rows={3}/></Field>
      <Field label="Teacher-corrected transcript (optional)"><textarea name="transcript" rows={2}/></Field>
      <Button type="submit" disabled={action.busy}>Save collection note</Button>
    </form></section>
    <section className="panel"><h2>Recent recordings</h2><p>Audio is retained for this collection. A saved recording is not proof of correct pronunciation. Teacher review can be added above using its recording ID.</p>
      {stats.recent_recordings.map(r=>{const m=JSON.parse(r.metadata);return <article className="collection-record" key={r.id}><strong>{m.expected_text}</strong><small>{r.id} · {m.language} · {m.duration_seconds?.toFixed(1)} seconds · {m.complete?'Stopped normally':'Partial checkpoint'}</small><audio controls preload="none" src={'/collection/audio/'+r.id}/></article>;})}
      {!stats.recordings&&<p>No recordings saved yet. Open a student’s story and choose Practice reading this story.</p>}
    </section><section className="panel"><h2>Recovered input drafts</h2><p>Unsubmitted form inputs are retained here, including inputs from a closed form. Final activity results are listed separately in Reports & Gradebook.</p>
      {stats.draft_records.map(r=><details key={r.id}><summary>{r.title||r.kind} · {r.captured_at}</summary><pre>{JSON.stringify(r.fields||r.answers||r,null,2)}</pre></details>)}
    </section></>:<Loading text="Reading the local collection…"/>}
  </main>;
}
