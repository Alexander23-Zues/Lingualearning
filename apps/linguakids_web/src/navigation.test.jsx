import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WorkspaceNavigation, navigationGroups } from './WorkspaceNavigation';
import { adminNav, educatorNav } from './domain';
import App from './App';
import { createPreviewRepository } from './preview';

it('finds a page inside a closed group without making the menu a long list', () => {
  render(<MemoryRouter><WorkspaceNavigation items={educatorNav} role="educator" section="home" onNavigate={() => {}} /></MemoryRouter>);
  expect(screen.queryByRole('link', { name: 'Translator', exact: true })).toBe(null);
  fireEvent.change(screen.getByRole('searchbox', { name: 'Find a page' }), { target: { value: 'translat' } });
  expect(screen.getByRole('link', { name: 'Translator', exact: true }).getAttribute('href')).toBe('/workspace/translator');
  expect(screen.getByRole('status').textContent).toBe('1 page found');
  fireEvent.click(screen.getByRole('button', { name: 'Clear page search' }));
  expect(screen.getByRole('link', { name: 'Overview', exact: true }).getAttribute('aria-current')).toBe('page');
  expect(screen.queryByRole('link', { name: 'Translator', exact: true })).toBe(null);
});
it('keeps classroom destinations visible while expanding secondary tools and handles an empty search', () => {
  render(<MemoryRouter><WorkspaceNavigation items={educatorNav} role="educator" section="home" onNavigate={() => {}} /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Teaching library', exact: true }));
  expect(screen.getByRole('link',{name:'Overview',exact:true})).toBeTruthy();
  expect(screen.getByRole('link',{name:'Students',exact:true})).toBeTruthy();
  expect(screen.getByRole('button',{name:'Language tools',exact:true}).getAttribute('aria-expanded')).toBe('false');
  expect(screen.getByRole('link', { name: 'Curriculum & Lessons', exact: true })).not.toBe(null);
  fireEvent.change(screen.getByRole('searchbox', { name: 'Find a page' }), { target: { value: 'does-not-exist' } });
  expect(screen.getByText('No pages found')).not.toBe(null);
  expect(screen.queryAllByRole('link')).toHaveLength(0);
});
for (const [role, items] of [['educator', educatorNav], ['administrator', adminNav]]) {
  it(`retains every permitted ${role} destination exactly once`, () => {
    const destinations = navigationGroups(items, role).flatMap(group => group.items.map(([key]) => key));
    expect(new Set(destinations).size).toBe(items.length);
    expect([...destinations].sort()).toEqual(items.map(([key]) => key).sort());
  });
}
it('contains keyboard focus in the mobile menu and restores page access on Escape', async () => {
  localStorage.clear(); sessionStorage.clear();
  window.history.replaceState(null, '', '/#/workspace/home');
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  const repository = createPreviewRepository();
  await repository.enterPreview('educator');
  try {
    render(<App repository={repository} />);
    const trigger = await screen.findByRole('button', { name: 'Open navigation', exact: true });
    fireEvent.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: 'Workspace menu' });
    expect(within(dialog).getByRole('searchbox', { name: 'Find a page' })).not.toBe(null);
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.querySelector('.workspace-body').hasAttribute('inert')).toBe(true);
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Workspace menu' })).toBe(null));
    expect(document.body.style.overflow).toBe('');
    expect(document.querySelector('.workspace-body').hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe(trigger);
  } finally { vi.unstubAllGlobals(); }
});
