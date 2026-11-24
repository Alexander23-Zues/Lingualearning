import {describe,it,expect} from 'vitest';
import {materialMissionSteps,refreshSequenceMaterials,sequenceNeedsLibraryUpdate} from './teacher-sequence';

describe('teacher mission content updates',()=>{
  it('prepares new material versions without pretending old credit completed the new task',()=>{
    const lesson={id:'lesson',kind:'lesson',title:'Revised lesson',version:2,grade_level:1,status:'published'};
    const path={revision:4,stages:[{id:'stage-1',title:'First mission',steps:[{id:'lesson:1:read',material_id:'lesson',material_version:1,kind:'lesson',status:'completed'}]}]};
    expect(sequenceNeedsLibraryUpdate(path,[lesson],1)).toBe(true);
    const updated=refreshSequenceMaterials(path,[lesson],1);
    expect(updated.revision).toBe(4);
    expect(updated.stages[0].steps[0]).toMatchObject({id:'lesson:2:read',title:'Revised lesson'});
    expect(updated.stages[0].steps[0].status).toBeUndefined();
    expect(path.stages[0].steps[0].id).toBe('lesson:1:read');
  });
  it('keeps order for current tasks, removes archived content, and includes both available game modes',()=>{
    const lesson={id:'lesson',kind:'lesson',title:'Lesson',version:1,grade_level:1,status:'published'};
    const game={id:'game',kind:'game',title:'Words',version:1,grade_level:1,status:'classroom',body:{pairs:[{en:'book',fil:'aklat'}]}};
    const archived={...lesson,id:'retired',status:'archived'};
    const wrongGrade={...lesson,id:'other-grade',grade_level:2};
    const path={revision:2,stages:[{id:'stage-1',steps:[{id:'retired:1:read',material_id:'retired',kind:'lesson'}]},{id:'stage-2',steps:materialMissionSteps(lesson)}]};
    const updated=refreshSequenceMaterials(path,[lesson,game,archived,wrongGrade],1);
    expect(updated.stages[0].steps.map(step=>step.id)).toEqual(['game:1:matching','game:1:word-builder']);
    expect(updated.stages[1].steps[0].id).toBe('lesson:1:read');
    expect(sequenceNeedsLibraryUpdate(updated,[lesson,game,archived,wrongGrade],1)).toBe(false);
  });
});
