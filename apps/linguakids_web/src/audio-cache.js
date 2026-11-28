const NAME = "linguakids-voices-neural-v1";
const MAX_BYTES = 24 * 1024 * 1024;
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;
let library;

async function fingerprint(value) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)));
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function readBundledAudio(text, language, signal) {
  try {
    if (!globalThis.crypto?.subtle) return null;
    const voice = language === "fil" ? "fil-PH-BlessicaNeural" : "en-US-AriaNeural";
    const id = await fingerprint(["neural-classroom-v1", voice, text.trim().replace(/\s+/g, " ")]);
    if (!library) {
      library = fetch("/voices/manifest.json")
        .then(response => {
          if (!response.ok) throw new Error("The public audio library is unavailable.");
          return response.json();
        })
        .then(value => new Set(value.files || []))
        .catch(() => { library = null; return new Set(); });
    }
    if (!(await library).has(id)) return null;
    const response = await fetch(`/voices/${id}.mp3`, { cache: "force-cache", signal });
    return response.ok ? await response.blob() : null;
  } catch {
    return null;
  }
}

async function locationFor(scope, key) {
  if (!scope || !globalThis.caches || !globalThis.crypto?.subtle) return null;
  const id = await fingerprint([scope, key]);
  return new URL(`/__saved_voice__/${id}`, window.location.origin).href;
}

export async function readStoredAudio(scope, key) {
  try {
    const url = await locationFor(scope, key);
    if (!url) return null;
    const saved = await caches.open(NAME);
    const response = await saved.match(url);
    if (!response) return null;
    if (Date.now() - Number(response.headers.get("X-Saved-At")) > MAX_AGE) {
      await saved.delete(url);
      return null;
    }
    return await response.blob();
  } catch {
    return null;
  }
}

export async function storeAudio(scope, key, blob) {
  try {
    const url = await locationFor(scope, key);
    if (!url || blob.size > 2_000_000) return;
    const saved = await caches.open(NAME);
    await saved.put(url, new Response(blob, { headers: {
      "Content-Type": blob.type,
      "X-Saved-At": String(Date.now()),
      "Content-Length": String(blob.size),
    } }));
    const entries = [];
    for (const request of await saved.keys()) {
      const response = await saved.match(request);
      if (response) entries.push({ request, size: Number(response.headers.get("Content-Length")), time: Number(response.headers.get("X-Saved-At")) });
    }
    entries.sort((a, b) => a.time - b.time);
    let total = entries.reduce((sum, entry) => sum + entry.size, 0);
    let count = entries.length;
    for (const entry of entries) {
      if (total <= MAX_BYTES && count <= 96 && Date.now() - entry.time < MAX_AGE) break;
      await saved.delete(entry.request);
      total -= entry.size;
      count--;
    }
  } catch {
    // Audio can still play when this browser has no storage space available.
  }
}
