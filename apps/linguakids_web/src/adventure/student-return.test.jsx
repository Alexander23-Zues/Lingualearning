import {beforeEach,expect,it,vi} from 'vitest';
import {fireEvent,render,screen} from '@testing-library/react';
import {MemoryRouter,Route,Routes} from 'react-router-dom';
import {StudentAdventure} from './StudentAdventure';
const fixture=vi.hoisted(()=>({locked:true,lock:vi.fn(),childSession:vi.fn(),repository:{studentRpc:vi.fn()},child:{token:'synthetic-session',child:{id:'synthetic-child',nickname:'Test learner',grade_level:1,preferences:{}}}}));
vi.mock('../context',()=>({useApp:()=>fixture}));
vi.mock('../speech',()=>({stopSpeech:vi.fn()}));
beforeEach(()=>{
 vi.clearAllMocks();fixture.repository.studentRpc.mockResolvedValue({adventure:{stages:[],revision:1},materials:[],stars:0});
});
function mount(){render(<MemoryRouter initialEntries={['/student']}><Routes><Route path="/student" element={<StudentAdventure Reader={()=>null}/>}/><Route path="/adult-unlock" element={<h1>Educator verification gate</h1>}/></Routes></MemoryRouter>);}
it('returns from the student map to educator verification without unlocking classroom records',async()=>{
 mount();const button=await screen.findByRole('button',{name:'Back to teacher'});fireEvent.click(button);
 expect(await screen.findByRole('heading',{name:'Educator verification gate'})).toBeTruthy();
 expect(fixture.lock).not.toHaveBeenCalled();expect(fixture.childSession).not.toHaveBeenCalled();
});
it('also provides a way back when the adventure fails to load',async()=>{
 fixture.repository.studentRpc.mockRejectedValue(new Error('Service unavailable'));mount();
 await screen.findByText('Service unavailable');fireEvent.click(screen.getByRole('button',{name:/Back to teacher/}));
 expect(await screen.findByRole('heading',{name:'Educator verification gate'})).toBeTruthy();
 expect(fixture.lock).not.toHaveBeenCalled();
});
