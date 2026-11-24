import {useEffect,useRef,useState} from 'react';
import {useApp} from '../context';
import {Button,Notice,useAction} from '../ui';
import {uiText,useUiLanguage} from '../i18n';

export function StudentRecordings({child}){
 useUiLanguage();const {repository}=useApp(),action=useAction();
 const [rows,setRows]=useState([]),[next,setNext]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[message,setMessage]=useState(''),[playing,setPlaying]=useState(null);
 const source=useRef(null),request=useRef(0);
 async function load(offset=0){const id=++request.current;setLoading(true);setError('');try{const result=await repository.api(`/v1/offline/recordings?child_id=${encodeURIComponent(child.id)}&offset=${offset}`);if(id===request.current){setRows(previous=>offset?[...previous,...result.items.filter(row=>!previous.some(old=>old.id===row.id))]:result.items);setNext(result.next_offset);}}catch(e){if(id===request.current)setError(e.message);}finally{if(id===request.current)setLoading(false);}}
 useEffect(()=>{setRows([]);setPlaying(null);setMessage('');void load();return()=>{request.current++;if(source.current)URL.revokeObjectURL(source.current);source.current=null;};},[child.id,repository]);
 async function listen(row){const current=request.current,blob=await repository.recordingAudio(row.archive_id,row.id);if(current!==request.current)return;if(source.current)URL.revokeObjectURL(source.current);source.current=URL.createObjectURL(blob);setPlaying({id:row.id,url:source.current});}
 return <section className="student-recordings"><h3>{uiText('Saved story recordings')}</h3><p>{uiText('Listen to collected audio before reviewing reading progress. Recognition compares heard words; it is not a validated pronunciation grade.')}</p>
 {repository.collection&&<Notice>{uiText('Recordings are saved on this laptop. Export a backup and transfer it online for fresh AI recognition. Teacher reading review is available in Mission progress.')}</Notice>}
 {error&&<Notice error>{error}</Notice>}{action.error&&<Notice error>{action.error}</Notice>}{message&&<Notice>{message}</Notice>}
 <Button variant="secondary" disabled={loading||action.busy} onClick={()=>load()}>{uiText('Refresh recordings')}</Button>
 {loading&&<p role="status">{uiText('Loading recordings…')}</p>}{!loading&&!error&&!rows.length&&<Notice>{uiText('No collected recordings found for this learner. Online-only recordings are processed for the request and are not retained here.')}</Notice>}
 <div className="recording-list">{rows.map(row=><article className="panel" key={row.id}><strong>{row.expected_text||uiText('Story recording')}</strong><p>{row.saved_at?new Date(row.saved_at).toLocaleString():''} · {Math.round(row.duration_seconds||0)}s · {uiText(row.complete?'Complete recording':'Partial recording')}</p>
 <div className="actions"><Button variant="secondary" disabled={action.busy||!row.playable} onClick={()=>action.run(()=>listen(row))}>{uiText('Listen to recording')}</Button>
 {!repository.collection&&<Button disabled={action.busy||!row.playable||!row.complete||!row.adventure_step_id||row.part_index==null||row.language!=='en'} onClick={()=>action.run(async()=>{const current=request.current,result=await repository.api(`/v1/offline/recordings/${encodeURIComponent(row.archive_id)}/${encodeURIComponent(row.id)}/check`,{},{signal:AbortSignal.timeout(80000)});if(current===request.current)setMessage(result.recognition_status==='no_speech'?uiText('No speech detected. No reading credit was awarded.'):uiText('Recognition checked. Refresh Mission progress to review the saved evidence; a teacher can review uncertain reading.'));})}>{uiText('Check English reading')}</Button>}</div>
 {playing?.id===row.id&&<audio controls autoPlay src={playing.url} aria-label={uiText('Student recording playback')}/>}
 {!row.playable&&<p>{uiText('Keep the original private backup. Transfer it again to prepare playback.')}</p>}</article>)}</div>
 {next!=null&&<Button disabled={loading||action.busy} variant="secondary" onClick={()=>load(next)}>{uiText('Load more recordings')}</Button>}
 </section>;
}
