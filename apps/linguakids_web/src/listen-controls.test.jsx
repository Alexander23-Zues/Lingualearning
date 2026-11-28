import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MaterialReader } from './reader';
import { speak } from './speech';

vi.mock('./speech', async original => ({
  ...await original(),
  speak: vi.fn(),
  usePreparedSpeech: () => ({ ready: true, preparing: false, failed: false }),
  prepareSpeech: vi.fn(async () => {}),
}));

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});

it('lets the dictionary reader choose the actual English or Tagalog word to hear', () => {
  render(<MaterialReader material={{
    id: 'fixture-dictionary', kind: 'dictionary', title: 'My first everyday words', grade_level: 2,
    body: { pairs: [{ en: 'sun', fil: 'araw' }, { en: 'book', fil: 'aklat' }] },
  }} onClose={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Listen in English to sun' }));
  expect(speak).toHaveBeenLastCalledWith('sun', 'en', false);
  fireEvent.click(screen.getByRole('button', { name: 'Listen in Tagalog to araw' }));
  expect(speak).toHaveBeenLastCalledWith('araw', 'fil', false);
  expect(screen.getAllByRole('button', { name: /^Listen in Tagalog/ })).toHaveLength(2);
});
