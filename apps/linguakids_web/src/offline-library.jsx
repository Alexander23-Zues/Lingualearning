import { uiText, useUiLanguage } from "./i18n";
import { useEffect, useState } from "react";
import { MaterialReader } from "./reader";
import { supportsWordGarden } from "./word-garden";
import { Brand, Button, Empty, Notice, Search, Select } from "./ui";

const categories = [["lesson", "Lessons"], ["story", "Stories"], ["game", "Games"], ["dictionary", "Dictionary"]];
const libraryUrl = "/offline-library.json";
const workerUrl = "/linguakids-library-sw.js";

async function savedOnDevice() {
  if (!("serviceWorker" in navigator) || !("caches" in window)) return false;
  const registration = await navigator.serviceWorker.getRegistration();
  const names = await caches.keys();
  const libraryCache = names.find(name => name.startsWith("linguakids-learning-library-"));
  const saved = libraryCache && await caches.match(libraryUrl, { cacheName: libraryCache });
  return !!saved && registration?.active?.scriptURL.endsWith(workerUrl);
}

export function OfflineLibrary() {
  useUiLanguage();
  const [library, setLibrary] = useState(null);
  const [category, setCategory] = useState("lesson");
  const [grade, setGrade] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch(libraryUrl, { signal: controller.signal }).then(response => {
      if (!response.ok) throw new Error("Open the library while connected to download it.");
      return response.json();
    }).then(setLibrary).catch(error => {
      if (!controller.signal.aborted) setError(error.message);
    });
    savedOnDevice().then(setSaved).catch(() => {});
    return () => controller.abort();
  }, []);

  async function saveLibrary() {
    setBusy(true);
    setError("");
    let timer;
    try {
      if (!("serviceWorker" in navigator) || !("caches" in window)) throw new Error("Open LinguaKids over HTTPS in a browser that supports offline storage.");
      const registration = await navigator.serviceWorker.register(workerUrl, { updateViaCache: "none" });
      // The first install already checked the network. Returning users check for a new release.
      if (registration.active) await registration.update();
      const installing = registration.installing || registration.waiting;
      const activated = installing && new Promise((resolve, reject) => {
        function check() {
          if (installing.state === "activated" || installing.state === "redundant") {
            installing.removeEventListener("statechange", check);
            if (installing.state === "activated") resolve();
            else reject(new Error(registration.active
              ? "The update could not finish. Your previous download is still available."
              : "The library could not download. Check your connection and try again."));
          }
        }
        installing.addEventListener("statechange", check);
        check();
      });
      await Promise.race([
        activated || navigator.serviceWorker.ready,
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("The download could not finish. Reconnect and try again.")), 120000); }),
      ]);
      if (!await savedOnDevice()) throw new Error("The library is still downloading. Try again in a moment.");
      setSaved(true);
      const response = await fetch(libraryUrl);
      if (response.ok) setLibrary(await response.json());
    } catch (error) {
      setError(error.message || "Could not save the library. Check your connection and storage.");
    } finally {
      clearTimeout(timer);
      setBusy(false);
    }
  }

  const term = query.trim().toLocaleLowerCase();
  const matches = text => text.toLocaleLowerCase().includes(term);
  const dictionary = category === "dictionary";
  const rows = dictionary
    ? (library?.dictionary || []).filter(word => (!grade || word.grade <= Number(grade)) && matches(`${word.en} ${word.fil}`))
    : (library?.materials || []).filter(material =>
      material.kind === category && (!grade || material.grade_level === Number(grade)) && matches(material.title));
  return (
    <main className="offline-library">
      <header className="offline-library-header">
        <a href="/" aria-label={uiText("Open LinguaKids online")}><Brand /></a>
        <a className="button secondary" href="/#/login">{uiText("Online workspace")}</a>
      </header>
      <section className="offline-library-intro">
        <h1>{uiText("Offline Library")}</h1>
        <p>{uiText("Read, play, and look up words on this device. Graded activities and student records are available in the online workspace.")}</p>
        <div className="actions">
          <Button disabled={busy || !library} onClick={saveLibrary}>{busy ? uiText("Downloading…") : saved ? uiText("Check for updates") : uiText("Save library on this device")}</Button>
          {saved && <span role="status">{uiText("Available offline on this browser")}</span>}
        </div>
        {error && <Notice error>{error}</Notice>}
      </section>
      <div className="offline-library-categories" role="group" aria-label={uiText("Learning activities")}>
        {categories.map(([key, label]) => <Button key={key} variant={category === key ? "" : "secondary"}
          aria-pressed={category === key} onClick={() => { setCategory(key); setQuery(""); }}>{label}</Button>)}
      </div>
      <div className="offline-library-filters">
        <Search value={query} label={dictionary ? uiText("Search dictionary") : uiText("Search activities")} onChange={setQuery} />
        <Select label={dictionary ? uiText("Word level") : uiText("Grade")} value={grade} onChange={event => setGrade(event.target.value)}
          values={[["", "All grades"], ...[1, 2, 3, 4, 5, 6].map(level => [String(level), `Grade ${level}`])]} />
      </div>
      {library && (dictionary ? (
        <dl className="offline-library-grid offline-words">{rows.map(word =>
          <div className="panel" key={JSON.stringify([word.en, word.fil])}><dt>{word.en}</dt><dd lang="fil">{word.fil}</dd></div>)}</dl>
      ) : (
        <div className="offline-library-grid">{rows.map(material =>
          <article className="panel" key={material.id}>
            <small>{uiText("Grade ")}{material.grade_level}</small>
            <h2>{material.title}</h2>
            <Button variant="secondary" onClick={() => setSelected(material)}>{category === "game" ? uiText("Play") : uiText("Read")}</Button>
          </article>)}</div>
      ))}
      {library && rows.length === 0 && <Empty title={uiText("No matches")}>{uiText("Try another search or grade.")}</Empty>}
      {!library && !error && <p role="status">{uiText("Opening the library…")}</p>}
      {selected && <MaterialReader key={selected.id} material={selected} offlinePractice
        initialGameMode={selected.body.collection === "word-garden-classroom-v1" && supportsWordGarden(selected.body.pairs) ? "word-builder" : "matching"}
        onClose={() => setSelected(null)} />}
    </main>
  );
}
