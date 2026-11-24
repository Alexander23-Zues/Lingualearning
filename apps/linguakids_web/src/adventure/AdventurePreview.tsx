import React, {useState} from 'react';
import {AdventureMap} from './AdventureMap';
import type {AdventureState,AdventureStep,ConnectionStatus,MapStage} from './types';
import {Modal} from '../ui';

const titles=['Arko ng Simula','Gubat ng Salita','Lawa ng Pagsubok','Bundok ng Karunungan','Karagatan ng Kuwento'];
export function previewAdventure(): AdventureState {
  const stages:MapStage[]=titles.map((title,index)=>{
    const steps:AdventureStep[]=(['lesson','game','story','quiz'] as const).map((kind,i)=>({
      id:`preview-${index}-${i}`,material_id:`preview-material-${index}-${i}`,material_version:1,
      title:({lesson:'A little seed, a big discovery',game:'Words in our garden',story:'A story with Tarsier',quiz:'My new discoveries'} as const)[kind],kind,
      ...(kind==='game'?{mode:'word-builder' as const}:{}),
      status:index===0?'completed':index===1&&i===0?'current':'locked',
    }));
    return{id:`stage-${index+1}`,title,subtitle:['Unang tuklas','Mga bagong salita','Subok at pagsasanay','Tuloy sa pagkatuto','Kuwento ng tagumpay'][index],steps,status:index===0?'completed':index===1?'active':'locked',completed:index===0?steps.length:0,total:steps.length};
  });
  return{revision:1,stages,current_step_id:'preview-1-0',quiz_pass_percent:80};
}
export function AdventurePreview(){
  const [adventure,setAdventure]=useState(previewAdventure),[selected,setSelected]=useState<AdventureStep|null>(null),[gate,setGate]=useState(false);
  const [connection,setConnection]=useState<ConnectionStatus>('online'),[calm,setCalm]=useState(false);
  function finishSample(){
    if(!selected)return;
    setAdventure(previous=>{
      const stages=structuredClone(previous.stages);const all=stages.flatMap(s=>s.steps);const item=all.find(s=>s.id===selected.id);if(item)item.status='completed';
      const next=all.find(s=>s.status!=='completed');if(next)next.status='current';
      let active=false;for(const stage of stages){stage.completed=stage.steps.filter(s=>s.status==='completed').length;stage.status=stage.completed===stage.total?'completed':!active?'active':'locked';if(stage.status==='active')active=true;}
      return{...previous,stages,current_step_id:next?.id||null};
    });setSelected(null);
  }
  return <>
    <AdventureMap student={{id:'sample-basti',nickname:'Basti',grade_level:3,avatar_key:'tarsier'}} adventure={adventure} stars={134} badges={['First steps','Learning explorer']} connection={connection} reducedMotion={calm} onStart={setSelected} onTeacher={()=>setGate(true)} preview previewControls={<><label>Preview connection <select aria-label="Preview connection" value={connection} onChange={e=>setConnection(e.target.value as ConnectionStatus)}>{(['online','offline-collection','awaiting-scoring','offline'] as ConnectionStatus[]).map(s=><option key={s}>{s}</option>)}</select></label><label><input type="checkbox" checked={calm} onChange={e=>setCalm(e.target.checked)}/> Reduced motion</label><span>Sample data only. No classroom results are saved here.</span></>}/>
    {selected&&<Modal title={selected.title} onClose={()=>setSelected(null)}><div className="quest-drawer"><p>This is a sample {selected.kind} interaction. The connected app opens the actual lesson, Word Garden, story recorder or quiz here.</p><p>Real quiz attempts are scored on the server and saved to the teacher’s gradebook. Sample clicks on this preview do not create classroom records.</p><button type="button" className="quest-primary" onClick={finishSample}>Complete sample step →</button></div></Modal>}
    {gate&&<Modal title="Educator verification" onClose={()=>setGate(false)}><p>The connected app requires the educator’s account verification to exit Student Mode. This design preview does not request or accept passwords.</p><button type="button" className="quest-primary" onClick={()=>setGate(false)}>Back to sample adventure</button></Modal>}
  </>;
}
