import {expect,it,vi} from 'vitest';
import {render,screen} from '@testing-library/react';
import {assignedGrades,scopeWorkspace} from './grade-scope';
const fixture=vi.hoisted(()=>({user:{role:'educator',grade_levels:[1]}}));
vi.mock('./context',()=>({useApp:()=>fixture}));
import {GradeSelect} from './grade-select';
it('fixes filters and student/material creation to the assigned grade',()=>{
  render(<GradeSelect label="Grade" name="grade" defaultValue={6} values={[[1,'Grade 1'],[6,'Grade 6']]}/>);
  expect(screen.getByRole('combobox',{name:'Grade'}).value).toBe('1');
  expect(screen.getAllByRole('option')).toHaveLength(1);
  expect(screen.queryByRole('option',{name:'Grade 6'})).toBeNull();
});
it('limits cached classroom data and progress without altering administrator scope',()=>{
  const state={materials:[{id:'g1',grade_level:1},{id:'g2',grade_level:2}],children:[{id:'c1',grade_level:1},{id:'c2',grade_level:2}],records:[{data:{grade_level:2}}],attempts:[{child_id:'c1',grade_level:1},{child_id:'c2',grade_level:2}]};
  const scoped=scopeWorkspace(state,fixture.user);
  expect(scoped.materials.map(m=>m.id)).toEqual(['g1']);expect(scoped.children.map(c=>c.id)).toEqual(['c1']);expect(scoped.attempts).toHaveLength(1);expect(scoped.records).toEqual([]);
  expect(scopeWorkspace(state,{role:'administrator'})).toBe(state);expect(assignedGrades(fixture.user)).toEqual([1]);
});

it('keeps offline responses pending and excludes them from scored progress',()=>{
 const state={children:[{id:'c',grade_level:1}],materials:[],records:[],attempts:[{child_id:'c',grade_level:1,assessment_type:'pending_online_scoring',correct_count:null,total_count:5}]};
 const result=scopeWorkspace(state,fixture.user);expect(result.attempts).toEqual([]);expect(result.pending_attempts).toHaveLength(1);
});
