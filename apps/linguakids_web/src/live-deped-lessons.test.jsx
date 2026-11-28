// Opt-in: actual educator reads and previews only; does not create a child or learning result.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect,it,vi } from 'vitest';
import { cleanup,fireEvent,render,screen,within } from '@testing-library/react';
import App from './App';
import { createRepository } from './repository';

it.skipIf(process.env.LINGUAKIDS_DEPED_LESSONS_CHECK!=='1')('loads and previews all six grade collections through an actual educator account',async()=>{
  localStorage.clear();sessionStorage.clear();
  HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
  HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
  const config=JSON.parse(await readFile(resolve(process.cwd(),'../../.preview/react-live/config.json'),'utf8'));
  const saved=JSON.parse(await readFile(resolve(process.cwd(),'../../.preview/grade-educator-credentials.json'),'utf8')).find(row=>row.grade===1);
  const repository=createRepository(config);
  const rpc=vi.spyOn(repository,'rpc');
  try{
    await repository.signIn(saved.email,saved.password,'educator');
    window.history.replaceState(null,'','/#/workspace/lessons');
    render(<App repository={repository}/>);
    fireEvent.click(await screen.findByRole('button',{name:/^Filters/},{timeout:25000}));
    const grade=await screen.findByRole('combobox',{name:'Grade filter'},{timeout:25000});
    expect(grade.value).toBe('1');
    fireEvent.change(screen.getByRole('searchbox',{name:'Search',exact:true}),{target:{value:'DepEd topic-based'}});
    for(const level of [1,2,3,4,5,6]){
      fireEvent.change(grade,{target:{value:String(level)}});
      const cards=document.querySelectorAll('.material-card');
      expect(cards).toHaveLength(6);
      fireEvent.click(within(cards[0]).getByRole('button',{name:'Preview',exact:true}));
      const dialog=screen.getByRole('dialog');
      expect(within(dialog).getByText(`Grade ${level}`,{exact:true})).toBeTruthy();
      fireEvent.click(within(dialog).getByText('Lesson source & teaching notes'));
      expect(dialog.querySelector('.lesson-source a').getAttribute('href')).toMatch(/^https:\/\/lrmds\.deped\.gov\.ph\/detail\//);
      for(let page=1;page<4;page++)fireEvent.click(within(dialog).getByRole('button',{name:'Next',exact:true}));
      expect(within(dialog).getByRole('button',{name:'Finish preview'}).disabled).toBe(false);
      fireEvent.click(within(dialog).getByLabelText('Close',{exact:true}));
    }
    expect(rpc.mock.calls.some(([name])=>/save|complete_material|review|delete/.test(name))).toBe(false);
  }finally{
    cleanup();await repository.client.auth.signOut({scope:'local'});repository.client.auth.stopAutoRefresh();
  }
},120000);
