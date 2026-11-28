export const difficultyBands=['beginner','intermediate','advanced'];
export const readingProfiles=['Low Emerging Reader','High Emerging Reader','Developing Reader','Transitioning Reader','Reading At Grade Level','Other / teacher review'];
export function missionDifficulty(index,count){return difficultyBands[Math.min(2,Math.floor(index*3/Math.max(1,count)))];}
export function normalizeMissionBands(path){return {...path,stages:path.stages.map((stage,index)=>({...stage,difficulty:stage.difficulty||missionDifficulty(index,path.stages.length)}))};}
export function addMission(path,difficulty){
 const stage={id:'mission-'+crypto.randomUUID(),title:'New '+difficulty+' mission',subtitle:'Teacher preparation required',difficulty,steps:[]};
 return {...path,stages:[...path.stages,stage].sort((a,b)=>difficultyBands.indexOf(a.difficulty)-difficultyBands.indexOf(b.difficulty))};
}
