import {useEffect,useRef,useState} from 'react';
import {useApp} from '../context';
import {Button,Notice,Select,useAction} from '../ui';
import {uiText,useUiLanguage} from '../i18n';
import {useTeacherProgress} from './TeacherProgressContext';

export function StudentRecordings({child}){
 useUiLanguage();const {repository,refresh}=useApp(),action=useAction(),progress=useTeacherProgress();
 const [rows,setRows]=useState([]),[next,setNext]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[message,setMessage]=useState(''),[playing,setPlaying]=useState(null);
 const [archiveId,setArchiveId]=useState(''),[transferOpen,setTransferOpen]=useState(false),[pending,setPending]=useState([]);
 const archives=[...new Set(rows.map(row=>row.archive_id).filter(Boolean))];
 const source=useRef(null),request=useRef(0);
 async function load(offset=0){const id=++request.current;setLoading(true);setError('');try{const result=await repository.api(`/v1/offline/recordings?child_id=${encodeURIComponent(child.id)}&offset=${offset}`);if(id===request.current){setRows(previous=>offset?[...previous,...result.items.filter(row=>!previous.some(old=>old.id===row.id))]:result.items);setNext(result.next_offset);}}catch(e){if(id===request.current)setError(e.message);}finally{if(id===request.current)setLoading(false);}}
 useEffect(()=>{setRows([]);setPlaying(null);setMessage('');setPending([]);setTransferOpen(false);void load();return()=>{request.current++;if(source.current)URL.revokeObjectURL(source.current);source.current=null;};},[child.id,repository]);
 useEffect(()=>{setArchiveId(previous=>archives.includes(previous)?previous:archives[0]||'');},[child.id,archives.join(',')]);
 async function listen(row){const current=request.current,blob=await repository.recordingAudio(row.archive_id,row.id);if(current!==request.current)return;if(source.current)URL.revokeObjectURL(source.current);source.current=URL.createObjectURL(blob);setPlaying({id:row.id,url:source.current});}
 async function check(row){
  const current=request.current;
  const result=await repository.api(`/v1/offline/recordings/${encodeURIComponent(row.archive_id)}/${encodeURIComponent(row.id)}/check`,{},{signal:AbortSignal.timeout(80000)});
  await progress.refresh();
  if(current!==request.current)return;
  if(result.recognition_status==='no_speech')setMessage(uiText('No speech detected. No reading credit was awarded.'));
  else if(result.recognition_status==='unclear')setMessage(uiText('The recording is unclear. Review the audio and current mission before deciding whether teacher approval is appropriate.'));
  else setMessage(uiText('Reading evidence updated. Check the remaining story parts, then update results from the saved backup.'));
  if(result.recognition_status!=='no_speech'){setArchiveId(row.archive_id);setTransferOpen(true);}
 }
 async function retry(){
  const current=request.current;
  const result=await repository.api(`/v1/offline/archives/${encodeURIComponent(archiveId)}/retry`,{},{signal:AbortSignal.timeout(240000)});
  await Promise.all([refresh?.(),progress.refresh()]);
  if(current!==request.current)return;
  setMessage(uiText('Saved backup checked: {0} new results; {1} items still need review.',[result.activities_added_this_transfer||0,result.items_needing_review||0]));
  setPending(result.pending_details||[]);
 }
 return <section className="student-recordings"><h3>{uiText('Saved story recordings')}</h3><p>{uiText('Listen to collected audio before reviewing reading progress. Recognition compares heard words; it is not a validated pronunciation grade.')}</p>
 {repository.collection&&<Notice>{uiText('Recordings are saved on this laptop. Export a backup and transfer it online for fresh AI recognition. Teacher reading review is available in Mission progress.')}</Notice>}
 {child.active===false&&<Notice>{uiText('This learner is inactive. You can listen to historical audio; reactivate the profile before recording new reading evidence.')}</Notice>}
 {error&&<Notice error>{error}</Notice>}{action.error&&<Notice error>{action.error}</Notice>}{message&&<Notice>{message}</Notice>}
 {!!pending.length&&<div className="notice"><strong>{uiText('Still needs review')}</strong><ul>{[...new Set(pending.map(item=>item.reason))].slice(0,5).map(reason=><li key={reason}>{reason}</li>)}</ul></div>}
 {!repository.collection&&archives.length>0&&<details className="panel recording-transfer" open={transferOpen} onToggle={event=>setTransferOpen(event.currentTarget.open)}><summary>{uiText('Finish offline result transfer')}</summary><p>{uiText('After checking the story recordings or approving observed reading, recheck this saved backup. Verified responses update the mission map and gradebook without another ZIP upload. A backup may contain several learners.')}</p><Select label="Saved backup" value={archiveId} disabled={action.busy} onChange={event=>{setArchiveId(event.target.value);setPending([]);setMessage('');}} values={archives.map((id,index)=>[id,uiText('Backup {0}',[index+1])])}/><Button disabled={action.busy||!archiveId} onClick={()=>action.run(retry)}>{uiText(action.busy?'Updating verified progress…':'Update results from saved backup')}</Button></details>}
 <Button variant="secondary" disabled={loading||action.busy} onClick={()=>load()}>{uiText('Refresh recordings')}</Button>
 {loading&&<p role="status">{uiText('Loading recordings…')}</p>}{!loading&&!error&&!rows.length&&<Notice>{uiText('No collected recordings found for this learner. Online-only recordings are processed for the request and are not retained here.')}</Notice>}
 <div className="recording-list">{rows.map(row=><article className="panel" key={row.id}><strong>{row.expected_text||uiText('Story recording')}</strong><p>{row.saved_at?new Date(row.saved_at).toLocaleString():''} · {Math.round(row.duration_seconds||0)}s · {uiText(row.complete?'Complete recording':'Partial recording')}</p>
 <div className="actions"><Button variant="secondary" disabled={action.busy||!row.playable} onClick={()=>action.run(()=>listen(row))}>{uiText('Listen to recording')}</Button>
 {!repository.collection&&<Button disabled={action.busy||child.active===false||!row.playable||!row.complete||!row.adventure_step_id||row.part_index==null||row.language!=='en'} onClick={()=>action.run(()=>check(row))}>{uiText('Check English reading')}</Button>}</div>
 {Number.isInteger(row.page)&&Number.isInteger(row.part_index)&&<p>{uiText('Page {0} · Reading part {1}',[row.page+1,row.part_index+1])}</p>}
 {playing?.id===row.id&&<audio controls autoPlay src={playing.url} aria-label={uiText('Student recording playback')}/>}
 {!row.playable&&<p>{uiText('Keep the original private backup. Transfer it again to prepare playback.')}</p>}</article>)}</div>
 {next!=null&&<Button disabled={loading||action.busy} variant="secondary" onClick={()=>load(next)}>{uiText('Load more recordings')}</Button>}
 </section>;
}
