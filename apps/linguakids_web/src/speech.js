import { useEffect, useSyncExternalStore } from "react";
import { readBundledAudio, readStoredAudio, storeAudio } from "./audio-cache";

let transport;
let generation = 0;
let audio;
let audioUrl;
let controller;
let finishPlayback;
const cache = new Map();
const pending = new Map();
const preparationErrors = new Map();
let scope;
let configuration = 0;
let preparationController = new AbortController();
const preparationQueue = [];
let activePreparations = 0;

function drainPreparations() {
  while (activePreparations < 2 && preparationQueue.length) {
    const job = preparationQueue.shift();
    if (job.signal.aborted) continue;
    activePreparations++;
    job.run().catch(() => {}).finally(() => {
      activePreparations--;
      drainPreparations();
    });
  }
}
const listeners = new Set();
let state = { status: "idle", error: "" };

function publish(status, error = "") {
  state = { status, error };
  listeners.forEach(listener => listener());
}
export function useSpeechState() {
  return useSyncExternalStore(
    listener => { listeners.add(listener); return () => listeners.delete(listener); },
    () => state,
    () => state,
  );
}
export function configureSpeech(value, userScope = null) {
  stopSpeech();
  preparationController.abort();
  preparationController = new AbortController();
  configuration++;
  cache.clear();
  pending.clear();
  preparationErrors.clear();
  scope = userScope;
  transport = value;
  listeners.forEach(listener => listener());
}
export function stopSpeech() {
  generation++;
  controller?.abort();
  window.speechSynthesis?.cancel();
  audio?.pause();
  finishPlayback?.();
  finishPlayback = null;
  if (audioUrl) URL.revokeObjectURL(audioUrl);
  audio = audioUrl = null;
  publish("idle");
}

export function speechChunks(text, reading = false) {
  // Keep the opening audio short so playback can start while the rest loads.
  const chunks = [];
  const limit = reading ? 240 : 80;
  let chunk = "";
  for (const word of String(text).trim().split(/\s+/)) {
    if (word.length > 80) throw new Error("Add spaces between words before listening.");
    if (chunk && chunk.length + word.length + 1 > limit) {
      const boundary = reading ? Array.from(chunk.matchAll(/[.!?…,:;]["'’”)]* /gu)).at(-1) : null;
      if (boundary) {
        const end = boundary.index + boundary[0].length;
        chunks.push(chunk.slice(0, end).trimEnd());
        chunk = chunk.slice(end);
      }
      if (chunk && chunk.length + word.length + 1 > limit) {
        chunks.push(chunk);
        chunk = "";
      }
    }
    chunk += (chunk ? " " : "") + word;
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}

function speechKey(piece, language, reading) {
  return JSON.stringify(reading ? [language, piece, "generated-reading-v1"] : [language, piece]);
}

function rememberAudio(key, blob) {
  cache.set(key, blob);
  while (cache.size > 96 || [...cache.values()].reduce((total, value) => total + value.size, 0) > 8_000_000)
    cache.delete(cache.keys().next().value);
}

async function loadAudio(piece, language, key, reading) {
  const selectedScope = scope;
  const selectedConfiguration = configuration;
  const signal = preparationController.signal;
  let blob;
  if (!reading) {
    blob = await readStoredAudio(selectedScope, key);
    if (!blob) blob = await readBundledAudio(piece, language, signal);
  }
  if (!blob) {
    if (!transport) throw new Error("Speech is unavailable.");
    blob = await transport(piece, language, signal, reading);
    if (signal.aborted) throw new DOMException("Stopped", "AbortError");
  }
  if (selectedConfiguration !== configuration) throw new DOMException("Stopped", "AbortError");
  if (!blob.size) throw new Error("The speech service returned empty audio.");
  if (blob.size <= 2_000_000) {
    rememberAudio(key, blob);
    if (!reading) void storeAudio(selectedScope, key, blob);
  }
  return blob;
}

function voiceBlob(piece, language, reading) {
  const key = speechKey(piece, language, reading);
  if (cache.has(key)) return Promise.resolve(cache.get(key));
  if (!pending.has(key)) {
    preparationErrors.delete(key);
    const task = loadAudio(piece, language, key, reading);
    pending.set(key, task);
    const selectedConfiguration = configuration;
    task.then(() => {
      if (configuration === selectedConfiguration) {
        pending.delete(key);
        listeners.forEach(listener => listener());
      }
    }, error => {
      if (configuration === selectedConfiguration) {
        pending.delete(key);
        if (error.name !== "AbortError") preparationErrors.set(key, error.message);
        listeners.forEach(listener => listener());
      }
    });
  }
  return pending.get(key);
}

function firstPieces(text, lang, reading) {
  const parts = Array.isArray(text) ? text : [{ text, lang }];
  return parts.filter(part => part.text).map(part => ({
    piece: speechChunks(part.text, reading)[0], language: part.lang === "fil" ? "fil" : "en",
  }));
}

export async function prepareSpeech(text, lang = "en", reading = false) {
  // Only the opening clip is fetched ahead of time. Playback prepares subsequent clips.
  for (const item of firstPieces(text, lang, reading))
    await voiceBlob(item.piece, item.language, reading);
}

export function usePreparedSpeech(text, lang = "en", enabled = true, reading = false) {
  const key = JSON.stringify([text, lang, reading]);
  const selectedConfiguration = useSyncExternalStore(
    listener => { listeners.add(listener); return () => listeners.delete(listener); },
    () => configuration,
    () => 0,
  );
  const status = useSyncExternalStore(
    listener => { listeners.add(listener); return () => listeners.delete(listener); },
    () => {
      if (!enabled || !text) return "idle";
      try {
        const pieces = firstPieces(text, lang, reading);
        if (pieces.every(item => cache.has(speechKey(item.piece, item.language, reading)))) return "ready";
        if (pieces.some(item => preparationErrors.has(speechKey(item.piece, item.language, reading)))) return "error";
        return "preparing";
      } catch { return "error"; }
    },
    () => "idle",
  );
  useEffect(() => {
    if (!enabled || !text) return;
    const controller = new AbortController();
    // Let typed text settle before making an audio request.
    const timer = setTimeout(() => {
      preparationQueue.push({ signal: controller.signal, run: () => prepareSpeech(text, lang, reading) });
      drainPreparations();
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [key, enabled, selectedConfiguration]);
  return { ready: status === "ready", preparing: status === "preparing", failed: status === "error" };
}

function waitForAudio(promise, signal) {
  if (signal.aborted) return Promise.reject(new DOMException("Stopped", "AbortError"));
  return new Promise((resolve, reject) => {
    const stopped = () => reject(new DOMException("Stopped", "AbortError"));
    signal.addEventListener("abort", stopped, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", stopped));
  });
}

async function playBlob(blob, slow, reading) {
  const url = URL.createObjectURL(blob);
  const playback = new Audio(url);
  let finish;
  audioUrl = url;
  audio = playback;
  playback.playbackRate = slow ? (reading ? 0.76 : 0.85) : 1;
  playback.preservesPitch = true;
  publish("playing");
  try {
    await new Promise((resolve, reject) => {
      finish = resolve;
      finishPlayback = finish;
      playback.onended = resolve;
      playback.onerror = () => reject(new Error("This device could not play the audio."));
      playback.play().catch(reject);
    });
  } finally {
    if (finishPlayback === finish) finishPlayback = null;
    if (audioUrl === url) {
      URL.revokeObjectURL(url);
      audioUrl = null;
    }
  }
}

function matchingVoice(language, localOnly = false) {
  const synth = window.speechSynthesis;
  const locale = language === "fil" ? /^(fil|tl)(-|_|$)/i : /^en(-|_|$)/i;
  const preferred = language === "fil" ? /^(fil|tl)[-_]PH$/i : /^en[-_]US$/i;
  return synth?.getVoices()
    .filter(voice => locale.test(voice.lang) && (!localOnly || voice.localService))
    .sort((a, b) => Number(preferred.test(b.lang)) - Number(preferred.test(a.lang)))[0];
}

async function playNative(piece, voice, slow) {
  publish("playing");
  let finish;
  try {
    await new Promise((resolve, reject) => {
      finish = resolve;
      finishPlayback = resolve;
      const utterance = new SpeechSynthesisUtterance(piece);
      utterance.voice = voice;
      utterance.lang = voice.lang;
      utterance.rate = slow ? 0.75 : 0.95;
      utterance.onend = resolve;
      utterance.onerror = () => reject(new Error("This device could not play the audio."));
      window.speechSynthesis.speak(utterance);
    });
  } finally {
    if (finishPlayback === finish) finishPlayback = null;
  }
}

export async function speak(text, lang = "en", slow = false, reading = false) {
  stopSpeech();
  if (document.documentElement.dataset.muted === "true" || !text) return;
  const current = generation;
  controller = new AbortController();
  const signal = controller.signal;
  try {
    const parts = Array.isArray(text) ? text : [{ text, lang }];
    const pieces = parts.flatMap(part => speechChunks(part.text, reading).map(piece => ({
      piece, language: part.lang === "fil" ? "fil" : "en",
    })));
    const prepareServer = item => waitForAudio(voiceBlob(item.piece, item.language, reading), signal)
      .then(blob => ({ blob }), error => ({ error }));
    const prepare = index => {
      const item = pieces[index];
      const voice = !reading && !cache.has(speechKey(item.piece, item.language, reading)) && matchingVoice(item.language, true);
      return voice ? Promise.resolve({ voice }) : prepareServer(item);
    };
    let prepared = pieces.length ? prepare(0) : null;
    for (let index = 0; index < pieces.length; index++) {
      publish("loading");
      const item = pieces[index];
      const value = await prepared;
      if (current !== generation) return;
      // One clip ahead keeps reading continuous without queuing a whole story.
      prepared = index + 1 < pieces.length ? prepare(index + 1) : null;
      if (value?.voice) {
        await playNative(item.piece, value.voice, slow);
      } else if (value?.error) {
        if (reading && value.error instanceof TypeError)
          throw new Error("The reading voice is unavailable. Check your internet connection and try Listen again.");
        if (reading) throw value.error;
        const fallback = matchingVoice(item.language);
        if (!fallback) throw value.error;
        await playNative(item.piece, fallback, slow);
      } else if (value) await playBlob(value.blob, slow, reading);
      if (current !== generation) return;
    }
  } catch (error) {
    if (current === generation && error.name !== "AbortError") publish("error", error.message);
  } finally {
    if (current === generation && state.status !== "error") publish("idle");
  }
}
