import React from 'react';
import {describe,it,expect,vi,beforeAll} from 'vitest';
import {render,screen,fireEvent,within} from '@testing-library/react';
import {AdventureMap} from './AdventureMap';
import {previewAdventure} from './AdventurePreview';

beforeAll(()=>{if(!HTMLDialogElement.prototype.showModal)HTMLDialogElement.prototype.showModal=function(){this.open=true;};if(!HTMLDialogElement.prototype.close)HTMLDialogElement.prototype.close=function(){this.open=false;};});
const props=()=>({student:{id:'fictional',nickname:'Basti',grade_level:3},adventure:previewAdventure(),stars:134,connection:'online' as const,onStart:vi.fn(),onTeacher:vi.fn(),reducedMotion:true});
describe('guided student adventure',()=>{
  it('shows real supplied progress and gives a friendly locked-level explanation',()=>{
    const p=props();render(<AdventureMap {...p}/>);
    expect(screen.getByLabelText('134 stars')).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:/^Level 4: Bundok/}));
    expect(screen.getByText(/Tapusin muna/)).toBeTruthy();
    expect(p.onStart).not.toHaveBeenCalled();
  });
  it('offers only the current activity even when the games shortcut is pressed',()=>{
    const p=props();render(<AdventureMap {...p}/>);
    fireEvent.click(screen.getByRole('button',{name:'Laro'}));
    const dialog=screen.getByRole('dialog');
    expect(within(dialog).getAllByRole('button',{name:/Simulan/})).toHaveLength(1);
    fireEvent.click(within(dialog).getByRole('button',{name:/Simulan/}));
    expect(p.onStart).toHaveBeenCalledWith(expect.objectContaining({id:'preview-1-0',kind:'lesson'}));
  });
  it('routes educator access to the existing verification gate',()=>{
    const p=props();render(<AdventureMap {...p}/>);
    fireEvent.click(screen.getByRole('button',{name:'Back to teacher'}));
    expect(p.onTeacher).toHaveBeenCalledOnce();
    expect(p.onStart).not.toHaveBeenCalled();
  });
  it('does not offer continuation for an unverified offline quiz score',()=>{
    const p=props();const stage=p.adventure.stages[1];const step=stage.steps[0];step.status='pending_online_scoring';
    render(<AdventureMap {...p} connection="awaiting-scoring"/>);
    expect((screen.getByRole('button',{name:/Magpatuloy/}) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Hinihintay ang online score/)).toBeTruthy();
  });
  it('respects the explicit reduced-motion preference',()=>{
    render(<AdventureMap {...props()} reducedMotion/>);
    expect(screen.getByTestId('adventure-map').getAttribute('data-reduced-motion')).toBe('true');
  });
  it('lets pagination focus a locked card without starting an activity',()=>{
    const p=props();render(<AdventureMap {...p}/>);
    expect(screen.getByRole('button',{name:'Focus Level 2: Gubat ng Salita'}).getAttribute('aria-current')).toBe('step');
    const page=screen.getByRole('button',{name:'Focus Level 5: Karagatan ng Kuwento'});
    fireEvent.click(page);
    expect(page.getAttribute('aria-current')).toBe('step');
    expect(p.onStart).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('opens a bilingual launcher before the current activity starts',()=>{
    const p=props();render(<AdventureMap {...p} preview/>);
    fireEvent.click(screen.getByRole('button',{name:/Magpatuloy/}));
    const dialog=screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button',{name:'English'}));
    expect(within(dialog).getByText(/follow the lessons/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button',{name:'Listen preview'}));
    expect(within(dialog).getByRole('status').textContent).toMatch(/Demo audio preview/);
    expect(p.onStart).not.toHaveBeenCalled();
  });
  it('offers only teacher-approved or earlier starting missions before beginning',async()=>{
    const p=props();p.adventure.placement={approved_stage_id:p.adventure.stages[2].id,selected_stage_id:p.adventure.stages[2].id,can_choose_start:true,requires_review:false,maximum_start_index:2};
    const choose=vi.fn().mockResolvedValue(undefined);render(<AdventureMap {...p} onChooseStart={choose}/>);
    fireEvent.click(screen.getByRole('button',{name:'Choose an earlier start'}));const dialog=screen.getByRole('dialog');
    expect(within(dialog).getAllByRole('button').filter(button=>button.classList.contains('quest-primary'))).toHaveLength(3);
    fireEvent.click(within(dialog).getByRole('button',{name:/^1\./}));expect(choose).toHaveBeenCalledWith(p.adventure.stages[0].id);
    expect(p.onStart).not.toHaveBeenCalled();
  });
});
