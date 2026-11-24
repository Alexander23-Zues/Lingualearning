import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from './App';
import { createPreviewRepository } from './preview';

beforeEach(()=>{
  localStorage.clear();sessionStorage.clear();
  HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
  HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
});
async function mount(path='/workspace/resources',role='administrator',prepare) {
  const repository=createPreviewRepository();await repository.enterPreview(role);
  if(prepare)await prepare(repository);
  const rpc=vi.spyOn(repository,'rpc');
  window.history.replaceState(null,'',`/#${path}`);
  render(<App repository={repository}/>);
  await screen.findByRole('navigation',{name:'Workspace navigation'});
  await waitFor(()=>expect(document.querySelector('.workspace-main .loading')).toBe(null));
  return {repository,rpc};
}
it('shows removable filters while their controls are collapsed and clears the status URL without losing the material type',async()=>{
  await mount('/workspace/resources?type=lesson&status=published');
  fireEvent.change(screen.getByRole('combobox',{name:'Grade filter'}),{target:{value:'1'}});
  const chips=screen.getByRole('group',{name:'Active material filters'});
  expect(within(chips).getByRole('button',{name:'Remove filter: Published'})).toBeTruthy();
  fireEvent.click(within(chips).getByRole('button',{name:'Remove filter: Grade 1'}));
  expect(screen.getByRole('combobox',{name:'Grade filter'}).value).toBe('');
  fireEvent.click(screen.getByRole('button',{name:'Remove filter: Published'}));
  expect(window.location.hash).toContain('type=lesson');
  expect(window.location.hash).not.toContain('status=');
  expect(screen.queryByRole('group',{name:'Active material filters'})).toBe(null);
});
it('recovers from an empty filtered list without changing any teaching material',async()=>{
  const {rpc}=await mount('/workspace/resources?type=lesson');
  fireEvent.change(screen.getByRole('searchbox',{name:'Search',exact:true}),{target:{value:'missing lesson xyz'}});
  await screen.findByRole('heading',{name:'No matching materials'});
  fireEvent.click(screen.getByRole('button',{name:'Clear filters',exact:true}));
  expect(screen.getByRole('searchbox',{name:'Search',exact:true}).value).toBe('');
  expect(document.querySelectorAll('.material-card')).toHaveLength(1);
  expect(rpc.mock.calls.some(([name])=>/save|review|delete/.test(name))).toBe(false);
});
it('paginates educator materials and trims search whitespace while resetting to the matching page',async()=>{
  await mount('/workspace/lessons','educator',async repository=>{
    const data=await repository.snapshot();
    data.materials=Array.from({length:21},(_,index)=>({...data.materials[0],id:`lesson-${index}`,title:`Learning page ${index+1}`}));
    repository.snapshot=async()=>data;
  });
  expect(document.querySelectorAll('.material-card')).toHaveLength(20);
  fireEvent.click(screen.getByRole('button',{name:'Next page',exact:true}));
  expect(screen.getByRole('heading',{name:'Learning page 21',exact:true})).toBeTruthy();
  fireEvent.change(screen.getByRole('searchbox',{name:'Search',exact:true}),{target:{value:'  Learning page 3  '}});
  expect(document.querySelectorAll('.material-card')).toHaveLength(1);
  expect(screen.getByRole('heading',{name:'Learning page 3',exact:true})).toBeTruthy();
});
it('explains the workflow and opens a new material of the currently selected type without saving anything',async()=>{
  const {rpc}=await mount('/workspace/resources?type=quiz');
  fireEvent.click(screen.getByRole('button',{name:'How it works',exact:true}));
  await screen.findByRole('heading',{name:'How Teaching Materials works'});
  expect(screen.getByText(/Teacher preview never records a student grade/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Create a material',exact:true}));
  expect(screen.getByRole('combobox',{name:'Material type'}).value).toBe('quiz');
  expect(rpc.mock.calls.some(([name])=>/save|review/.test(name))).toBe(false);
});
it('explains student visibility as the educator changes settings and keeps publication admin-only',async()=>{
  await mount('/workspace/lessons','educator');
  fireEvent.click(screen.getByRole('button',{name:'Create material',exact:true}));
  const dialog=screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByRole('combobox',{name:'Visibility'}),{target:{value:'classroom'}});
  expect(within(dialog).getByText(/Ready for your own students in the selected grade/)).toBeTruthy();
  fireEvent.change(within(dialog).getByRole('combobox',{name:'Visibility'}),{target:{value:'submitted'}});
  expect(within(dialog).getByText(/Waiting for an administrator to review/)).toBeTruthy();
  expect(within(dialog).queryByRole('option',{name:'published',exact:true})).toBe(null);
});
it('preserves review notes through preview and submits only an explicitly chosen decision',async()=>{
  const {rpc}=await mount('/workspace/resources?type=quiz');
  fireEvent.click(screen.getByRole('button',{name:'Review',exact:true}));
  const review=screen.getByRole('dialog');
  expect(within(review).getByRole('button',{name:'Save review'}).disabled).toBe(true);
  fireEvent.change(within(review).getByRole('textbox',{name:'Review notes'}),{target:{value:'Please improve the examples.'}});
  fireEvent.click(within(review).getByRole('button',{name:'Preview content'}));
  const preview=screen.getByText('Educator preview · no student grade').closest('dialog');
  fireEvent.click(within(preview).getByLabelText('Close',{exact:true}));
  expect(within(review).getByRole('textbox',{name:'Review notes'}).value).toBe('Please improve the examples.');
  expect(rpc.mock.calls.some(([name])=>name==='review_learning_material')).toBe(false);
  fireEvent.change(within(review).getByRole('combobox',{name:'Decision'}),{target:{value:'draft'}});
  fireEvent.submit(within(review).getByRole('button',{name:'Save review'}).closest('form'));
  await waitFor(()=>expect(screen.queryByRole('dialog')).toBe(null));
  expect(rpc.mock.calls.find(([name])=>name==='review_learning_material')[1]).toMatchObject({p_decision:'draft',p_notes:'Please improve the examples.'});
});
it('keeps the last loaded material after a failed refresh and lets the educator retry',async()=>{
  const {repository}=await mount('/workspace/lessons','educator');
  const snapshot=await repository.snapshot();
  repository.snapshot=vi.fn().mockRejectedValueOnce(new Error('Connection interrupted')).mockResolvedValue(snapshot);
  fireEvent.click(screen.getByRole('button',{name:/^Favorite /}));
  await screen.findByRole('alert');
  expect(screen.getByRole('heading',{name:'A little seed, a big discovery',exact:true})).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Try again',exact:true}));
  await waitFor(()=>expect(screen.queryByRole('alert')).toBe(null));
  expect(repository.snapshot).toHaveBeenCalledTimes(2);
});
it('shows only the chosen lesson format, preserves text while switching, and saves the selected pages',async()=>{
  const {rpc}=await mount('/workspace/lessons','educator');
  fireEvent.click(screen.getByRole('button',{name:'Create material',exact:true}));
  const dialog=screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByRole('textbox',{name:'Title',exact:true}),{target:{value:'A reading lesson'}});
  fireEvent.change(within(dialog).getByRole('textbox',{name:'English',exact:true}),{target:{value:'Single English draft.'}});
  fireEvent.change(within(dialog).getByRole('textbox',{name:'Filipino',exact:true}),{target:{value:'Maikling aralin.'}});
  expect(within(dialog).queryByRole('textbox',{name:'English page 1',exact:true})).toBe(null);
  const mode=within(dialog).getByRole('checkbox',{name:'Use pages for this lesson'});
  fireEvent.click(mode);
  expect(within(dialog).queryByRole('textbox',{name:'English',exact:true})).toBe(null);
  fireEvent.change(within(dialog).getByRole('textbox',{name:'English page 1',exact:true}),{target:{value:'A book in the garden.'}});
  fireEvent.change(within(dialog).getByRole('textbox',{name:'Filipino page 1',exact:true}),{target:{value:'Isang aklat sa hardin.'}});
  fireEvent.click(mode);
  expect(within(dialog).getByRole('textbox',{name:'English',exact:true}).value).toBe('Single English draft.');
  fireEvent.click(mode);
  expect(within(dialog).getByRole('textbox',{name:'English page 1',exact:true}).value).toBe('A book in the garden.');
  fireEvent.submit(within(dialog).getByRole('button',{name:'Save material'}).closest('form'));
  await waitFor(()=>expect(screen.queryByRole('dialog')).toBe(null));
  const body=rpc.mock.calls.find(([name])=>name==='save_learning_material')[1].p_data.body;
  expect(body.pages).toEqual([{english:'A book in the garden.',filipino:'Isang aklat sa hardin.'}]);
  expect(body.english).toBe('A book in the garden.');
});
