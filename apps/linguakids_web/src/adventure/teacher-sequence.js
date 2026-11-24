import {supportsWordGarden} from '../word-garden';

export function materialMissionSteps(material){
  const modes=material.kind==='game'?(supportsWordGarden(material.body?.pairs)?['matching','word-builder']:['matching']):['read'];
  return modes.map(mode=>({id:`${material.id}:${material.version}:${mode}`,material_id:material.id,material_version:material.version,title:material.title,kind:material.kind,...(material.kind==='game'?{mode}:{})}));
}

export function availableMissionMaterials(materials,grade){
  return materials.filter(material=>material.grade_level===Number(grade)&&['published','classroom'].includes(material.status));
}

export function sequenceNeedsLibraryUpdate(path,materials,grade){
  if(!path?.stages?.length)return false;
  const expected=new Set(availableMissionMaterials(materials,grade).flatMap(materialMissionSteps).map(step=>step.id));
  const actual=path.stages.flatMap(stage=>stage.steps.map(step=>step.id));
  return expected.size!==actual.length||actual.some(id=>!expected.has(id));
}

// Prepare an editable proposal; only save_adventure can activate it.
export function refreshSequenceMaterials(path,materials,grade){
  const available=availableMissionMaterials(materials,grade);
  const byMaterial=new Map(available.map(material=>[material.id,materialMissionSteps(material)]));
  const seen=new Set();
  const stages=path.stages.map(stage=>({...stage,steps:stage.steps.flatMap(previous=>{
    const step=byMaterial.get(previous.material_id)?.find(current=>current.kind!=='game'||current.mode===(previous.mode||'matching'));
    if(!step||seen.has(step.id))return [];
    seen.add(step.id);return [step];
  })}));
  const missing=available.flatMap(materialMissionSteps).filter(step=>!seen.has(step.id));
  if(stages.length)stages[0].steps.push(...missing);
  return {...path,stages};
}
