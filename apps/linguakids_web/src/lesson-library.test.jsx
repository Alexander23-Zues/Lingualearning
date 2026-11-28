import { beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from './App';
import { createPreviewRepository } from './preview';

beforeEach(() => {
  localStorage.clear();sessionStorage.clear();
  HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
  HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
});
async function mount(path='/workspace/lessons', repository=createPreviewRepository()) {
  await repository.enterPreview('educator');
  window.history.replaceState(null,'',`/#${path}`);
  render(<App repository={repository}/>);
  await screen.findByRole('heading',{name:'Lessons & learning materials',exact:true},{timeout:5000});
  return repository;
}
const library=()=>screen.getByRole('navigation',{name:'Lesson library views'});

it('adds all learning material types to Lessons, filters them, and keeps the selected library on reload', async()=>{
  const repo=await mount();
  const original=await repo.snapshot();
  expect(document.querySelectorAll('.material-card')).toHaveLength(original.materials.filter(m=>m.kind==='lesson').length);
  fireEvent.click(within(library()).getByRole('link',{name:'Learning materials',exact:true}));
  expect(document.querySelectorAll('.material-card')).toHaveLength(original.materials.length);
  fireEvent.change(screen.getByRole('combobox',{name:'Activity type'}),{target:{value:'story'}});
  expect(document.querySelectorAll('.material-card')).toHaveLength(original.materials.filter(m=>m.kind==='story').length);
  expect(window.location.hash).toContain('view=materials');
  expect(window.location.hash).toContain('type=story');
  const path=window.location.hash.slice(1);
  cleanup();await mount(path,createPreviewRepository());
  expect(screen.getByRole('combobox',{name:'Activity type'}).value).toBe('story');
  fireEvent.click(within(library()).getByRole('link',{name:'Lessons',exact:true}));
  expect(screen.queryByRole('combobox',{name:'Activity type'})).toBe(null);
  expect(document.querySelectorAll('.material-card')).toHaveLength(original.materials.filter(m=>m.kind==='lesson').length);
});

async function createStory() {
  fireEvent.click(screen.getByRole('button',{name:'Create material',exact:true}));
  const dialog=screen.getByRole('dialog');const form=within(dialog);
  fireEvent.change(form.getByRole('textbox',{name:'Title',exact:true}),{target:{value:'Our library story'}});
  fireEvent.change(form.getByRole('combobox',{name:'Material type'}),{target:{value:'story'}});
  expect(form.queryByRole('textbox',{name:'English',exact:true})).toBe(null);
  expect(form.queryByRole('checkbox',{name:'Use pages for this lesson'})).toBe(null);
  fireEvent.change(form.getByRole('textbox',{name:'English page 1',exact:true}),{target:{value:'The children read a book.'}});
  fireEvent.change(form.getByRole('textbox',{name:'Filipino page 1',exact:true}),{target:{value:'Nagbabasa ng aklat ang mga bata.'}});
  return dialog;
}

it('shows a story created from Lessons despite old filters, previews and edits it, and retains it after reload',async()=>{
  const repo=await mount();const before=await repo.snapshot();
  fireEvent.change(screen.getByRole('searchbox',{name:'Search',exact:true}),{target:{value:'a previous search'}});
  fireEvent.change(screen.getByRole('combobox',{name:'Status filter'}),{target:{value:'published'}});
  const dialog=await createStory();
  fireEvent.submit(dialog.querySelector('form'));
  await waitFor(()=>expect(screen.queryByRole('dialog')).toBe(null));
  expect(window.location.hash).toContain('view=materials');
  let card=(await screen.findByRole('heading',{name:'Our library story',exact:true})).closest('article');
  expect(within(card).queryByRole('button',{name:'Assign',exact:true})).toBe(null);
  expect(screen.getByRole('combobox',{name:'Status filter'}).value).toBe('');
  fireEvent.click(within(card).getByRole('button',{name:'Preview',exact:true}));
  expect(within(screen.getByRole('dialog')).getByText('The children read a book.')).toBeTruthy();
  fireEvent.click(within(screen.getByRole('dialog')).getByLabelText('Close',{exact:true}));
  fireEvent.click(within(card).getByRole('button',{name:/More actions/}));
  fireEvent.click(within(card).getByRole('button',{name:'Edit',exact:true}));
  const edit=within(await screen.findByRole('dialog'));
  expect(edit.getByRole('combobox',{name:'Material type'}).disabled).toBe(true);
  fireEvent.change(edit.getByRole('textbox',{name:'Title',exact:true}),{target:{value:'Our edited story'}});
  fireEvent.submit(screen.getByRole('dialog').querySelector('form'));
  await waitFor(()=>expect(screen.queryByRole('dialog')).toBe(null));
  await screen.findByRole('heading',{name:'Our edited story',exact:true});
  const after=await repo.snapshot();
  expect(after.materials).toHaveLength(before.materials.length+1);
  expect(after.children).toEqual(before.children);
  expect(after.attempts).toEqual(before.attempts);
  const saved=after.materials.find(m=>m.title==='Our edited story');
  expect(saved).toMatchObject({kind:'story',status:'draft',grade_level:1,version:2});
  expect(saved.body.pages[0].english).toBe('The children read a book.');
  cleanup();await mount('/workspace/lessons?view=materials&type=story',createPreviewRepository());
  expect(await screen.findByRole('heading',{name:'Our edited story',exact:true})).toBeTruthy();
});

it('defaults Create material to the selected material type and keeps the dedicated Stories page available',async()=>{
  await mount('/workspace/lessons?view=materials&type=game');
  fireEvent.click(screen.getByRole('button',{name:'Create material',exact:true}));
  expect(within(screen.getByRole('dialog')).getByRole('combobox',{name:'Material type'}).value).toBe('game');
  fireEvent.click(within(screen.getByRole('dialog')).getByLabelText('Close',{exact:true}));
  fireEvent.click(within(screen.getByRole('navigation',{name:'Workspace navigation'})).getByRole('link',{name:'Stories',exact:true}));
  await screen.findByRole('heading',{name:'Discover stories',exact:true});
  expect(screen.queryByRole('navigation',{name:'Lesson library views'})).toBe(null);
});

it('keeps an unsaved draft open on a server failure without showing a success or switching the library',async()=>{
  const repo=await mount();const original=repo.rpc;
  repo.rpc=vi.fn((name,params)=>name==='save_learning_material'?Promise.reject(new Error('Unable to save right now')):original(name,params));
  const dialog=await createStory();fireEvent.submit(dialog.querySelector('form'));
  await screen.findByRole('alert');
  expect(within(dialog).getByRole('textbox',{name:'Title',exact:true}).value).toBe('Our library story');
  expect(window.location.hash).not.toContain('view=materials');
  expect(screen.queryByText(/Clear the search to browse other materials/)).toBe(null);
  expect((await repo.snapshot()).materials.some(m=>m.title==='Our library story')).toBe(false);
});

