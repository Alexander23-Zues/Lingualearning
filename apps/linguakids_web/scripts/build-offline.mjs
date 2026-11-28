import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const manifest = JSON.parse(await readFile("dist/.vite/manifest.json", "utf8"));
const paths = new Set([
  "offline.html",
  "offline-library.json",
  "favicon.svg",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/maskable-512.png",
  "icons/apple-touch-icon.png",
  // The story reader uses this atlas. The other illustrations belong to the online workspace.
  "assets/animal-story-atlas.png",
  "assets/Baloo2-Variable.ttf",
]);
const visited = new Set();
function include(key) {
  if (visited.has(key)) return;
  visited.add(key);
  const entry = manifest[key];
  if (!entry) throw new Error(`Missing offline bundle entry ${key}`);
  for (const file of [entry.file, ...(entry.css || []), ...(entry.assets || [])]) paths.add(file);
  for (const dependency of entry.imports || []) include(dependency);
}
include("offline.html");
const hash = createHash("sha256").update(await readFile(new URL(import.meta.url)));
let bytes = 0;
for (const path of paths) {
  const file = await readFile("dist/" + path);
  bytes += file.length;
  hash.update(path).update(file);
}
const urls = [...paths].map(path => "/" + path);
const name = "linguakids-learning-library-" + hash.digest("hex").slice(0, 16);
const worker = `
const NAME = ${JSON.stringify(name)};
const ASSETS = new Set(${JSON.stringify(urls)});
self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(NAME);
    try {
      await cache.addAll([...ASSETS].map(path => new Request(path, { cache: "reload" })));
    } catch (error) {
      await caches.delete(NAME);
      throw error;
    }
    await self.skipWaiting();
  })());
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name !== NAME && name.startsWith("linguakids-learning-library-")) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  if (event.request.mode === "navigate" && !url.search && ["/", "/index.html"].includes(url.pathname)) {
    event.respondWith(fetch(event.request).catch(async () => {
      const cache = await caches.open(NAME);
      return await cache.match("/offline.html") || Response.error();
    }));
    return;
  }
  if (!ASSETS.has(url.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(NAME);
    return await cache.match(url.pathname) || fetch(event.request);
  })());
});
`;
await writeFile("dist/linguakids-library-sw.js", worker);
console.log(`Offline Library includes ${urls.length} files (${(bytes / 1024 / 1024).toFixed(1)} MB).`);
