import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from './App';
import { createPreviewRepository } from './preview';
import { download } from './domain';
vi.mock('./domain', async importOriginal => ({...await importOriginal(), download:vi.fn()}));

const pairs=[{en:'tree',fil:'puno'},{en:'book',fil:'aklat'}];
const dataset={id:'deferred-dataset',kind:'dataset',title:'Reviewed garden dataset',status:'draft',owner_id:'preview-administrator',updated_at:'2026-11-12',data:{details:'Reviewed bilingual examples.',source_url:'https://example.test/original',license:'Original test examples',pairs}};
beforeEach(()=>{
  localStorage.clear();sessionStorage.clear();vi.clearAllMocks();
  HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
  HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
});
async function mount(full=dataset) {
  const repository=createPreviewRepository();await repository.enterPreview('administrator');
  const data=await repository.snapshot();
  const summary=structuredClone(full);summary.details_deferred=true;
  if(full.kind==='dataset'){delete summary.data.pairs;summary.data.pair_count=pairs.length;}
  else {delete summary.data.dataset.pairs;summary.data.dataset.pair_count=pairs.length;}
  repository.snapshot=async()=>({...data,records:[summary]});
  repository.record=vi.fn(async()=>structuredClone(full));
  const rpc=vi.spyOn(repository,'rpc');
  window.history.replaceState(null,'',`/#/workspace/ai?tab=${full.kind==='dataset'?'datasets':'packages'}`);
  render(<App repository={repository}/>);
  await screen.findByRole('heading',{name:full.title,exact:true});
  return {repository,rpc};
}
it('renders summaries without fetching bulk pairs, then retrieves the full dataset for its details',async()=>{
  const {repository}=await mount();
  expect(repository.record).not.toHaveBeenCalled();
  expect(screen.getByText(/2 pairs/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'View details',exact:true}));
  const dialog=await screen.findByRole('dialog');
  expect(repository.record).toHaveBeenCalledWith(dataset.id);
  expect(within(dialog).getByRole('cell',{name:'puno',exact:true})).toBeTruthy();
});
it('loads every pair before editing and never saves a summarized dataset',async()=>{
  const {repository,rpc}=await mount();
  fireEvent.click(screen.getByRole('button',{name:'Edit',exact:true}));
  const editor=await screen.findByRole('dialog');
  expect(repository.record).toHaveBeenCalledWith(dataset.id);
  expect(within(editor).getByRole('textbox',{name:/^English–Filipino pairs/}).value).toBe('tree | puno\nbook | aklat');
  fireEvent.submit(within(editor).getByRole('button',{name:'Save dataset'}).closest('form'));
  await waitFor(()=>expect(screen.queryByRole('dialog')).toBe(null));
  const saved=rpc.mock.calls.find(([name])=>name==='save_workspace_record');
  expect(saved[1].p_data.data.pairs).toEqual(pairs);
});
it('exports all actual dataset pairs in CSV and JSON instead of exporting the list summary',async()=>{
  const {repository}=await mount();
  fireEvent.click(screen.getByRole('button',{name:'Export CSV',exact:true}));
  await waitFor(()=>expect(download).toHaveBeenCalledTimes(1));
  expect(download.mock.calls[0][1]).toContain('"tree","puno"');
  expect(download.mock.calls[0][1]).toContain('"book","aklat"');
  fireEvent.click(screen.getByRole('button',{name:'Download record',exact:true}));
  await waitFor(()=>expect(download).toHaveBeenCalledTimes(2));
  expect(JSON.parse(download.mock.calls[1][1]).data.pairs).toEqual(pairs);
  expect(repository.record).toHaveBeenCalledTimes(2);
});
it('shows a recoverable load error without opening an empty editor or saving changes',async()=>{
  const {repository,rpc}=await mount();
  repository.record.mockRejectedValueOnce(new Error('The record is unavailable. Try again.'));
  fireEvent.click(screen.getByRole('button',{name:'Edit',exact:true}));
  await screen.findByRole('alert');
  expect(screen.queryByRole('dialog')).toBe(null);
  expect(rpc.mock.calls.some(([name])=>name==='save_workspace_record')).toBe(false);
  fireEvent.click(screen.getByRole('button',{name:'Edit',exact:true}));
  await screen.findByRole('dialog');
});
it('keeps the full frozen dataset in training manifests downloaded on demand',async()=>{
  const full={...dataset,id:'training-snapshot',kind:'training',title:'Garden training package',status:'published',data:{details:'Frozen reviewed data.',dataset_id:dataset.id,dataset:{...dataset.data}}};
  const {repository}=await mount(full);
  fireEvent.click(screen.getByRole('button',{name:'Download manifest',exact:true}));
  await waitFor(()=>expect(download).toHaveBeenCalledTimes(1));
  expect(repository.record).toHaveBeenCalledWith(full.id);
  expect(JSON.parse(download.mock.calls[0][1]).data.dataset.pairs).toEqual(pairs);
});
