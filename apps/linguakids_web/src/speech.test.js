import { afterEach, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { configureSpeech, speak, stopSpeech, speechChunks, prepareSpeech, useSpeechState } from './speech';

vi.mock('./audio-cache', () => ({
  readStoredAudio: vi.fn(async () => null), readBundledAudio: vi.fn(async () => null), storeAudio: vi.fn(async () => {}),
}));

afterEach(() => { stopSpeech(); configureSpeech(null); vi.unstubAllGlobals(); });

it('uses each language separately for bilingual audio', async () => {
  const transport = vi.fn(async () => new Blob(['audio']));
  configureSpeech(transport);
  URL.createObjectURL = vi.fn(() => 'blob:voice');
  URL.revokeObjectURL = vi.fn();
  vi.stubGlobal('Audio', class { play() { queueMicrotask(() => this.onended()); return Promise.resolve(); } pause() {} });
  await speak([{ text: 'book', lang: 'en' }, { text: 'aklat', lang: 'fil' }]);
  expect(transport.mock.calls.map(call => call.slice(0, 2))).toEqual([['book', 'en'], ['aklat', 'fil']]);
});

it('does not fall back to an English voice for Filipino words', async () => {
  const nativeSpeak = vi.fn();
  vi.stubGlobal('speechSynthesis', { cancel: vi.fn(), getVoices: () => [{ lang: 'en-US' }], speak: nativeSpeak });
  configureSpeech(async () => { throw new Error('offline'); });
  await speak('araw', 'fil');
  expect(nativeSpeak).not.toHaveBeenCalled();
});

it('starts a matching installed voice without calling the server', async () => {
  const transport = vi.fn();
  configureSpeech(transport);
  vi.stubGlobal('SpeechSynthesisUtterance', class {});
  const voice = { lang: 'fil-PH', localService: true };
  const play = vi.fn(utterance => utterance.onend());
  vi.stubGlobal('speechSynthesis', { cancel: vi.fn(), getVoices: () => [voice], speak: play });
  await speak('Magandang umaga.', 'fil', true);
  expect(play).toHaveBeenCalledWith(expect.objectContaining({ voice, rate: 0.75 }));
  expect(transport).not.toHaveBeenCalled();
});

it('combines story sentences within the service limit and reuses audio in the session', async () => {
  const transport = vi.fn(async () => new Blob(['audio']));
  configureSpeech(transport);
  URL.createObjectURL = vi.fn(() => 'blob:story');
  URL.revokeObjectURL = vi.fn();
  vi.stubGlobal('Audio', class { play() { queueMicrotask(() => this.onended()); return Promise.resolve(); } pause() {} });
  const page = 'The cat is in the garden. It plays with a ball.';
  await speak(page);
  await speak(page);
  expect(transport).toHaveBeenCalledTimes(1);
  expect(transport.mock.calls[0][0]).toBe(page);
  const chunks = speechChunks('A story word. '.repeat(100));
  expect(chunks.every(chunk => chunk.length <= 300)).toBe(true);
});

it('stopping playback settles the reading request and aborts its preparation', async () => {
  configureSpeech(vi.fn(async () => new Blob(['audio'])));
  URL.createObjectURL = vi.fn(() => 'blob:story');
  URL.revokeObjectURL = vi.fn();
  let began;
  const started = new Promise(resolve => { began = resolve; });
  vi.stubGlobal('Audio', class { play() { began(); return Promise.resolve(); } pause() {} });
  const reading = speak('A story.');
  await started;
  stopSpeech();
  await reading;
});


it('prepares audio before Listen and reuses it without another generation request', async () => {
  const transport = vi.fn(async () => new Blob(['prepared-voice']));
  configureSpeech(transport);
  URL.createObjectURL = vi.fn(() => 'blob:prepared');
  URL.revokeObjectURL = vi.fn();
  const play = vi.fn(function () { queueMicrotask(() => this.onended()); return Promise.resolve(); });
  vi.stubGlobal('Audio', class { play = play; pause() {} });
  await prepareSpeech('Nasa mesa ang aklat.', 'fil');
  await speak('Nasa mesa ang aklat.', 'fil');
  expect(play).toHaveBeenCalledTimes(1);
  expect(transport).toHaveBeenCalledTimes(1);
});

it('shares an in-flight voice request between preparation and Listen', async () => {
  let complete;
  const transport = vi.fn(() => new Promise(resolve => { complete = resolve; }));
  configureSpeech(transport);
  const first = prepareSpeech('araw', 'fil');
  const second = prepareSpeech('araw', 'fil');
  await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
  complete(new Blob(['prepared']));
  await Promise.all([first, second]);
});

it('clears prepared memory audio when the signed-in account changes', async () => {
  const transport = vi.fn(async () => new Blob(['voice']));
  configureSpeech(transport, 'account-one');
  await prepareSpeech('book', 'en');
  configureSpeech(transport, 'account-two');
  await prepareSpeech('book', 'en');
  expect(transport).toHaveBeenCalledTimes(2);
});

it('uses the app voice and keeps the full sentence for slow reading practice', async () => {
  const text = 'I will read the next page aloud tomorrow, and yesterday I read this long passage clearly with my teacher before we shared our favourite words with the whole class and talked about them together.';
  const transport = vi.fn(async () => new Blob(['classroom-voice']));
  const nativeSpeak = vi.fn();
  configureSpeech(transport);
  vi.stubGlobal('speechSynthesis', {
    cancel: vi.fn(), getVoices: () => [{ lang: 'en-US', localService: true }], speak: nativeSpeak,
  });
  URL.createObjectURL = vi.fn(() => 'blob:practice');
  URL.revokeObjectURL = vi.fn();
  const play = vi.fn(function () {
    expect(this.preservesPitch).toBe(true);
    expect(this.playbackRate).toBe(0.76);
    queueMicrotask(() => this.onended());
    return Promise.resolve();
  });
  vi.stubGlobal('Audio', class { play = play; pause() {} });

  await prepareSpeech(text, 'en', true);
  await speak(text, 'en', true, true);

  expect(transport.mock.calls.map(([piece, language, , natural]) => [piece, language, natural])).toEqual([[text, 'en', true]]);
  expect(play).toHaveBeenCalledOnce();
  expect(nativeSpeak).not.toHaveBeenCalled();
});

it('shows an error instead of speaking in a device voice when the reading voice is unavailable', async () => {
  const nativeSpeak = vi.fn();
  configureSpeech(async () => { throw new TypeError('Failed to fetch'); });
  vi.stubGlobal('speechSynthesis', {
    cancel: vi.fn(), getVoices: () => [{ lang: 'fil-PH', localService: true }], speak: nativeSpeak,
  });
  const { result } = renderHook(() => useSpeechState());
  await speak('Maniwala ka sa sarili mo.', 'fil', false, true);
  await vi.waitFor(() => expect(result.current.error).toMatch(/internet connection/));
  expect(nativeSpeak).not.toHaveBeenCalled();
});
