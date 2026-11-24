import {beforeEach,expect,it} from 'vitest';
import {fireEvent,render,screen,within} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {missionDistribution,latestQuizAnalytics,matchesMissionFilter} from './teacher-analytics';
import {TeacherAnalytics} from './TeacherAnalytics';
import {setUiLanguage} from '../i18n';
const row=(id,state)=>({child:{id,grade_level:1},summary:{state}});
const attempt=(id,child,correct,date='2026-11-24T08:00:00Z',version=1)=>({id,child_id:child,material_id:'quiz',material_version:version,activity_kind:'quiz',correct_count:correct,total_count:5,completed_at:date});
beforeEach(()=>setUiLanguage('en'));
it('counts all workflow states once and keeps missing progress distinct',()=>{
 const groups=missionDistribution([row('a','not-started'),row('b','in-progress'),row('c','reading-review'),row('d','pending-scoring'),row('e','quiz-retry'),row('f','completed'),row('g','unavailable'),row('h','unprepared')]);
 expect(groups.map(group=>group.count)).toEqual([1,1,3,1,2]);
 expect(matchesMissionFilter('reading-review','needs-attention')).toBe(true);
 expect(matchesMissionFilter('unavailable','not-started')).toBe(false);
 expect(matchesMissionFilter('unprepared','not-ready')).toBe(true);
 expect(matchesMissionFilter('quiz-retry','quiz-retry')).toBe(true);
});
it('uses latest graded attempts per child and version, including a true zero',()=>{
 const records=[attempt('old','a',5,'2026-11-23T08:00:00Z'),attempt('latest','a',0),attempt('second','b',4),attempt('new-version','a',3,undefined,2)];
 const result=latestQuizAnalytics([...records,records[1]],new Set(['a','b']));
 expect(result).toMatchObject({count:3,students:2,average:(0+80+60)/3});
 expect(result.bands.map(band=>band.count)).toEqual([1,1,1]);
});
it('does not turn pending work, school baselines, other grades or missing marks into quiz scores',()=>{
 const source=[attempt('saved','a',4),{...attempt('pending','a',null,'2026-11-25T08:00:00Z'),assessment_type:'pending_online_scoring'},attempt('foreign','other',5),{...attempt('lesson','a',5),activity_kind:'lesson'}, {...attempt('empty','b',null)}, {...attempt('invalid','c',8)}];
 const result=latestQuizAnalytics(source,new Set(['a','b','c']));
 expect(result).toMatchObject({count:1,average:80,students:1});
 expect(latestQuizAnalytics([],new Set(['a']))).toMatchObject({count:0,average:null});
});
it('compares timestamps by instant across different timezone offsets',()=>{
 const result=latestQuizAnalytics([attempt('earlier','a',0,'2026-11-24T11:00:00+08:00'),attempt('later','a',5,'2026-11-24T04:00:00Z')],new Set(['a']));
 expect(result.average).toBe(100);
});
it('links status segments to the selected grade and shows readable result totals',()=>{
 render(<MemoryRouter><TeacherAnalytics rows={[row('a','in-progress'),row('b','not-started')]} attempts={[attempt('quiz','a',4)]} grade="1"/></MemoryRouter>);
 expect(screen.getByRole('link',{name:/In progress/}).getAttribute('href')).toBe('/workspace/students?grade=1&mission=in-progress&profile=active');
 expect(screen.getByRole('link',{name:'Open gradebook'}).getAttribute('href')).toBe('/workspace/reports?grade=1');
 expect(screen.getByText('Recorded results: 1 · Students: 1')).toBeTruthy();
 expect(screen.getByRole('img',{name:'80–100%: 1 / 1'})).toBeTruthy();
});
it('shows an honest empty state instead of a zero-percent performance grade',()=>{
 render(<MemoryRouter><TeacherAnalytics rows={[row('a','unavailable')]} attempts={[]} grade=""/></MemoryRouter>);
 expect(screen.getByText('No graded quiz results yet')).toBeTruthy();
 expect(screen.queryByText('Average latest score')).toBeNull();
});
