import {beforeEach,expect,it,vi} from 'vitest';
import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {StudentRecordings} from './StudentRecordings';
const fixture=vi.hoisted(()=>({repository:{api:vi.fn(),recordingAudio:vi.fn()},refresh:vi.fn(),progressRefresh:vi.fn()}));
vi.mock('../context',()=>({useApp:()=>fixture}));
vi.mock('./TeacherProgressContext',()=>({useTeacherProgress:()=>({refresh:fixture.progressRefresh})}));
beforeEach(()=>{vi.clearAllMocks();fixture.repository.collection=false;fixture.repository.api.mockResolvedValue({items:[],next_offset:null});});
it('loads only the selected learner and explains retention limits',async()=>{
 render(<StudentRecordings child={{id:'synthetic-child'}}/>);
 expect(await screen.findByText('No collected recordings found for this learner. Online-only recordings are processed for the request and are not retained here.')).toBeTruthy();
 expect(fixture.repository.api).toHaveBeenCalledWith('/v1/offline/recordings?child_id=synthetic-child&offset=0');
});
it('requires exact English mission context before fresh recognition',async()=>{
 fixture.repository.api.mockResolvedValue({items:[{id:'audio-1',archive_id:'backup-1',playable:true,complete:true,language:'en',expected_text:'The bird.',adventure_step_id:'step',part_index:0}],next_offset:null});
 render(<StudentRecordings child={{id:'synthetic-child'}}/>);
 const check=await screen.findByRole('button',{name:'Check English reading'});expect(check.disabled).toBe(false);
 fixture.repository.api.mockResolvedValue({recognition_status:'no_speech'});fireEvent.click(check);
 await waitFor(()=>expect(fixture.repository.api).toHaveBeenCalledWith('/v1/offline/recordings/backup-1/audio-1/check',{},{signal:expect.anything()}));
 expect(await screen.findByText('No speech detected. No reading credit was awarded.')).toBeTruthy();
 expect(fixture.progressRefresh).toHaveBeenCalledTimes(1);
});
it('continues a saved backup after reading review and refreshes mission and gradebook data',async()=>{
 fixture.repository.api.mockResolvedValue({items:[{id:'audio-1',archive_id:'backup-1',playable:true,complete:true,language:'en',expected_text:'The bird.',adventure_step_id:'step',part_index:0}],next_offset:null});
 render(<StudentRecordings child={{id:'synthetic-child'}}/>);
 const check=await screen.findByRole('button',{name:'Check English reading'});
 fixture.repository.api.mockResolvedValueOnce({recognition_status:'recognized'});
 fireEvent.click(check);
 const update=await screen.findByRole('button',{name:'Update results from saved backup'});
 fixture.repository.api.mockResolvedValueOnce({activities_added_this_transfer:2,items_needing_review:1,pending_details:[{reason:'The next story still needs review.'}]});
 fireEvent.click(update);
 await waitFor(()=>expect(fixture.repository.api).toHaveBeenCalledWith('/v1/offline/archives/backup-1/retry',{},{signal:expect.anything()}));
 expect(await screen.findByText('Saved backup checked: 2 new results; 1 items still need review.')).toBeTruthy();
 expect(screen.getByText('The next story still needs review.')).toBeTruthy();
 expect(fixture.refresh).toHaveBeenCalledTimes(1);expect(fixture.progressRefresh).toHaveBeenCalledTimes(2);
});
it('keeps older or partial audio playable without offering unsupported grading',async()=>{
 fixture.repository.api.mockResolvedValue({items:[{id:'older',playable:true,complete:false,expected_text:'The bird.'}],next_offset:null});
 render(<StudentRecordings child={{id:'synthetic-child'}}/>);
 expect((await screen.findByRole('button',{name:'Check English reading'})).disabled).toBe(true);
 expect(screen.getByRole('button',{name:'Listen to recording'}).disabled).toBe(false);
});
it('keeps inactive learner audio playable without offering new reading evidence',async()=>{
 fixture.repository.api.mockResolvedValue({items:[{id:'older',playable:true,complete:true,expected_text:'The bird.',language:'en',adventure_step_id:'step',part_index:0}],next_offset:null});
 render(<StudentRecordings child={{id:'synthetic-child',active:false}}/>);
 expect((await screen.findByRole('button',{name:'Check English reading'})).disabled).toBe(true);
 expect(screen.getByRole('button',{name:'Listen to recording'}).disabled).toBe(false);
 expect(screen.getByText('This learner is inactive. You can listen to historical audio; reactivate the profile before recording new reading evidence.')).toBeTruthy();
});
