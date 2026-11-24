import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach,expect,it } from 'vitest';
import { fireEvent,render,screen } from '@testing-library/react';
import { MaterialReader } from './reader';
import { materialAvailableFor } from './domain';
import App from './App';
import { createPreviewRepository } from './preview';

const materials=JSON.parse(readFileSync(resolve(process.cwd(),'../../content/lessons/deped-topic-lessons.json'),'utf8'));
beforeEach(()=>{
  localStorage.clear();sessionStorage.clear();
  HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
  HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
});
it('keeps a single-grade educator on their assigned lessons and blocks other grades',async()=>{
  const repository=createPreviewRepository();
  await repository.enterPreview('educator');
  const originalProfile=repository.profile;
  repository.profile=async session=>({...await originalProfile(session),grade_levels:[6]});
  const snapshot=await repository.snapshot();
  repository.snapshot=async()=>({...snapshot,materials});
  window.history.replaceState(null,'','/#/workspace/lessons');
  render(<App repository={repository}/>);
  fireEvent.click(await screen.findByRole('button',{name:/^Filters/}));
  const grade=await screen.findByRole('combobox',{name:'Grade filter'});
  expect(grade.value).toBe('6');
  expect(document.querySelectorAll('.material-card')).toHaveLength(6);
  expect(screen.queryByRole('option',{name:'Grade 1',exact:true})).toBeNull();
  expect(document.querySelectorAll('.material-card')).toHaveLength(6);
  expect(screen.queryByRole('heading',{name:'English 1: Short a: cap and map'})).toBeNull();
  expect(screen.getByRole('heading',{name:'English 6: Reality and fantasy in stories'})).toBeTruthy();
});
it('provides six distinct, source-attributed bilingual lessons per grade and respects grade availability',()=>{
  expect(materials).toHaveLength(36);
  for(const grade of [1,2,3,4,5,6]){
    const matching=materials.filter(material=>material.grade_level===grade);
    expect(matching).toHaveLength(6);
    expect(matching.filter(material=>material.curriculum.learning_area==='English')).toHaveLength(3);
    expect(matching.filter(material=>material.curriculum.learning_area==='Filipino')).toHaveLength(3);
  }
  for(const material of materials){
    expect(material.body.pages).toHaveLength(4);
    expect(material.body.pages.every(page=>page.english.length>60&&page.filipino.length>60)).toBe(true);
    expect(new URL(material.body.source.url).hostname).toBe('lrmds.deped.gov.ph');
    expect(material.curriculum.alignment_status).toBe('pending_review');
    expect(material.curriculum.mapping_status).toBe('supplemental_enrichment');
    expect(materialAvailableFor(material,{grade_level:material.grade_level,adult_id:'fixture-adult'})).toBe(true);
    expect(materialAvailableFor(material,{grade_level:material.grade_level===6?1:6,adult_id:'fixture-adult'})).toBe(false);
  }
});
it('opens actual lesson content, progresses from teaching to feedback, and exposes source notes in teacher preview',()=>{
  const material=materials.find(row=>row.grade_level===2&&row.body.unit_title==='Choosing a or an');
  render(<MaterialReader material={material} onClose={()=>{}}/>);
  expect(screen.getByText(material.body.pages[0].english)).toBeTruthy();
  expect(screen.getByRole('button',{name:'Finish preview'}).disabled).toBe(true);
  fireEvent.click(screen.getByText('Lesson source & teaching notes'));
  expect(screen.getByRole('link',{name:/English 2 — Q1/}).getAttribute('href')).toBe('https://lrmds.deped.gov.ph/detail/20828');
  fireEvent.click(screen.getByRole('button',{name:'Next',exact:true}));
  expect(screen.getByText(material.body.pages[1].filipino)).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Next',exact:true}));
  expect(screen.getByText(material.body.pages[2].english)).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Next',exact:true}));
  expect(screen.getByText(material.body.pages[3].english)).toBeTruthy();
  expect(screen.getByRole('button',{name:'Finish preview'}).disabled).toBe(false);
});
