import {beforeEach,expect,it,vi} from 'vitest';
import {fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {TeacherPlacement} from './TeacherPlacement';
import {normalizeMissionBands,addMission} from './mission-difficulty';
import {learnerProgress} from './teacher-progress';
const fixture=vi.hoisted(()=>({repository:{rpc:vi.fn()},data:{records:[]},refresh:vi.fn()}));
vi.mock('../context',()=>({useApp:()=>fixture}));
const child={id:'synthetic-child',grade_level:1};
const path=()=>({revision:7,stages:Array.from({length:6},(_,index)=>({id:`mission-${index+1}`,title:`Mission ${index+1}`,difficulty:['beginner','intermediate','advanced'][Math.floor(index/2)],steps:[]}))});
beforeEach(()=>{vi.clearAllMocks();fixture.data.records=[];fixture.repository.rpc.mockImplementation(async name=>name==='educator_adventure'?path():name==='educator_placement'?{placement:null,has_started:false,adventure:{placement:null}}:{});});
it('does not substitute Mother Tongue data for English placement',async()=>{
 fixture.data.records=[{kind:'reading_assessment',data:{child_id:child.id,language:'fil'}}];render(<TeacherPlacement child={child}/>);
 expect(await screen.findByText('Awaiting the separate English assessment. Mother Tongue results do not set English placement.')).toBeTruthy();
 expect(screen.queryByRole('button',{name:'Confirm starting mission'})).toBeNull();
});
it('requires an explicit teacher decision using English evidence and the current mission revision',async()=>{
 fixture.data.records=[{id:'evidence-1',created_at:'2026-01-01',kind:'english_assessment',data:{child_id:child.id,assessment_date:'2026-01-01',source_title:'Synthetic English source',reading_profile:'Developing Reader',recommended_difficulty:'intermediate'}}];
 render(<TeacherPlacement child={child}/>);
 const select=await screen.findByLabelText('Teacher-approved starting mission');
 await waitFor(()=>expect(select.value).toBe('mission-3'));
 fireEvent.change(screen.getByLabelText('Teacher placement reason'),{target:{value:'Teacher reviewed the synthetic English evidence.'}});
 fireEvent.click(screen.getByLabelText('I reviewed the English assessment and confirm this starting mission.'));
 fireEvent.submit(screen.getByRole('button',{name:'Confirm starting mission'}).closest('form'));
 await waitFor(()=>expect(fixture.repository.rpc).toHaveBeenCalledWith('confirm_adventure_placement',{p_child_id:child.id,p_evidence_id:'evidence-1',p_stage_id:'mission-3',p_revision:7,p_reason:'Teacher reviewed the synthetic English evidence.'}));
});
it('normalizes legacy groups and inserts an empty draft without changing existing mission IDs',()=>{
 const normalized=normalizeMissionBands({revision:1,stages:Array.from({length:5},(_,i)=>({id:`old-${i}`,steps:[]}))});
 expect(normalized.stages.map(s=>s.difficulty)).toEqual(['beginner','beginner','intermediate','intermediate','advanced']);
 const updated=addMission(normalized,'intermediate');expect(updated.stages).toHaveLength(6);expect(updated.stages[4].difficulty).toBe('intermediate');
 expect(updated.stages.filter(s=>s.id.startsWith('old-')).map(s=>s.id)).toEqual(['old-0','old-1','old-2','old-3','old-4']);
});
it('excludes earlier unassigned work from completion totals without giving it credit',()=>{
 const summary=learnerProgress({adventure:{current_step_id:null,stages:[{id:'early',status:'not-assigned',steps:[{id:'old',status:'not-assigned'}]},{id:'assigned',status:'completed',steps:[{id:'new',status:'completed'}]}]}});
 expect(summary).toMatchObject({state:'completed',completed:1,total:1,percent:100});
});
