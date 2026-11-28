import {beforeEach,expect,it,vi} from 'vitest';
import {fireEvent,render,screen,within} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {TeacherClassRewards,TeacherRewardSummary} from './TeacherRewards';
import {download} from '../domain';
const fixture=vi.hoisted(()=>({repository:{collection:false},user:{account_kind:'teacher'},progress:{byGrade:{},errors:{},loading:false,refresh:vi.fn()}}));
vi.mock('../context',()=>({useApp:()=>fixture}));
vi.mock('./TeacherProgressContext',()=>({useTeacherProgress:()=>fixture.progress}));
vi.mock('../domain',async original=>({...await original(),download:vi.fn()}));
function rows(){return Array.from({length:12},(_,index)=>({child_id:`child-${index+1}`,nickname:`Student ${index+1}`,rewards:{alias:`Explorer ${index+1}`,rank:index+1,tied:false,completed_missions:1,assigned_missions:2,completion_percent:50,earned_count:1,is_demo:false,source:'cloud_verified',mission_badges:[]}}));}
beforeEach(()=>{vi.clearAllMocks();fixture.progress.byGrade={1:rows()};fixture.progress.errors={};fixture.progress.loading=false;fixture.repository.collection=false;fixture.user.account_kind='teacher';});
function mount(){return render(<MemoryRouter><TeacherClassRewards grade={1}/></MemoryRouter>);}
it('paginates rankings but exports all filtered pages with clear verification status',()=>{
 mount();expect(screen.queryByText('Explorer 12')).toBeNull();expect(screen.queryByText('Student 1')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Next'}));expect(screen.getByText('Explorer 12')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Export achievements CSV'}));
 const [filename,csv]=vi.mocked(download).mock.calls[0];expect(filename).toBe('Grade-1-mission-achievements.csv');
 expect(csv).toContain('Student 1');expect(csv).toContain('Student 12');expect(csv).toContain('cloud_verified');
 expect(csv.split('\r\n')).toHaveLength(13);
});
it('filters by student or alias, resets the page and links to the matching record',()=>{
 mount();fireEvent.click(screen.getByRole('button',{name:'Next'}));
 fireEvent.change(screen.getByLabelText('Search ranking'),{target:{value:'Explorer 3'}});
 expect(screen.getByText('Explorer 3')).toBeTruthy();expect(screen.queryByText('Explorer 12')).toBeNull();
 expect(screen.getByRole('link',{name:'Open record'}).getAttribute('href')).toBe('/workspace/students?student=child-3');
 expect(screen.getByText('Page 1 of 1')).toBeTruthy();
});
it('excludes demonstration rows from a real classroom ranking',()=>{
 fixture.progress.byGrade[1].push({child_id:'demo',nickname:'DEMO MUST NOT MIX',rewards:{...rows()[0].rewards,alias:'Demo explorer',is_demo:true}});
 mount();expect(screen.queryByText('Demo explorer')).toBeNull();
});
it('marks offline rankings as awaiting independent cloud verification',()=>{
 fixture.repository.collection=true;mount();
 expect(screen.getByText('Local collection only. Badges and rankings require independent cloud verification after transfer.')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Refresh achievements'}));expect(fixture.progress.refresh).toHaveBeenCalledOnce();
});
it('handles load failure without fabricating achievement records',()=>{
 fixture.progress.byGrade={};fixture.progress.errors={1:'Could not load verified progress'};mount();
 expect(screen.getByRole('alert').textContent).toContain('Could not load verified progress');
 expect(screen.queryByRole('table')).toBeNull();
 expect(screen.getByRole('button',{name:'Export achievements CSV'}).disabled).toBe(true);
});
it('shows a retained badge alongside the current mission-based ranking',()=>{
 render(<TeacherRewardSummary rewards={{...rows()[0].rewards,mission_badges:[{id:'mission',grade_level:1,title:'Retained mission badge',difficulty:'beginner',awarded_at:'2026-11-01T00:00:00Z',verification:'verified'}]}}/>);
 expect(screen.getByText('Retained mission badge')).toBeTruthy();
 expect(screen.getByText(/Badges retain completed mission history/)).toBeTruthy();
});
