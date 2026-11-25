import React from 'react';
import {expect,it,vi} from 'vitest';
import {fireEvent,render,screen,within} from '@testing-library/react';
import {StudentRewards} from './StudentRewards';
import type {MissionRewards} from './types';

export function fixtureRewards():MissionRewards{
 return {alias:'Explorer ABC123',rank:2,tied:true,completed_missions:1,assigned_missions:2,completion_percent:50,placement_review_required:false,grade_level:1,source:'cloud_verified',class_size:12,earned_count:1,is_demo:false,ranking_basis:'completed_missions_then_assigned_percent',mission_badges:[{id:'first',title:'First verified mission',grade_level:1,difficulty:'beginner',awarded_at:'2026-11-01T00:00:00Z',verification:'verified'}],milestones:[{id:'missions-1',target:1,earned:true,progress:1},{id:'missions-3',target:3,earned:false,progress:1}],leaderboard:Array.from({length:12},(_,index)=>({alias:`Explorer CODE-${index+1}`,rank:index===0?1:2,tied:index>0,completed_missions:1,assigned_missions:2,completion_percent:50,placement_review_required:false,is_you:index===11}))};
}
it('shows verified mission badges, current progress, tied ranking and milestone progress',()=>{
 render(<StudentRewards rewards={fixtureRewards()} language="en"/>);
 expect(screen.getByText('First verified mission')).toBeTruthy();
 expect(screen.getByText('Verified school records')).toBeTruthy();
 expect(screen.getByRole('progressbar',{name:'3 missions finished'}).getAttribute('value')).toBe('1');
 expect(screen.getByText('Rankings are not quiz grades. Each mission earns one badge; retries do not add another. Earned badges stay in your history when the teacher updates current missions.')).toBeTruthy();
});
it('paginates class aliases and can reveal the learner’s own row without starting an activity',()=>{
 render(<StudentRewards rewards={fixtureRewards()} language="en"/>);
 fireEvent.click(screen.getByRole('button',{name:'Class ranking'}));
 expect(screen.queryByText(/Explorer CODE-12/)).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Find my row'}));
 expect(screen.getByText('Explorer CODE-12 · You')).toBeTruthy();
 expect(screen.getByRole('navigation',{name:'Ranking pages'}).textContent).toContain('2/2');
 expect((screen.getByRole('button',{name:'Next'}) as HTMLButtonElement).disabled).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'Previous'}));
 expect(screen.getByText('Explorer CODE-1')).toBeTruthy();
});
it('never labels laptop results as cloud verified',()=>{
 const data=fixtureRewards();data.source='local_pending_verification';data.mission_badges[0].verification='local_pending_verification';
 render(<StudentRewards rewards={data} language="en"/>);
 expect(screen.getByText('This laptop only · awaiting cloud verification')).toBeTruthy();
 expect(screen.getByText('Saved · verification pending')).toBeTruthy();
 expect(screen.queryByText('Verified school records')).toBeNull();
});
it('does not invent awards or first place for missing/zero-completion data',()=>{
 const data=fixtureRewards();Object.assign(data,{rank:null,earned_count:0,completed_missions:0,mission_badges:[],leaderboard:[]});
 render(<StudentRewards rewards={data} language="en"/>);
 expect(screen.getByText('Finish one mission to join the ranking.')).toBeTruthy();
 expect(screen.queryByText('First verified mission')).toBeNull();
});
it('explains that a changed placement must be reviewed',()=>{
 const data=fixtureRewards();data.placement_review_required=true;data.rank=null;
 render(<StudentRewards rewards={data} language="en"/>);
 expect(screen.getByText('Your teacher needs to reconfirm the changed mission placement before ranking.')).toBeTruthy();
});
it('renders aliases as text and does not show unintended peer metadata',()=>{
 const data=fixtureRewards();data.leaderboard=[{...data.leaderboard![0],alias:'<img src=x onerror=alert(1)>'}];
 const {container}=render(<StudentRewards rewards={data} language="en"/>);
 fireEvent.click(screen.getByRole('button',{name:'Class ranking'}));
 expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy();
 expect(container.querySelector('img')).toBeNull();
});
it('keeps the rewards screen bilingual and marks design data explicitly',()=>{
 const data=fixtureRewards();data.source='preview';
 render(<StudentRewards rewards={data}/>);
 expect(screen.getByRole('heading',{name:'Mga medalya sa mission'})).toBeTruthy();
 expect(screen.getByText('Halimbawa lamang · walang school records na binabago')).toBeTruthy();
});
it('gives an honest reload state when reward data is unavailable',()=>{
 render(<StudentRewards language="en"/>);
 expect(screen.getByRole('status').textContent).toContain('Refresh the map');
 expect(screen.queryByRole('heading',{name:/Class ranking/})).toBeNull();
});
