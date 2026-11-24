// Explicit laptop collection mode; no Supabase client, cloud auth, or cloud sync.
const notify=()=>window.dispatchEvent(new Event('collection:changed'));
function metadata(value){return btoa(Array.from(new TextEncoder().encode(JSON.stringify(value)),b=>String.fromCharCode(b)).join(''));}
export function createCollectionRepository(config={}){
  const account=config.COLLECTION_ACCOUNT_ID;
  if(!account || !/^[a-f0-9-]{36}$/i.test(account))throw new Error('This offline installation needs a prepared account identity.');
let dbPromise;
const db=()=>dbPromise ||= new Promise((resolve,reject)=>{const r=indexedDB.open('linguakids-field-outbox-'+account,1);r.onupgradeneeded=()=>r.result.createObjectStore('outbox',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
async function items(){const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction('outbox');const r=tx.objectStore('outbox').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function put(item){const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction('outbox','readwrite');tx.objectStore('outbox').put(item);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Device storage could not save the input.'));});}
async function acknowledged(item){const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction('outbox','readwrite'),s=tx.objectStore('outbox'),r=s.get(item.id);r.onsuccess=()=>{if(r.result?.revision===item.revision)s.delete(item.id);};tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}

  const listeners=new Set();let state={session:null,recovery:false},running=false,retry,lastRevision=0;
  let status={pending:0,error:'',lastSaved:null};const watchers=new Set();
  function emit(){listeners.forEach(fn=>fn(state));}
  function update(next){status={...status,...next};watchers.forEach(fn=>fn(status));notify();}
  async function request(path,body,options={}){
    const response=await fetch(path,{credentials:'same-origin',method:body===undefined?'GET':'POST',headers:body instanceof FormData?options.headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...options.headers},body:body instanceof FormData?body:body===undefined?undefined:JSON.stringify(body),signal:options.signal||AbortSignal.timeout(75000)});
    const value=await response.json().catch(()=>({}));if(!response.ok)throw new Error(value.detail||'The local database did not confirm a save. Keep the page open and retry.');return value;
  }
  async function flush(){
    if(running)return;running=true;clearTimeout(retry);
    try{
      for(const item of await items()){
        let response;
        if(item.kind==='audio'){
          response=await fetch('/collection/recordings/'+encodeURIComponent(item.id),{method:'POST',credentials:'same-origin',headers:{'Content-Type':'audio/wav','X-LinguaKids-Meta':metadata(item.payload),...(item.studentToken?{'X-Student-Token':item.studentToken}:{})},body:item.blob,signal:AbortSignal.timeout(20000)});
          if(!response.ok)throw new Error((await response.json()).detail||'Audio is waiting for the local database.');
        }else await request('/collection/drafts',item.payload,{headers:item.studentToken?{'X-Student-Token':item.studentToken}:{}});
        await acknowledged(item);update({lastSaved:new Date().toISOString(),error:''});
      }
      update({pending:(await items()).length,error:''});
    }catch(error){update({error:error.message,pending:(await items().catch(()=>[])).length});retry=setTimeout(flush,2500);}
    finally{running=false;}
    if(!status.error && (await items()).length)retry=setTimeout(flush,50);
  }
  async function captureDraft(payload,studentToken){
    const revision=lastRevision=Math.max(Date.now()*1000,lastRevision+1);const value={...payload,id:payload.id||crypto.randomUUID(),revision,captured_at:new Date().toISOString()};
    try{await put({id:value.id,kind:'draft',revision,payload:value,studentToken});update({pending:(await items()).length});void flush();return value;}
    catch(error){update({error:'Device storage failed. This input is not confirmed as saved. '+error.message});throw error;}
  }
  async function captureRecording(blob,payload,studentToken){
    const revision=payload.revision;try{
      await put({id:payload.id,kind:'audio',revision,payload:{...payload,captured_at:new Date().toISOString()},blob,studentToken});update({pending:(await items()).length});void flush();return {queued:true,id:payload.id};
    }catch(error){update({error:'The recording could not be saved. Keep this page open. '+error.message});throw error;}
  }
  window.addEventListener('online',flush);window.addEventListener('focus',flush);
  const saved=()=>update({lastSaved:new Date().toISOString()});
  const unavailable=()=>{throw new Error('Register and verify invited teacher accounts online. This offline installation uses its prepared educator account.');};
  return {
    collection:true,config,captureDraft,captureRecording,flush,
    collectionStatus:()=>status,subscribeCollection(fn){watchers.add(fn);items().then(rows=>{status={...status,pending:rows.length};fn(status);});return()=>watchers.delete(fn);},
    async initialize(){state=await request('/collection/session');if(state.session)void flush();return state;},subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
    profile:()=>request('/collection/profile'),async signIn(email,password,role){if(role==='administrator')throw new Error('Use Educator login for offline collection.');const value=await request('/collection/login',{email,password});state={session:value.session,recovery:false};emit();void flush();return value.profile;},
    async signOut(){await flush();if((await items()).length)throw new Error('Some inputs are still waiting for the local database. Retry saving before signing out.');await request('/collection/logout',{});state={session:null,recovery:false};emit();},
    register:unavailable,resetEmail:unavailable,resend:unavailable,updatePassword:unavailable,
    async rpc(name,parameters={}){const value=await request('/collection/rpc',{name,parameters});if(name.startsWith('save_')||name==='set_material_favorite')saved();return value;},
    snapshot:()=>request('/collection/rpc',{name:'workspace_snapshot'}),
    async studentRpc(name,parameters,token){const value=await request('/collection/student-rpc',{name,parameters:{...parameters,p_token:token}});if(name==='student_complete_material')saved();return value;},
    preferences:()=>request('/collection/preferences'),async savePreferences(_,values){await request('/collection/preferences',values);saved();},
    async api(path,body,options={}){if(['/v1/ai/jobs','/v1/ai/history'].includes(path))return[];const token=body instanceof FormData?body.get('student_token'):null;const recording=body instanceof FormData?body.get('collection_recording_id'):null;return request(path,body,{...options,headers:{...(token?{'X-Student-Token':token}:{}),...(recording?{'X-Recording-Id':recording}:{})}});},
    async speechAudio(text,language,token,signal){const response=await fetch('/v1/ai/speak',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json',...(token?{'X-Student-Token':token}:{})},body:JSON.stringify({text,language}),signal});if(!response.ok)throw new Error('Local voice is unavailable. The recording can still be collected.');return response.blob();},
    async health(){return(await request('/health')).storage==='sqlite';},async loadTable(name){if(name==='dictionary_entries')return[];throw new Error('This administrator page is online only.');},saveTable:unavailable,record:async id=>(await request('/collection/rpc',{name:'workspace_snapshot'})).records.find(r=>r.id===id),
    collectionStats:()=>request('/collection/stats'),async saveCollectionNote(data){const value=await request('/collection/notes',data);saved();return value;},
    async recordingAudio(_,id){const response=await fetch('/collection/audio/'+encodeURIComponent(id),{credentials:'same-origin'});if(!response.ok)throw new Error('The local recording could not be loaded.');return response.blob();},
    async exportCollection(){await flush();if((await items()).length)throw new Error('Some inputs are pending. Restore the local server and retry before exporting.');const response=await fetch('/collection/export');if(!response.ok)throw new Error('Backup export failed. Your database remains on this laptop.');const blob=await response.blob(),url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='LinguaKids-collection-'+new Date().toISOString().replaceAll(':','-')+'.zip';link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);return true;},
  };
}
