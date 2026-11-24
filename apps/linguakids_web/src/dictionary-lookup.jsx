import { useEffect, useRef, useState } from "react";
import { useApp } from "./context";
import { uiText, useUiLanguage } from "./i18n";
import { ListenButton } from "./listen-button";
import { Button, Notice, Search } from "./ui";

export function DictionaryLookup({ query, onChange }) {
  useUiLanguage();
  const { repository } = useApp();
  const [ownQuery, setOwnQuery] = useState("");
  const term = (query ?? ownQuery).trim();
  const change = onChange ?? setOwnQuery;
  const [state, setState] = useState(null);
  const request = useRef(null);

  useEffect(() => () => request.current?.abort(), [term]);

  async function lookup(event) {
    event.preventDefault();
    if (!term || term.length > 80) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setState({ term, busy: true });
    try {
      const data = await repository.api("/v1/dictionary?q=" + encodeURIComponent(term), undefined, {
        signal: controller.signal, student: true,
      });
      if (!controller.signal.aborted) setState({ term, data });
    } catch {
      if (!controller.signal.aborted) setState({ term, error: true });
    }
  }

  const visible = state?.term === term ? state : null;
  const data = visible?.data;
  return (
    <section aria-label={uiText(repository.collection?'Saved offline dictionary':'Online dictionary')}>
      <form className="actions" onSubmit={lookup}>
        <Search label={uiText("Search dictionary")} placeholder={uiText("Search English or Filipino")}
          value={query ?? ownQuery} onChange={change} />
        <Button type="submit" variant="secondary" disabled={!term || term.length > 80 || visible?.busy}>
          {uiText("Look up definitions")}
        </Button>
      </form>
      {term.length > 80 && <Notice>{uiText("Enter a word or short phrase to look up.")}</Notice>}
      {visible?.busy && <p role="status">{uiText("Looking up definitions…")}</p>}
      {visible?.error && <Notice error>{uiText(repository.collection?'The saved dictionary could not be loaded. Try again.':'The online dictionary is unavailable. Check your connection and try again.')}</Notice>}
      {data?.entries?.length > 0 && (
        <article className="panel">
          <h3>{data.word}</h3>
          {data.entries.map((entry, index) => (
            <section key={index}>
              <h4>{uiText(entry.language === "fil" ? "Tagalog" : "English")} · {entry.part_of_speech}</h4>
              {data.entries.findIndex((item) => item.language === entry.language) === index &&
                <ListenButton text={data.word} language={entry.language}>{uiText("Listen")}</ListenButton>}
              <ol>{entry.definitions.map((definition, i) => <li key={i}>{definition}</li>)}</ol>
            </section>
          ))}
          {data.offline?<small>{uiText('Saved bilingual word list · available offline')}</small>:<small>
            <a href={"https://en.wiktionary.org/wiki/" + encodeURIComponent(data.word)} target="_blank" rel="noreferrer">Wiktionary</a>
            {" · "}
            <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA 4.0</a>
          </small>}
        </article>
      )}
      {data && !data.entries?.length && (
        <Notice>
          {uiText(repository.collection?'This word is not in the saved word list. Connect online for a broader dictionary lookup.':'No English or Tagalog definition found. Check the spelling.')}
          {data.suggestions?.length > 0 && (
            <div className="actions">{data.suggestions.map((suggestion) => (
              <Button key={suggestion} type="button" variant="ghost" onClick={() => { change(suggestion); setState(null); }}>
                {suggestion}
              </Button>
            ))}</div>
          )}
        </Notice>
      )}
    </section>
  );
}
