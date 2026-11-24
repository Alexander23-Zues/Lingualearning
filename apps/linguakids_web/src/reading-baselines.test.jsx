import {beforeEach,expect,it,vi} from 'vitest';
import {fireEvent,render,screen} from '@testing-library/react';
import {baselineRows,baselineExport,baselineValue,ClassBaselines,StudentBaselines} from './reading-baselines';
const child={id:'child',nickname:'Test learner',grade_level:1};
const data={child_id:'child',language:'fil',assessment_date:'2026-09-15',assessment_type:'BoSY',reading_profile:'High Emerging Reader',letter_sounds:7,rhymes:null,sentences:5,part1_total:22,part1_level:'Light Refresher',story_number:1,total_story_words:51,words_read:25,miscues:26,reading_seconds:67,wpm:22,accuracy_percent:49,comprehension_correct:null,quality_flags:['duration_exceeds_form_one_minute','comprehension_not_recorded']};
const record={id:'baseline',kind:'reading_assessment',data};
beforeEach(()=>{localStorage.clear();HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};});
it('scopes source records to the visible classroom and never treats them as quiz attempts',()=>{
 expect(baselineRows([record,{...record,id:'other',data:{...data,child_id:'other'}},{...record,kind:'session'}],[child])).toHaveLength(1);
 expect(baselineExport(baselineRows([record],[child]))[1][17]).toBe('');
 expect(baselineValue({...data,comprehension_correct:0},'comprehension_correct','/5')).toBe('0/5');
 expect(baselineValue(data,'comprehension_correct')).toBe('Not recorded');
 expect(baselineValue({...data,story_number:null},'comprehension_correct')).toBe('Not administered');
 expect(baselineValue(data,'rhymes')).toBe('Not administered');
});
it('preserves source labels, flags and missing values without changing English placement',()=>{
 render(<StudentBaselines child={child} records={[record]}/>);
 expect(screen.getByText('High Emerging Reader')).toBeTruthy();
 expect(screen.getByText('22 / 30')).toBeTruthy();
 expect(screen.getByText('67 s')).toBeTruthy();
 expect(screen.getByText(/English placement: awaiting/)).toBeTruthy();
 expect(screen.getByText(/Comprehension was not recorded/)).toBeTruthy();
 expect(screen.getByText(/10 automatic rhyme credits/)).toBeTruthy();
});
it('filters and paginates source rows and opens the correct student record',()=>{
 const onStudent=vi.fn(),students=Array.from({length:21},(_,i)=>({...child,id:`child-${i}`,nickname:`Learner ${String(i).padStart(2,'0')}`}));
 const records=students.map(c=>({...record,id:c.id,data:{...data,child_id:c.id}}));
 render(<ClassBaselines records={records} children={students} onClose={()=>{}} onStudent={onStudent}/>);
 expect(screen.getByText('Page 1 of 3')).toBeTruthy();fireEvent.click(screen.getByText('Next'));
 expect(screen.getByText('Page 2 of 3')).toBeTruthy();fireEvent.click(screen.getByText('Learner 10'));expect(onStudent).toHaveBeenCalledWith(students[10]);
 fireEvent.change(screen.getByPlaceholderText('Search student names'),{target:{value:'Learner 20'}});
 expect(screen.getByText('Page 1 of 1')).toBeTruthy();expect(screen.getByText('1 assessment records')).toBeTruthy();
});
