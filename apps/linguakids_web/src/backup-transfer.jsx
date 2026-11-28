import {useState} from 'react';
import {useApp} from './context';
import {uiText} from './i18n';
import {Button,Field,Notice,useAction} from './ui';
export function OnlineBackupTransfer(){
 const {repository,user,refresh}=useApp(),action=useAction();
 const [file,setFile]=useState(null),[result,setResult]=useState(null),[archives,setArchives]=useState(null);
 if(repository.collection||repository.preview||user.role!=='educator')return null;
 async function load(){setArchives(await repository.api('/v1/offline/archives'));}
 return <details className="backup-transfer"><summary>{uiText('Transfer offline data & audio backups')}</summary>
 <p>{uiText('Export a ZIP from the offline application, then upload it here using the same educator account. Keep the original ZIP and a USB copy.')}</p>
 <p>{uiText('Original audio, drafts, notes and answers are saved privately. Compatible activity results are checked again before they appear in the gradebook. Changed activities, classroom plans, new local materials and existing profile edits require teacher review from the backup.')}</p>
 <form className="form-stack" onSubmit={e=>{e.preventDefault();action.run(async()=>{setResult(null);const body=new FormData();body.append('file',file);setResult(await repository.api('/v1/offline/import',body));await refresh();await load();});}}>
 <Field label="Offline collection ZIP"><input aria-label={uiText('Offline collection ZIP')} type="file" accept=".zip,application/zip" required onChange={e=>{setFile(e.target.files[0]||null);setResult(null);}}/></Field>
 <Button type="submit" disabled={!file||action.busy}>{uiText(action.busy?'Saving and checking backup…':'Save backup & transfer results')}</Button>
 </form>
 {action.error&&<Notice error>{action.error}</Notice>}
 {result&&<Notice><strong>{uiText('Private backup saved.')}</strong><p>{uiText('New students: {0} · New activity results: {1} · Audio recordings retained: {2}',[result.students_added_this_transfer||0,result.activities_added_this_transfer||0,result.recordings_preserved||0])}</p>
 <p>{uiText('Items needing review: {0} · Existing profile edits in the archive: {1}',[result.items_needing_review||0,result.existing_profile_edits_in_archive||0])}</p>
 <p>{uiText('Reading baselines transferred: {0}',[result.reading_baselines_transferred||0])}</p>
 <p>{uiText('Guided mission responses checked: {0}',[result.guided_responses_checked||0])}</p>
 {!!result.pending_details?.length&&<details><summary>{uiText('Transfer review details')}</summary><ul>{result.pending_details.slice(0,20).map((item,index)=><li key={index}>{item.reason}</li>)}</ul></details>}
 {!!result.items_needing_review&&<p>{uiText('Transfer the same file again to continue a large collection. Changed or unavailable activities stay in the private backup for manual review.')}</p>}</Notice>}
 <Button variant="secondary" disabled={action.busy} onClick={()=>action.run(load)}>{uiText('Show my online backups')}</Button>
 {archives&&<ul>{archives.map(a=><li key={a.id}>{new Date(a.created_at).toLocaleString()} · {a.status} <Button variant="secondary" disabled={action.busy} onClick={()=>action.run(()=>repository.downloadCollectionArchive(a.id))}>{uiText('Download private backup')}</Button>{a.status==='needs_review'&&<Button variant="secondary" disabled={action.busy} onClick={()=>action.run(async()=>{setResult(await repository.api(`/v1/offline/archives/${encodeURIComponent(a.id)}/retry`,{},{signal:AbortSignal.timeout(240000)}));await refresh();await load();})}>{uiText('Continue saved transfer')}</Button>}</li>)}{!archives.length&&<li>{uiText('No online backups saved yet.')}</li>}</ul>}
 </details>;
}
export function ModelEvidence(){
 const{data}=useApp();const model=data?.model_status;
 if(!model)return null;
 return <details className="panel"><summary>{uiText('Actual AI service status & limitations')}</summary>
 <p>{uiText('Deployed translation model')}: <strong>{model.version||'Unknown'}</strong> · {model.available?uiText('Responding'):uiText('Unavailable')}</p>
 <p>{uiText('Reading recognition')}: {model.reading_ready?uiText('Responding'):uiText('Unavailable')}</p>
 <Notice>{uiText('The reading checker compares recognized words. It is not validated pronunciation grading. Child recordings scored by teachers are still needed before making accuracy claims.')}</Notice>
 <p>{uiText('A model name or dataset size does not prove translation quality. Independent evaluation and teacher review are required.')}</p>
 </details>;
}
