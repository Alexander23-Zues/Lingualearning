import {beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import App from './App';
import {createPreviewRepository} from './preview';
beforeEach(()=>{
  localStorage.clear();sessionStorage.clear();
  HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
  HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
});
async function mount(path,role='administrator',prepare,repo=createPreviewRepository()){
  await repo.enterPreview(role);if(prepare)await prepare(repo);
  window.history.replaceState(null,'',`/#${path}`);render(<App repository={repo}/>);
  await screen.findByRole('navigation',{name:'Workspace navigation'});
  await waitFor(()=>expect(document.querySelector('.workspace-main .loading')).toBe(null));return repo;
}
it('lists both dictionary and vocabulary material kinds under admin Vocabulary and educator Dictionary',async()=>{
  const prepare=async repo=>{const data=await repo.snapshot();data.materials.push({...data.materials.find(m=>m.kind==='dictionary'),id:'word-set',kind:'vocabulary',title:'Our classroom vocabulary'});repo.snapshot=async()=>data;};
  await mount('/workspace/resources?type=dictionary','administrator',prepare);
  expect(screen.getByRole('heading',{name:'Our classroom vocabulary',exact:true})).toBeTruthy();
  expect(document.querySelectorAll('.material-card')).toHaveLength(2);
  cleanup();await mount('/workspace/dictionary','educator',prepare);
  expect(screen.getByRole('heading',{name:'Our classroom vocabulary',exact:true})).toBeTruthy();
});

it('shows and reloads a story created from an admin Lessons filter instead of hiding it',async()=>{
  const repo=await mount('/workspace/resources?type=lesson&status=published');
  fireEvent.click(screen.getByRole('button',{name:'Create material',exact:true}));let dialog=screen.getByRole('dialog');let form=within(dialog);
  fireEvent.change(form.getByRole('textbox',{name:'Title',exact:true}),{target:{value:'New admin story'}});
  fireEvent.change(form.getByRole('combobox',{name:'Material type'}),{target:{value:'story'}});
  fireEvent.change(form.getByRole('textbox',{name:'English page 1',exact:true}),{target:{value:'We read together.'}});
  fireEvent.change(form.getByRole('textbox',{name:'Filipino page 1',exact:true}),{target:{value:'Sama-sama kaming nagbabasa.'}});
  fireEvent.submit(dialog.querySelector('form'));
  await screen.findByRole('heading',{name:'New admin story',exact:true},{timeout:5000});
  await waitFor(()=>expect(screen.queryByRole('dialog')).toBe(null));
  expect(window.location.hash).toContain('type=story');expect(window.location.hash).not.toContain('status=published');
  const path=window.location.hash.slice(1);cleanup();await mount(path,'administrator',undefined,createPreviewRepository());
  expect(await screen.findByRole('heading',{name:'New admin story',exact:true})).toBeTruthy();
  expect((await repo.snapshot()).materials.find(m=>m.title==='New admin story').kind).toBe('story');
  fireEvent.change(screen.getByRole('searchbox',{name:'Search',exact:true}),{target:{value:''}});
  await waitFor(()=>expect(window.location.hash).not.toContain('focus='));
  const clearedPath=window.location.hash.slice(1);cleanup();await mount(clearedPath,'administrator',undefined,createPreviewRepository());
  expect(screen.getByRole('searchbox',{name:'Search',exact:true}).value).toBe('');
  expect(document.querySelectorAll('.material-card')).toHaveLength(2);
});

it('moves a game created from educator Stories into the matching Lessons library view',async()=>{
  await mount('/workspace/stories','educator');fireEvent.click(screen.getByRole('button',{name:'Create material',exact:true}));
  const dialog=screen.getByRole('dialog'),form=within(dialog);
  fireEvent.change(form.getByRole('textbox',{name:'Title',exact:true}),{target:{value:'New class game'}});
  fireEvent.change(form.getByRole('combobox',{name:'Material type'}),{target:{value:'game'}});
  fireEvent.change(form.getByRole('textbox',{name:/^English–Filipino pairs/}),{target:{value:'book | aklat\nsun | araw'}});
  fireEvent.submit(dialog.querySelector('form'));
  await screen.findByRole('heading',{name:'New class game',exact:true});
  expect(window.location.hash).toContain('/workspace/lessons?view=materials&type=game');
});

it('paginates educators and combines trimmed search with account status and grade filters',async()=>{
  await mount('/workspace/educators','administrator',async repo=>{
    const data=await repo.snapshot();data.educators=Array.from({length:21},(_,i)=>({id:`teacher-${i}`,role:'educator',name:`Teacher ${i+1}`,email:`teacher${i+1}@example.org`,status:i===20?'suspended':'active',grade_levels:[i===20?6:1]}));repo.snapshot=async()=>data;
  });
  expect(screen.queryByRole('cell',{name:'Teacher 21',exact:true})).toBe(null);
  fireEvent.click(screen.getByRole('button',{name:'Next page',exact:true}));expect(await screen.findByRole('cell',{name:'Teacher 21',exact:true})).toBeTruthy();
  fireEvent.change(screen.getByRole('searchbox',{name:'Search',exact:true}),{target:{value:'  Teacher 21  '}});
  expect(await screen.findByRole('cell',{name:'Teacher 21',exact:true})).toBeTruthy();
  fireEvent.change(screen.getByRole('combobox',{name:'Account status'}),{target:{value:'active'}});
  expect(screen.getByRole('heading',{name:'No matching educators'})).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Clear filters',exact:true}));
  fireEvent.change(screen.getByRole('combobox',{name:'Grade filter'}),{target:{value:'6'}});
  expect(await screen.findByRole('cell',{name:'Teacher 21',exact:true})).toBeTruthy();
  expect(screen.queryByRole('cell',{name:'Teacher 1',exact:true})).toBe(null);
});

it('rejects whitespace suspension reasons and keeps the teacher unchanged when the server rejects a status update',async()=>{
  const repo=await mount('/workspace/educators','administrator',async repo=>{const d=await repo.snapshot();d.educators=[{id:'teacher',role:'educator',name:'Test Teacher',email:'teacher@example.org',status:'active',grade_levels:[1]}];repo.snapshot=async()=>d;});
  const original=repo.rpc;repo.rpc=vi.fn((name,p)=>name==='admin_update_educator'?Promise.reject(new Error('Unable to update account')):original(name,p));
  fireEvent.click(screen.getByRole('button',{name:'Suspend',exact:true}));const dialog=screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByRole('textbox',{name:'Reason',exact:true}),{target:{value:'   '}});fireEvent.submit(dialog.querySelector('form'));
  await within(dialog).findByText('Enter a reason with at least 3 characters.');expect(repo.rpc).not.toHaveBeenCalled();
  fireEvent.change(within(dialog).getByRole('textbox',{name:'Reason',exact:true}),{target:{value:'Review access'}});fireEvent.submit(dialog.querySelector('form'));
  await within(dialog).findByText('Unable to update account');expect(within(dialog).getByRole('textbox',{name:'Reason'}).value).toBe('Review access');
  expect((await repo.snapshot()).educators[0].status).toBe('active');
});

it('lets a teacher skip unavailable teaching-sequence entries without silently stopping',async()=>{
  await mount('/workspace/plans','educator',async repo=>{const d=await repo.snapshot();d.records=[{id:'plan',owner_id:'preview-educator',kind:'plan',title:'Reading sequence',status:'draft',data:{details:'Our reading sequence',grade_level:1,material_ids:['missing-first','preview-lesson','missing-middle','preview-story']}}];repo.snapshot=async()=>d;});
  fireEvent.click(screen.getByRole('button',{name:'Open teaching sequence',exact:true}));
  await screen.findByRole('heading',{name:'Activity unavailable',exact:true});
  fireEvent.click(screen.getByRole('button',{name:'Skip unavailable activity',exact:true}));
  expect(within(screen.getByRole('dialog')).getByRole('heading',{name:'A little seed, a big discovery',exact:true})).toBeTruthy();
  fireEvent.click(within(screen.getByRole('dialog')).getByLabelText('Close',{exact:true}));
  await screen.findByRole('heading',{name:'Activity unavailable',exact:true});
  fireEvent.click(screen.getByRole('button',{name:'Skip unavailable activity',exact:true}));
  expect(within(screen.getByRole('dialog')).getByRole('heading',{name:'The reading garden',exact:true})).toBeTruthy();
  fireEvent.click(within(screen.getByRole('dialog')).getByLabelText('Close',{exact:true}));expect(screen.queryByRole('dialog')).toBe(null);
});

it('recovers Settings after an initial load failure and shows success only after a successful save',async()=>{
  let prefs;const repo=await mount('/workspace/settings','educator',async repo=>{prefs=await repo.preferences();repo.preferences=vi.fn().mockRejectedValue(new Error('Preferences connection failed'));});
  await screen.findByRole('alert');expect(screen.queryByRole('combobox',{name:'Preferred language'})).toBe(null);
  repo.preferences.mockResolvedValue(prefs);fireEvent.click(screen.getByRole('button',{name:'Try again',exact:true}));
  await screen.findByRole('combobox',{name:'Preferred language'});
  repo.savePreferences=vi.fn().mockRejectedValueOnce(new Error('Save interrupted')).mockResolvedValue(undefined);
  fireEvent.click(screen.getByRole('button',{name:'Save preferences',exact:true}));await screen.findByText('Save interrupted');
  expect(screen.queryByText('Preferences saved.')).toBe(null);
  fireEvent.click(screen.getByRole('button',{name:'Save preferences',exact:true}));await screen.findByText('Preferences saved.');expect(screen.queryByRole('alert')).toBe(null);
});

it('does not mistake a failed dictionary load for an empty library and supports retry',async()=>{
  const repo=await mount('/workspace/dictionary','administrator',async repo=>{repo.loadTable=vi.fn().mockRejectedValue(new Error('Dictionary connection failed'));});
  await screen.findByText('Dictionary connection failed');expect(screen.queryByRole('heading',{name:'Add a new word to your world'})).toBe(null);
  repo.loadTable.mockResolvedValue([{id:'word',english_term:'garden',filipino_term:'hardin',state:'published'}]);
  fireEvent.click(screen.getByRole('button',{name:'Try again',exact:true}));await screen.findByRole('heading',{name:'garden',exact:true});expect(screen.queryByText('Dictionary connection failed')).toBe(null);
});

it('keeps a failed dictionary draft editable, then shows the created or renamed word despite a previous search',async()=>{
  const entries=[{id:'apple',english_term:'apple',filipino_term:'mansanas',state:'published',min_grade:1,max_grade:6}];
  const repo=await mount('/workspace/dictionary','administrator',async repo=>{
    repo.loadTable=vi.fn(async()=>structuredClone(entries));
    repo.saveTable=vi.fn().mockRejectedValueOnce(new Error('Word save interrupted')).mockImplementation(async(_,values,id)=>{
      if(id)Object.assign(entries.find(entry=>entry.id===id),values);else entries.push({...values,id:'new-word'});
    });
  });
  fireEvent.change(screen.getByRole('searchbox',{name:'Search dictionary',exact:true}),{target:{value:'apple'}});
  fireEvent.click(screen.getByRole('button',{name:'Add word',exact:true}));let dialog=screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByRole('textbox',{name:'English word'}),{target:{value:' zebra '}});
  fireEvent.change(within(dialog).getByRole('textbox',{name:'Filipino word'}),{target:{value:' sebra '}});
  fireEvent.submit(dialog.querySelector('form'));await within(dialog).findByText('Word save interrupted');
  expect(screen.getByRole('searchbox',{name:'Search dictionary',exact:true}).value).toBe('apple');
  fireEvent.submit(dialog.querySelector('form'));await waitFor(()=>expect(screen.queryByRole('dialog')).toBe(null));
  expect(screen.getByRole('heading',{name:'zebra',exact:true})).toBeTruthy();
  expect(screen.getByRole('searchbox',{name:'Search dictionary',exact:true}).value).toBe('zebra');
  fireEvent.click(screen.getByRole('button',{name:'Edit word',exact:true}));dialog=screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByRole('textbox',{name:'English word'}),{target:{value:'zebras'}});fireEvent.submit(dialog.querySelector('form'));
  await waitFor(()=>expect(screen.queryByRole('dialog')).toBe(null));expect(screen.getByRole('heading',{name:'zebras',exact:true})).toBeTruthy();expect(entries).toHaveLength(2);
});

it('rejects whitespace-only dictionary words before writing to the server',async()=>{
  const repo=await mount('/workspace/dictionary');repo.saveTable=vi.fn();
  fireEvent.click(screen.getByRole('button',{name:'Add word',exact:true}));const dialog=screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByRole('textbox',{name:'English word'}),{target:{value:'   '}});
  fireEvent.change(within(dialog).getByRole('textbox',{name:'Filipino word'}),{target:{value:'aklat'}});fireEvent.submit(dialog.querySelector('form'));
  await within(dialog).findByText('Enter both an English word and a Filipino word.');expect(repo.saveTable).not.toHaveBeenCalled();
});
