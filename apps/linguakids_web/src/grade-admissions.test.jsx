import {beforeEach,expect,it,vi} from 'vitest';
import {fireEvent,render,screen,within} from '@testing-library/react';
const state=vi.hoisted(()=>({context:null}));
vi.mock('./context',()=>({useApp:()=>state.context}));
import {GradeAdmissions,AccountModeBanner} from './grade-admissions';
beforeEach(()=>{
 HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
 state.context={repository:{rpc:vi.fn(async()=>[{grade_level:1,student_count:10}]),api:vi.fn()},refresh:vi.fn()};
});
it('recovers a failed roster load without hiding the error',async()=>{
 const repo=state.context.repository;repo.rpc.mockRejectedValueOnce(new Error('Roster unavailable'));
 render(<GradeAdmissions/>);await screen.findByRole('alert');fireEvent.click(screen.getByRole('button',{name:'Try again'}));
 await screen.findByRole('button',{name:'Authorize teacher'});expect(repo.rpc).toHaveBeenCalledTimes(2);
});
it('binds private invitations to the selected grade and real email',async()=>{
 const repo=state.context.repository;render(<GradeAdmissions/>);fireEvent.click(await screen.findByRole('button',{name:'Authorize teacher'}));
 const modal=within(screen.getByRole('dialog'));fireEvent.change(modal.getByLabelText('Approved teacher email'),{target:{value:'teacher@school.edu.ph'}});fireEvent.change(modal.getByLabelText('Reason'),{target:{value:'Assigned adviser'}});
 repo.rpc.mockImplementation(async(name)=>name==='admin_authorize_grade'?{grade_level:1,email:'teacher@school.edu.ph',invitation_code:'a'.repeat(64)}:[{grade_level:1,student_count:10}]);
 fireEvent.submit(screen.getByRole('dialog').querySelector('form'));
 const link=await screen.findByLabelText('Invitation link');expect(link.value).toContain('/#/register?grade=1&invite=');
 expect(repo.rpc).toHaveBeenCalledWith('admin_authorize_grade',{p_grade:1,p_email:'teacher@school.edu.ph',p_days:7,p_reason:'Assigned adviser'});
});
it('retains a failed replacement reason and retries the exact selected account',async()=>{
 const repo=state.context.repository;repo.rpc.mockResolvedValue([{grade_level:2,email:'t@school.edu.ph',profile_id:'selected-id',email_confirmed:false,owned_student_count:12,owned_attempt_count:4}]);repo.api.mockRejectedValueOnce(new Error('Removal interrupted')).mockResolvedValueOnce({grade_level:2});
 render(<GradeAdmissions/>);fireEvent.click(await screen.findByRole('button',{name:'Release pending registration'}));
 let modal=within(screen.getByRole('dialog'));fireEvent.change(modal.getByLabelText('Reason'),{target:{value:'Abandoned registration'}});fireEvent.click(modal.getByRole('checkbox'));
 fireEvent.submit(screen.getByRole('dialog').querySelector('form'));await screen.findByText('Removal interrupted');expect(modal.getByLabelText('Reason').value).toBe('Abandoned registration');expect(state.context.refresh).not.toHaveBeenCalled();
 fireEvent.submit(screen.getByRole('dialog').querySelector('form'));await screen.findByText('Grade 2 released. Student records were retained.');expect(repo.api).toHaveBeenLastCalledWith('/v1/admin/grades/2/release',{expected_user_id:'selected-id',mode:'pending',reason:'Abandoned registration'});
});
it('labels the all-grade demonstration identity',()=>{
 state.context.user={role:'educator',account_kind:'review'};render(<AccountModeBanner/>);expect(screen.getByRole('status').textContent).toMatch(/demonstration.*Grades 1–6/);
});
