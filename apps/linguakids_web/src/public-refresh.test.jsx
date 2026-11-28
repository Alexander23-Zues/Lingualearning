import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';
import { createPreviewRepository } from './preview';

beforeEach(()=>{localStorage.clear();sessionStorage.clear();window.history.replaceState(null,'','/#/');});
async function mount(role) {
  const repository=createPreviewRepository();if(role)await repository.enterPreview(role);
  render(<App repository={{...repository,preview:false}}/>);
  await screen.findByRole('heading',{name:/A little learning/});
  return repository;
}
it('provides real educator entry points and keeps admin access available in the footer',async()=>{
  await mount();
  expect(screen.getByRole('link',{name:'Educator login',exact:true}).getAttribute('href')).toBe('#/login');
  expect(screen.getByRole('link',{name:'Start teaching',exact:true}).getAttribute('href')).toBe('#/register');
  expect(screen.getByRole('link',{name:'Administrator access',exact:true}).getAttribute('href')).toBe('#/admin-login');
  expect(screen.getByRole('link',{name:'Let’s get started',exact:true}).getAttribute('href')).toBe('#/register');
});
it('closes navigation after a section link, scrolls within the landing page, and focuses the destination',async()=>{
  await mount();
  const section=document.getElementById('learn');section.scrollIntoView=vi.fn();
  fireEvent.click(screen.getByRole('button',{name:'Open navigation',exact:true}));
  expect(screen.getByRole('button',{name:'Close navigation',exact:true}).getAttribute('aria-expanded')).toBe('true');
  fireEvent.click(screen.getByRole('link',{name:'Learning',exact:true}));
  expect(section.scrollIntoView).toHaveBeenCalled();
  expect(document.activeElement).toBe(section);
  expect(screen.getByRole('button',{name:'Open navigation',exact:true}).getAttribute('aria-expanded')).toBe('false');
  expect(window.location.hash).toBe('#/');
});
it('supports Escape in the mobile navigation without leaving its control stranded',async()=>{
  await mount();
  fireEvent.click(screen.getByRole('button',{name:'Open navigation',exact:true}));
  fireEvent.keyDown(screen.getByRole('navigation',{name:'On this page'}),{key:'Escape'});
  expect(document.activeElement).toBe(screen.getByRole('button',{name:'Open navigation',exact:true}));
});
it('routes an existing educator back to their workspace instead of offering another signup at the final action',async()=>{
  await mount('educator');
  expect((await screen.findByRole('link',{name:'Open my workspace',exact:true})).getAttribute('href')).toBe('#/workspace/home');
  fireEvent.click(screen.getByRole('link',{name:'Open my workspace',exact:true}));
  await screen.findByRole('heading',{name:'Class overview',exact:true});
  expect(document.querySelector('.teacher-garden-home')).toBe(null);
});
