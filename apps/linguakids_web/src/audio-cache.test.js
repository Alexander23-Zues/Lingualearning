import { afterEach, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { readBundledAudio } from './audio-cache';

afterEach(() => vi.unstubAllGlobals());

it('finds the same Tagalog recording as the backend without an authenticated synthesis request', async () => {
  vi.stubGlobal('crypto', webcrypto);
  const id = 'd7023c2fa527cf67f7f7c4e7165fc389027bbbf320f5db4a395e9066c1d62c6b';
  const blob = new Blob(['prepared-public-mp3'], { type: 'audio/mpeg' });
  const fetch = vi.fn(async url => url.endsWith('manifest.json')
    ? { ok: true, json: async () => ({ files: [id] }) }
    : { ok: true, blob: async () => blob });
  vi.stubGlobal('fetch', fetch);
  expect(await readBundledAudio('araw', 'fil')).toBe(blob);
  expect(fetch).toHaveBeenLastCalledWith(`/voices/${id}.mp3`, expect.objectContaining({ cache: 'force-cache' }));
  const count = fetch.mock.calls.length;
  expect(await readBundledAudio('araw', 'en')).toBe(null);
  expect(fetch).toHaveBeenCalledTimes(count);
});
