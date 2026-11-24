import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from './App';
import { createPreviewRepository } from './preview';
import { adminLegacyDestination, adminNav, canVisit } from './domain';

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); window.history.replaceState(null,'','/#/workspace/overview'); });
async function mount(path='/workspace/overview',role='administrator', prepare) {
  const repository=createPreviewRepository();
  await repository.enterPreview(role);
  if (prepare) await prepare(repository);
  const rpc=vi.spyOn(repository,'rpc');
  window.history.replaceState(null,'',`/#${path}`);
  render(<App repository={repository}/>);
  await screen.findByRole('navigation',{name:'Workspace navigation'});
  await waitFor(()=>expect(document.querySelector('.workspace-main .loading')).toBe(null));
  return {repository,rpc};
}
it('uses ten unique admin destinations while keeping educator destinations available',()=>{
  expect(adminNav).toHaveLength(10);
  expect(new Set(adminNav.map(([key])=>key)).size).toBe(10);
  for(const legacy of ['activities','quizzes','stories','datasets','training','models','insights']) {
    expect(adminNav.some(([key])=>key===legacy)).toBe(false);
    expect(adminLegacyDestination(legacy)).not.toBe(null);
    expect(canVisit({role:'administrator'},legacy)).toBe(true);
  }
  expect(canVisit({role:'educator'},'stories')).toBe(true);
  expect(canVisit({role:'educator'},'datasets')).toBe(false);
  expect(adminLegacyDestination('constructor')).toBe(null);
});
it('opens every old admin URL at its corresponding consolidated view without saving or deleting data',async()=>{
  const {rpc}=await mount();
  for(const legacy of ['activities','quizzes','stories','datasets','training','models','insights']) {
    window.location.hash=`#/workspace/${legacy}`;
    await waitFor(()=>expect(window.location.hash).toBe(`#${adminLegacyDestination(legacy)}`));
    await waitFor(()=>expect(document.querySelector('.workspace-main .loading')).toBe(null));
  }
  expect(await screen.findByRole('heading',{name:'Classroom participation',exact:true})).not.toBe(null);
  expect(rpc.mock.calls.filter(([name])=>/save|delete|approve|activate|queue/.test(name))).toEqual([]);
});
it('manages material types through one library, with a single create action',async()=>{
  await mount('/workspace/resources');
  const types=screen.getByRole('navigation',{name:'Material types'});
  fireEvent.click(within(types).getByRole('link',{name:'Quizzes',exact:true}));
  await screen.findByRole('heading',{name:'Quizzes & worksheets',level:2,exact:true});
  expect(screen.getAllByRole('button',{name:'Create material',exact:true})).toHaveLength(1);
  expect(document.querySelectorAll('.material-card')).toHaveLength(1);
  expect(screen.queryByRole('button',{name:'Save offline',exact:true})).toBe(null);
  expect(screen.getByRole('button',{name:'Review',exact:true})).not.toBe(null);
  expect(screen.getByText(/^Question banks \(/)).not.toBe(null);
  fireEvent.click(within(types).getByRole('link',{name:'Stories',exact:true}));
  await screen.findByRole('heading',{name:'Stories',level:2,exact:true});
  expect(document.querySelectorAll('.material-card')).toHaveLength(1);
});
it('keeps dataset records, training packages, and model approval accessible as separate AI tabs',async()=>{
  await mount('/workspace/ai?tab=datasets');
  const sections=screen.getByRole('navigation',{name:'AI sections'});
  expect(screen.getByRole('button',{name:'Create dataset',exact:true})).not.toBe(null);
  fireEvent.click(within(sections).getByRole('link',{name:'Packages',exact:true}));
  await screen.findByRole('button',{name:'Create training',exact:true});
  fireEvent.click(within(sections).getByRole('link',{name:'Models',exact:true}));
  await screen.findByRole('button',{name:'Import model & evaluation',exact:true});
  expect(screen.queryByRole('button',{name:'Start training job',exact:true})).toBe(null);
});
it('keeps dictionary word editing separate from vocabulary material management',async()=>{
  await mount('/workspace/dictionary');
  await screen.findByRole('button',{name:'Add word',exact:true});
  expect(screen.queryByRole('button',{name:'Create material',exact:true})).toBe(null);
});
it('does not repeat the participation dashboard in the operational overview',async()=>{
  await mount();
  expect(screen.getByRole('heading',{name:'Administration at a glance',exact:true})).not.toBe(null);
  expect(screen.queryByRole('heading',{name:'Progress by grade',exact:true})).toBe(null);
  expect(screen.getByRole('link',{name:/Submitted teaching materials/}).getAttribute('href')).toBe('#/workspace/resources?status=submitted');
});
it('paginates the full material list and resets the page when searching',async()=>{
  await mount('/workspace/resources','administrator',async(repository)=>{
    const data=await repository.snapshot();
    data.materials=Array.from({length:21},(_,index)=>({...data.materials[0],id:`material-${index+1}`,title:`Material ${index+1}`}));
    repository.snapshot=async()=>data;
  });
  expect(document.querySelectorAll('.material-card')).toHaveLength(20);
  fireEvent.click(screen.getByRole('button',{name:'Next page',exact:true}));
  expect(document.querySelectorAll('.material-card')).toHaveLength(1);
  expect(screen.getByRole('heading',{name:'Material 21',exact:true})).not.toBe(null);
  fireEvent.change(screen.getByRole('combobox',{name:'Items per page'}),{target:{value:'10'}});
  expect(document.querySelectorAll('.material-card')).toHaveLength(10);
  fireEvent.change(screen.getByRole('combobox',{name:'Jump to page'}),{target:{value:'3'}});
  expect(screen.getByRole('heading',{name:'Material 21',exact:true})).not.toBe(null);
  fireEvent.change(screen.getByRole('searchbox',{name:'Search',exact:true}),{target:{value:'Material 3'}});
  expect(screen.getByRole('heading',{name:'Material 3',exact:true})).not.toBe(null);
  expect(screen.queryByRole('navigation',{name:'Material pages'})).toBe(null);
});
