import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MaterialReader} from './reader';
import {educatorNav} from './domain';
let app, speechStatus = 'idle';
vi.mock('./context',()=>({useApp:()=>app}));
vi.mock('./speech',async original=>({...await original(),useSpeechState:()=>({status:speechStatus,error:''}),usePreparedSpeech:()=>({ready:true}),prepareSpeech:vi.fn(async()=>{}),stopSpeech:vi.fn()}));
const story={id:'story-fixture',title:'Story practice',kind:'story',grade_level:1,body:{pages:[{english:'The book is on the table.',filipino:'Ang aklat ay nasa mesa.'},{english:'The cat is under the chair.',filipino:'Nasa ilalim ng upuan ang pusa.'}]}};
beforeEach(()=>{
 speechStatus='idle';
 HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')};
 HTMLDialogElement.prototype.close=function(){this.removeAttribute('open')};
 app={user:{grade_levels:[1]},child:{token:'student-test-token'},repository:{api:vi.fn(async(_,form)=>({transcript:form.get('expected_text'),matched_words:['the'],missing_words:[],word_results:[{word:'The',correct:true}]}))}};
});
afterEach(()=>vi.unstubAllGlobals());
it('checks the current story passage with student credentials, rejects silence and resets when the page or language changes',async()=>{
 let microphone;const stop=vi.fn();
 vi.stubGlobal('navigator',{...navigator,mediaDevices:{getUserMedia:vi.fn(async()=>({getTracks:()=>[{stop}]}))}});
 vi.stubGlobal('URL',class extends URL{static createObjectURL(){return 'blob:story-test'}static revokeObjectURL(){}});
 vi.stubGlobal('AudioWorkletNode',class{port={};constructor(){microphone=this}connect(target){return target}disconnect(){}});
 vi.stubGlobal('AudioContext',class{sampleRate=16000;audioWorklet={addModule:async()=>{}};destination={};createMediaStreamSource(){return{connect:target=>target}}createBiquadFilter(){return{frequency:{},Q:{},connect:target=>target}}createGain(){return{gain:{value:1},connect(){}}}async resume(){}async close(){}});
 render(<MaterialReader material={story} student onClose={()=>{}}/>);
 expect(screen.queryByRole('textbox',{name:'Story words to read'})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Practice reading this story'}));
 const passage=screen.getByRole('textbox',{name:'Story words to read'});
 expect(passage.readOnly).toBe(true);expect(passage.value).toBe(story.body.pages[0].english);
 expect(screen.queryByRole('checkbox',{name:'Save word counts for this recording'})).toBeNull();
 async function capture(value){fireEvent.click(screen.getByRole('button',{name:/Start recording/}));const button=await screen.findByRole('button',{name:'Stop recording'});microphone.port.onmessage({data:new Float32Array(320).fill(value)});fireEvent.click(button);}
 await capture(0);expect(screen.getByRole('button',{name:'Check my reading'}).disabled).toBe(true);expect(app.repository.api).not.toHaveBeenCalled();
 await capture(.12);fireEvent.click(screen.getByRole('button',{name:'Check my reading'}));await screen.findByText("Here's what we heard");
 const [path,form]=app.repository.api.mock.calls[0];expect(path).toBe('/v1/ai/student-reading');expect(form.get('expected_text')).toBe(story.body.pages[0].english);expect(form.get('language')).toBe('en');expect(form.get('student_token')).toBe('student-test-token');
 fireEvent.click(screen.getByRole('button',{name:'Next',exact:true}));expect(screen.getByRole('textbox',{name:'Story words to read'}).value).toBe(story.body.pages[1].english);expect(screen.queryByText("Here's what we heard")).toBeNull();expect(screen.getByRole('button',{name:'Check my reading'}).disabled).toBe(true);
 fireEvent.change(screen.getByRole('combobox',{name:'Reading language'}),{target:{value:'fil'}});expect(screen.getByRole('textbox',{name:'Story words to read'}).value).toBe(story.body.pages[1].filipino);
 fireEvent.click(screen.getByRole('button',{name:/Start recording/}));await screen.findByRole('button',{name:'Stop recording'});const calls=stop.mock.calls.length;fireEvent.click(screen.getByRole('button',{name:'Close reading practice'}));await waitFor(()=>expect(stop.mock.calls.length).toBeGreaterThan(calls));
});
it('keeps offline stories readable and does not expose online recording controls',()=>{
 render(<MaterialReader material={story} offlinePractice onClose={()=>{}}/>);
 expect(screen.getByText('Connect to the internet to record and check your story reading.')).toBeTruthy();
 expect(screen.queryByRole('button',{name:'Practice reading this story'})).toBeNull();
 expect(screen.getByRole('button',{name:'Next',exact:true})).toBeTruthy();
 expect(educatorNav.some(([key])=>key==='reading')).toBe(false);
});
it('does not add story recording controls to lessons',()=>{
 render(<MaterialReader material={{...story,kind:'lesson'}} onClose={()=>{}}/>);
 expect(screen.queryByRole('button',{name:'Practice reading this story'})).toBeNull();
});
it('keeps a long story in short visible recording parts instead of repeating the full page',()=>{
 const longText='We read a wonderful story together in our classroom. '.repeat(12).trim();
 render(<MaterialReader material={{...story,body:{pages:[{english:longText,filipino:'Mahabang kuwento.'}]}}} onClose={()=>{}}/>);
 fireEvent.click(screen.getByRole('button',{name:'Practice reading this story'}));
 const text=screen.getByRole('textbox',{name:'Story words to read'});
 expect(text.value.length).toBeLessThanOrEqual(72);
 expect(text.value.split(/\s+/).length).toBeLessThanOrEqual(8);
 expect(screen.getByRole('combobox',{name:'Reading language'}).value).toBe('en');
 expect(document.querySelector('.story-art')).toBeNull();
 expect(document.querySelector('.bilingual')).toBeNull();
 const previous=text.value;
 fireEvent.click(screen.getByRole('button',{name:'Next part',exact:true}));
 expect(text.value).not.toBe(previous);
 expect(screen.getByRole('button',{name:'Check my reading'}).disabled).toBe(true);
});
it('shows one stop-reading control when practice is open',()=>{
 speechStatus='playing';
 render(<MaterialReader material={story} onClose={()=>{}}/>);
 expect(screen.getAllByRole('button',{name:'Stop reading',exact:true})).toHaveLength(1);
 fireEvent.click(screen.getByRole('button',{name:'Practice reading this story'}));
 expect(screen.getAllByRole('button',{name:'Stop reading',exact:true})).toHaveLength(1);
});
