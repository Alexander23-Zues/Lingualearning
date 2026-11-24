import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MaterialReader } from './reader';
import { shuffledLetters, supportsWordGarden } from './word-garden';
import App from './App';
import { createPreviewRepository } from './preview';

const material = {id:'garden',kind:'game',title:'Our garden words',grade_level:1,body:{pairs:[{en:'book',fil:'aklat'},{en:'sun',fil:'araw'}]}};
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); window.history.replaceState(null,'','/#/');
  HTMLDialogElement.prototype.showModal = function(){this.setAttribute('open','');};
  HTMLDialogElement.prototype.close = function(){this.removeAttribute('open');};
});
function open(props={}) {return render(<MaterialReader material={material} onClose={()=>{}} initialGameMode="word-builder" {...props}/>);}
function type(word) {
  const game = screen.getByRole('region',{name:'Word Garden game'});
  for (const letter of word) fireEvent.keyDown(game,{key:letter});
}
function checkWord(word) {type(word);fireEvent.click(screen.getByRole('button',{name:'Check word',exact:true}));}

it('shuffles without losing repeated letters and avoids the answer order when possible',()=>{
  const tiles = shuffledLetters('book',()=>.999);
  expect(tiles.join('')).not.toBe('BOOK');
  expect(tiles.sort()).toEqual(['B','K','O','O']);
  expect(supportsWordGarden([])).toBe(false);
  expect(supportsWordGarden([{en:'a',fil:'isa'}])).toBe(false);
  expect(supportsWordGarden(material.body.pairs)).toBe(true);
});
it('does not reuse a tile or award an incorrect word; undo, clear and shuffle keep the round playable',()=>{
  open();
  const tile = screen.getByRole('button',{name:/Letter B, tile/});
  fireEvent.click(tile);fireEvent.click(tile);
  expect(screen.getByLabelText('Your word: B')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Undo',exact:true}));
  expect(screen.getByLabelText('Your word: empty')).toBeTruthy();
  checkWord('koob');
  expect(screen.getByText(/Not quite/)).toBeTruthy();
  expect(screen.getByRole('button',{name:'Finish preview'}).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button',{name:'Clear',exact:true}));
  type('oo');
  expect(screen.getByLabelText('Your word: OO')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Shuffle',exact:true}));
  expect(screen.getByLabelText('Your word: empty')).toBeTruthy();
  checkWord('book');
  expect(screen.getByText(/Well done! book means aklat/)).toBeTruthy();
});
it('requires every round and submits bilingual answers through the existing student completion path exactly once',async()=>{
  const complete=vi.fn(async()=>({stars:2}));
  open({student:true,onComplete:complete});
  checkWord('book');
  expect(screen.getByRole('button',{name:'Finish activity'}).disabled).toBe(true);
  expect(complete).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Next word'}));
  expect(document.activeElement).toBe(screen.getByRole('region',{name:'Word Garden game'}));
  checkWord('sun');
  const finish = screen.getByRole('button',{name:'Finish activity'});
  expect(finish.disabled).toBe(false);
  fireEvent.click(finish);fireEvent.click(finish);
  await waitFor(()=>expect(complete).toHaveBeenCalledTimes(1));
  expect(complete).toHaveBeenCalledWith({book:'aklat',sun:'araw'},expect.any(String));
});
it('keeps matching available, resets progress when changing modes and blocks empty games',()=>{
  const view=open();
  checkWord('book');
  fireEvent.click(screen.getByRole('button',{name:'Match words',exact:true}));
  expect(screen.getByRole('combobox',{name:'Match for book'}).value).toBe('');
  fireEvent.change(screen.getByRole('combobox',{name:'Match for book'}),{target:{value:'aklat'}});
  fireEvent.change(screen.getByRole('combobox',{name:'Match for sun'}),{target:{value:'araw'}});
  expect(screen.getByRole('button',{name:'Finish preview'}).disabled).toBe(false);
  fireEvent.click(screen.getByRole('button',{name:'Word Garden',exact:true}));
  expect(screen.getByText('0 / 2 found')).toBeTruthy();
  expect(screen.getByRole('button',{name:'Finish preview'}).disabled).toBe(true);
  view.unmount();
  open({material:{...material,body:{pairs:[]}}});
  expect(screen.getByRole('button',{name:'Finish preview'}).disabled).toBe(true);
});
it('supports longer words without putting more than eight tiles on the wheel',()=>{
  open({material:{...material,body:{pairs:[{en:'butterfly',fil:'paruparo'}]}}});
  expect(screen.getByRole('group',{name:'Shuffled letters'}).classList.contains('garden-letter-grid')).toBe(true);
  checkWord('butterfly');
  expect(screen.getByRole('button',{name:'Finish preview'}).disabled).toBe(false);
});
it('opens Word Garden as the current assigned mission task and saves only after every word is found',async()=>{
  const repository=createPreviewRepository();
  await repository.enterPreview('educator');
  const token='preview:preview-child-1';
  for(let i=0;i<2;i++){
    const state=await repository.studentRpc('student_adventure_state',{},token);
    await repository.studentRpc('student_adventure_complete',{p_step_id:state.adventure.current_step_id,p_revision:state.adventure.revision,p_submission_id:'fixture-prior-'+i,p_answers:{}},token);
  }
  const submit=vi.spyOn(repository,'studentRpc');
  window.history.replaceState(null,'','/#/workspace/students');
  render(<App repository={repository}/>);
  fireEvent.click((await screen.findAllByRole('button',{name:'Continue assigned mission',exact:true}))[0]);
  fireEvent.click(await screen.findByRole('button',{name:/Magpatuloy/}));
  expect(screen.queryByRole('combobox',{name:'Learning activity'})).toBe(null);
  fireEvent.click(screen.getByRole('button',{name:'Simulan →',exact:true}));
  expect(screen.getByRole('region',{name:'Word Garden game'})).toBeTruthy();
  for(const [index,word] of ['tree','book','friend'].entries()) {
    if(index)fireEvent.click(screen.getByRole('button',{name:'Next word'}));
    checkWord(word);
  }
  fireEvent.click(screen.getByRole('button',{name:'Finish activity'}));
  await waitFor(()=>expect(submit.mock.calls.some(([name])=>name==='student_adventure_complete')).toBe(true));
  const calls=submit.mock.calls.filter(([name])=>name==='student_adventure_complete');
  expect(calls).toHaveLength(1);
  expect(calls[0][1].p_answers).toEqual({tree:'puno',book:'aklat',friend:'kaibigan'});
});
