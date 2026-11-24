import {beforeEach,describe,expect,it,vi} from 'vitest';
import {fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import App from '../App';
import {createPreviewRepository} from '../preview';
import {gradebookMatrix,latestQuizAttempts} from '../domain';
import {learnerProgress,quizDevelopment} from './teacher-progress';

const child={id:'test-learner',nickname:'Mia Test',grade_level:1,adult_id:'preview-educator',active:true,learning_level:'beginner',avatar_key:'owl'};
const quiz={id:'test-quiz',title:'Word check',kind:'quiz',grade_level:1,version:1,status:'published',body:{questions:[]}};
const attempt=(id,correct,date,version=1)=>({id,submission_id:id,child_id:child.id,material_id:quiz.id,material_title:quiz.title,material_version:version,grade_level:1,activity_kind:'quiz',correct_count:correct,total_count:5,completed_at:date,stars:0});
const history=[attempt('first',2,'2026-11-20'),attempt('best',4,'2026-11-21'),attempt('latest',3,'2026-11-22')];
function learner(status='current'){
  const steps=[{id:'lesson:1:read',material_id:'lesson',title:'Read the lesson',kind:'lesson',status:'completed'},
    {id:'test-quiz:1:read',material_id:quiz.id,material_version:1,title:quiz.title,kind:status==='needs_review'?'story':'quiz',status,score:status==='current'?{correct:3,total:5}:null,reading_checked:1,reading_total:2}];
  return {child_id:child.id,nickname:child.nickname,quiz_attempts:history,adventure:{revision:1,current_step_id:steps[1].id,stages:[{id:'stage-1',title:'First mission',status:'active',completed:1,total:2,steps}]}};
}
beforeEach(()=>{
  localStorage.clear();sessionStorage.clear();vi.restoreAllMocks();
  HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
  HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
});
async function mount(route='students',status='current'){
  const repository=createPreviewRepository();await repository.enterPreview('educator');
  const base=await repository.snapshot();let record=learner(status);
  repository.snapshot=vi.fn(async()=>({...base,children:[child],materials:[quiz],attempts:history,records:[]}));
  const original=repository.rpc.bind(repository);
  repository.rpc=vi.fn(async(name,args)=>{
    if(name==='educator_adventure_progress')return [structuredClone(record)];
    if(name==='educator_adventure')return {revision:1,stages:record.adventure.stages};
    if(name==='approve_adventure_reading'){
      record.adventure.stages[0].steps[1]={...record.adventure.stages[0].steps[1],status:'current',teacher_approved:true};
      return {};
    }
    return original(name,args);
  });
  window.history.replaceState(null,'',`/#/workspace/${route}`);
  render(<App repository={repository}/>);
  await waitFor(()=>expect(repository.rpc.mock.calls.some(([name])=>name==='educator_adventure_progress')).toBe(true));
  return {repository,change:next=>{record=next;}};
}

describe('teacher progress integrity',()=>{
  it('keeps latest, best, first, true zero and quiz versions separate',()=>{
    const values=[...history,attempt('zero',0,'2026-11-23'),attempt('new-version',5,'2026-11-24',2),{...attempt('pending',null,'2026-11-25'),assessment_type:'pending_online_scoring'}];
    const rows=quizDevelopment(values);
    expect(rows).toHaveLength(2);
    expect(rows[0].first.correct_count).toBe(2);
    expect(rows[0].latest.correct_count).toBe(0);
    expect(rows[0].best.correct_count).toBe(4);
    expect(rows[0].attempts).toBe(4);
    expect(latestQuizAttempts(values)).toHaveLength(2);
    const matrix=gradebookMatrix({materials:[{...quiz,version:2}],attempts:values},[child]);
    expect(matrix.rows[0].cells.map(cell=>cell.text).sort()).toEqual(['0/5','5/5']);
  });
  it('never represents missing records or pending scoring as completed progress',()=>{
    expect(learnerProgress(null).percent).toBe(null);
    const pending=learner('pending_online_scoring');
    expect(learnerProgress(pending)).toMatchObject({state:'pending-scoring',completed:1,total:2});
    expect(learnerProgress(learner('needs_review')).state).toBe('reading-review');
    expect(learnerProgress(learner()).state).toBe('quiz-retry');
  });
  it('connects the roster to current missions and preserves every quiz result',async()=>{
    await mount();
    await screen.findByText('Word check');
    expect(screen.getByText('Word check')).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'Mission record & results'}));
    const dialog=await screen.findByRole('dialog');
    expect(within(dialog).getByText('Level 1: First mission')).toBeTruthy();
    expect(within(dialog).queryByRole('button',{name:/Start quiz/})).toBeNull();
    fireEvent.click(within(dialog).getByRole('button',{name:'Results & learning development'}));
    const latest=within(dialog).getByRole('columnheader',{name:'Latest grade'});
    const development=latest.closest('table');
    expect(within(development).getByRole('cell',{name:/3\/5 \(60%\)/})).toBeTruthy();
    expect(within(development).getByRole('cell',{name:'4/5 (80%)'})).toBeTruthy();
    expect(within(dialog).getAllByRole('row')).toHaveLength(6);
  });
  it('reflects a new student result on refresh without losing earlier attempts',async()=>{
    const {change}=await mount();
    await screen.findByText('Word check');
    const updated=learner();updated.adventure.current_step_id=null;updated.adventure.stages[0].status='completed';updated.adventure.stages[0].steps[1].status='completed';
    updated.quiz_attempts=[...history,attempt('passed',5,'2026-11-24')];change(updated);
    fireEvent.click(screen.getByRole('button',{name:'Refresh mission progress'}));
    await screen.findByText('All assigned missions finished');
    fireEvent.click(screen.getByRole('button',{name:'Mission record & results'}));
    const dialog=await screen.findByRole('dialog');fireEvent.click(within(dialog).getByRole('button',{name:'Results & learning development'}));
    expect(within(dialog).getAllByRole('cell',{name:'5/5 (100%)'})).toHaveLength(1);
    expect(within(dialog).getAllByRole('row')).toHaveLength(7);
  });
  it('refreshes the shared reading-review queue after approval',async()=>{
    const {repository}=await mount('journey?view=review','needs_review');
    fireEvent.click(await screen.findByRole('button',{name:'Review observed reading'}));
    const dialog=screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByRole('textbox',{name:'Teacher observation and reason'}),{target:{value:'Observed the full passage read clearly.'}});
    fireEvent.click(within(dialog).getByRole('checkbox'));
    fireEvent.submit(within(dialog).getByRole('button',{name:'Approve observed reading'}).closest('form'));
    await screen.findByText('No uncertain reading checks awaiting review.');
    expect(repository.rpc.mock.calls.filter(([name])=>name==='educator_adventure_progress').length).toBeGreaterThan(1);
    expect(repository.rpc.mock.calls.find(([name])=>name==='approve_adventure_reading')[1]).toMatchObject({p_child_id:child.id,p_step_id:'test-quiz:1:read'});
  });
  it('opens the student subset from the dashboard mission-status link',async()=>{
    await mount('home');
    const analytics=await screen.findByRole('region',{name:'Class learning analytics'});
    fireEvent.click(within(analytics).getByRole('link',{name:/Needs attention/}));
    await screen.findByRole('heading',{name:'Students & missions'});
    expect(screen.getByLabelText('Mission status').value).toBe('needs-attention');
    expect(screen.getByLabelText('Profile status').value).toBe('active');
    expect(screen.getByRole('button',{name:child.nickname})).toBeTruthy();
  });
});
