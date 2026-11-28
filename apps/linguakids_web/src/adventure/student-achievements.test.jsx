import {beforeAll,beforeEach,expect,it,vi} from 'vitest';
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {StudentAdventure} from './StudentAdventure';
const fixture=vi.hoisted(()=>({locked:true,childSession:vi.fn(),repository:{studentRpc:vi.fn()},child:null}));
beforeAll(()=>{if(!HTMLDialogElement.prototype.showModal)HTMLDialogElement.prototype.showModal=function(){this.open=true;};if(!HTMLDialogElement.prototype.close)HTMLDialogElement.prototype.close=function(){this.open=false;};});
vi.mock('../context',()=>({useApp:()=>fixture}));
vi.mock('../speech',()=>({stopSpeech:vi.fn()}));
vi.mock('./AdventureMap',()=>({AdventureMap:({rewards,onStart,adventure})=><div><span>Loaded badges: {rewards?.earned_count||0}</span><button onClick={()=>onStart(adventure.stages[0].steps[0])}>Open fixture quiz</button></div>}));
const badge={id:'mission-one',grade_level:1,title:'Verified first mission',difficulty:'beginner',awarded_at:'2026-11-01T00:00:00Z',verification:'verified'};
function state(count=0){return {materials:[{id:'quiz',version:1,kind:'quiz'}],adventure:{revision:1,current_step_id:'quiz-step',stages:[{id:'mission-one',steps:[{id:'quiz-step',material_id:'quiz',material_version:1,kind:'quiz',status:'current'}]}]},rewards:{earned_count:count,mission_badges:count?[badge]:[]}};}
function Reader({onComplete,onClose}){return <button onClick={async()=>{await onComplete({},'fixture-submission');onClose();}}>Finish fixture quiz</button>;}
const content=()=> <MemoryRouter><StudentAdventure Reader={Reader}/></MemoryRouter>;
beforeEach(()=>{vi.clearAllMocks();fixture.child={token:'old-token',child:{id:'old-child',nickname:'Fixture',grade_level:1,preferences:{}}};});
it('celebrates only a newly saved badge and does not repeat it on a reload',async()=>{
 let completed=false;fixture.repository.studentRpc.mockImplementation(async name=>{if(name==='student_adventure_complete'){completed=true;return {adventure:state(1).adventure};}return state(completed?1:0);});
 render(content());await screen.findByText('Loaded badges: 0');fireEvent.click(screen.getByRole('button',{name:'Open fixture quiz'}));fireEvent.click(await screen.findByRole('button',{name:'Finish fixture quiz'}));
 expect(await screen.findByRole('heading',{name:'Bagong mission badge!'})).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Magpatuloy sa mapa'}));
 await waitFor(()=>expect(screen.queryByRole('heading',{name:'Bagong mission badge!'})).toBeNull());
 expect(screen.getByText('Loaded badges: 1')).toBeTruthy();
});
it('does not announce historical badges as newly earned on first load',async()=>{
 fixture.repository.studentRpc.mockResolvedValue(state(1));render(content());
 await screen.findByText('Loaded badges: 1');expect(screen.queryByRole('heading',{name:'Bagong mission badge!'})).toBeNull();
});
it('ignores a late response from a previous child session',async()=>{
 let finishOld;fixture.repository.studentRpc.mockImplementation((name,args,token)=>token==='old-token'?new Promise(resolve=>{finishOld=resolve;}):Promise.resolve(state(0)));
 const view=render(content());
 fixture.child={token:'new-token',child:{id:'new-child',nickname:'New fixture',grade_level:1,preferences:{}}};view.rerender(content());
 await screen.findByText('Loaded badges: 0');
 await act(async()=>{finishOld(state(1));});
 expect(screen.getByText('Loaded badges: 0')).toBeTruthy();expect(screen.queryByText('Verified first mission')).toBeNull();
});
