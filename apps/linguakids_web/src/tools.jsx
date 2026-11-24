import {ModelEvidence} from './backup-transfer';
import { uiText, useUiLanguage } from "./i18n";
import { stopSpeech, useSpeechState } from "./speech";
import { ListenButton } from "./listen-button";
import { useEffect, useRef, useState } from "react";
import { useApp } from "./context";
import { dateText, download, errorText } from "./domain";
import { classroomSentences } from "./classroom-materials";
import {
  Badge,
  Button,
  Empty,
  Field,
  Icon,
  Loading,
  Modal,
  Notice,
  Select,
  Stats,
  useAction,
} from "./ui";

export function Translator({ student = false }) {
  useUiLanguage();
  const { repository, child, data, user } = useApp(),
    action = useAction();
  const [text, setText] = useState(""),
    [source, setSource] = useState("en"),
    [result, setResult] = useState(""),
    [save, setSave] = useState(false),
    [history, setHistory] = useState(null);
  const sampleGrade = user?.grade_levels?.[0] || 1;
  async function translate(e) {
    e.preventDefault();
    await action.run(async () => {
      setResult("");
      const value = await repository.api(
        student ? "/v1/student-translation" : "/v1/translation",
        {
          text: text.trim(),
          source_language: source,
          target_language: source === "en" ? "fil" : "en",
          model_version: "helsinki-opus-mt-pretrained-v1",
          ...(!student
            ? { save_history: save }
            : { student_token: child.token }),
        },
        { student },
      );
      setResult(value.translation);
    });
  }
  return (
    <>
      <div className="page-intro">
        <div>
          <span className="eyebrow">{uiText("BUILD A BRIDGE BETWEEN LANGUAGES")}</span>
          <h2>{uiText("English ↔ Filipino")}</h2>
          <p>{uiText("Short sentences. New connections. Always review a machine translation before teaching it.")}</p>
        </div>
        {!student && (
          <Button
            variant="secondary"
            onClick={() =>
              action.run(async () =>
                setHistory(await repository.api("/v1/ai/history")),
              )
            }
          >{uiText("My history")}</Button>
        )}
      </div>
      <form className="translator panel" onSubmit={translate}>
        <div className="translator-languages">
          <strong>{source === "en" ? uiText("English") : uiText("Filipino")}</strong>
          <button
            type="button"
            className="icon-button"
            aria-label={uiText("Swap languages")}
            disabled={action.busy}
            onClick={() => {
              setSource(source === "en" ? "fil" : "en");
              setResult("");
            }}
          >
            <Icon name="translate" />
          </button>
          <strong>{source === "en" ? uiText("Filipino") : uiText("English")}</strong>
        </div>
        <div className="translator-columns">
          <textarea
            required
            maxLength={300}
            rows={7}
            aria-label={uiText("Text to translate")}
            placeholder={uiText("Type a short sentence…")}
            value={text}
            disabled={action.busy}
            onChange={(e) => {
              setText(e.target.value);
              setResult("");
            }}
          />
          <div className="translation-output" aria-live="polite">
            {result || <span>{uiText("Your translation will appear here.")}</span>}
          </div>
        </div>
        <div className="translator-bottom">
          <small>{text.length}/300</small>
          {!student && !text && (
            <Button type="button" variant="secondary" disabled={action.busy} onClick={() => {
              setText(classroomSentences[sampleGrade][source]);
              setResult("");
            }}>{uiText("Try a Grade ")}{sampleGrade}{uiText(" sentence")}</Button>
          )}
          {!student && (
            <label className="checkbox">
              <input
                type="checkbox"
                checked={save}
                onChange={(e) => setSave(e.target.checked)}
              />{uiText("Save my private history")}</label>
          )}
          <Button type="submit" disabled={action.busy || !text.trim()}>
            {action.busy ? uiText("Translating…") : uiText("Translate")}
            <Icon name="arrow" />
          </Button>
        </div>
        {result && (
          <div className="actions">
            <ListenButton text={result} language={source === "en" ? "fil" : "en"}>{uiText("Listen")}</ListenButton>
            <Button
              variant="ghost"
              type="button"
              onClick={() =>
                action.run(() => navigator.clipboard.writeText(result))
              }
            >{uiText("Copy")}</Button>
            <Button
              variant="ghost"
              type="button"
              onClick={() => {
                setText("");
                setResult("");
              }}
            >{uiText("Clear")}</Button>
          </div>
        )}
        {action.error && <Notice error>{action.error}</Notice>}
      </form>
      {history && (
        <Modal
          title={uiText("My translation history")}
          onClose={() => setHistory(null)}
          wide
        >
          {history.length ? (
            history.map((h) => (
              <article className="history-item" key={h.id}>
                <small>
                  {dateText(h.created_at)} · {h.model_version}
                </small>
                <p>{h.source_text}</p>
                <strong>{h.translation}</strong>
              </article>
            ))
          ) : (
            <Empty title={uiText("No saved translations yet")} />
          )}
        </Modal>
      )}
    </>
  );
}
const MAX_RECORDING_SECONDS = 45;

export function encodeWav(chunks, sampleRate = 16000) {
  const count = chunks.reduce((n, c) => n + c.length, 0),
    samples = new Float32Array(count);
  let position = 0;
  for (const chunk of chunks) {
    samples.set(chunk, position);
    position += chunk.length;
  }
  const length = Math.min(16000 * MAX_RECORDING_SECONDS, Math.floor((count * 16000) / sampleRate)),
    buffer = new ArrayBuffer(44 + length * 2),
    view = new DataView(buffer);
  const string = (offset, s) => {
    for (let i = 0; i < s.length; i++)
      view.setUint8(offset + i, s.charCodeAt(i));
  };
  string(0, "RIFF");
  view.setUint32(4, 36 + length * 2, true);
  string(8, "WAVE");
  string(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true);
  view.setUint32(28, 32000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  string(36, "data");
  view.setUint32(40, length * 2, true);
  for (let i = 0; i < length; i++) {
    const begin = Math.floor((i * sampleRate) / 16000),
      end = Math.min(
        count,
        Math.max(begin + 1, Math.floor(((i + 1) * sampleRate) / 16000)),
      );
    let value = 0;
    for (let j = begin; j < end; j++) value += samples[j];
    value = Math.max(-1, Math.min(1, value / (end - begin)));
    view.setInt16(44 + i * 2, value < 0 ? value * 32768 : value * 32767, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

const MAX_READING_TEXT = 3000;
const READING_PART_CHARACTERS = 240;
const READING_PART_WORDS = 18;

function splitReadingText(text, compact = false) {
  const parts = [];
  let words = [];
  let length = 0;
  for (const word of text.match(/\S+/gu) || []) {
    if (words.length && (words.length >= (compact ? 8 : READING_PART_WORDS) ||
        length + 1 + word.length > (compact ? 72 : READING_PART_CHARACTERS))) {
      parts.push(words.join(" "));
      words = [];
      length = 0;
    }
    length += (words.length ? 1 : 0) + word.length;
    words.push(word);
  }
  if (words.length) parts.push(words.join(" "));
  return parts;
}

export function ReadingPractice({ student = false, passage = "", language = "en", embedded = false, materialId, materialVersion, pageIndex, adventureStepId, onChecked }) {
  useUiLanguage();
  const { repository, child, user } = useApp(),
    action = useAction();
  const [recording, setRecording] = useState(false),
    [seconds, setSeconds] = useState(0),
    [audio, setAudio] = useState(null),
    [url, setUrl] = useState(""),
    [results, setResults] = useState({}),
    [partIndex, setPartIndex] = useState(0),
    [lang, setLang] = useState(language),
    [text, setText] = useState(passage),
    [save, setSave] = useState(false);
  const sampleGrade = user?.grade_levels?.[0] || 1;
  const parts = splitReadingText(text, embedded);
  const part = parts[partIndex] || "";
  const result = results[partIndex];
  const invalidWord = parts.some((item) => item.length > 300);
  const hasReadableText = /[\p{L}\p{N}]/u.test(part) && !invalidWord;
  const recordingRef = useRef(null), collectionAudioId = useRef(null);
  const speech = useSpeechState();
  useEffect(() => { stopSpeech(); }, [part, lang]);
  const alive = useRef(true);
  
  useEffect(() => {
    if (!audio) {
      setUrl("");
      return;
    }
    const object = URL.createObjectURL(audio);
    setUrl(object);
    return () => URL.revokeObjectURL(object);
  }, [audio]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      stopSpeech();
      const r = recordingRef.current;
      if (r) {
        clearInterval(r.timer);clearInterval(r.checkpoint);
        if(repository.collection)void persistRecording(r,true,true);
        r.stream.getTracks().forEach((t) => t.stop());
        r.context.close();
        recordingRef.current = null;
      }
    };
  }, []);
  
  function clearPassage() {
    action.setError("");
    setPartIndex(0);
    setAudio(null);
    setResults({});
  }

  function changePart(index) {
    action.setError("");
    stopSpeech();
    setPartIndex(index);
    setAudio(null);
    setSeconds(0);
  }

  async function persistRecording(r,complete=false,interrupted=false){
    if(!repository.collection || !r.chunks.length)return;
    const frames=r.chunks.reduce((sum,chunk)=>sum+chunk.length,0);
    const blob=encodeWav(r.chunks,r.sampleRate);
    try {await repository.captureRecording(blob,{...r.collectionMeta,revision:frames*2+(complete?1:0),complete,interrupted},r.collectionToken);}
    catch(error){if(alive.current)action.setError(error.message);}
  }
  function stop() {
    const r = recordingRef.current;
    if (!r) return;
    clearInterval(r.timer);clearInterval(r.checkpoint);
    if(repository.collection)void persistRecording(r,true);
    r.node.port.onmessage = null;
    r.node.disconnect();
    r.stream.getTracks().forEach((t) => t.stop());
    r.context.close();
    const hasAudio = r.chunks.some((chunk) => chunk.some((sample) => Math.abs(sample) >= 16 / 32768));
    if (hasAudio) setAudio(encodeWav(r.chunks, r.sampleRate));
    else action.setError(uiText("No speech was recorded. Read aloud and try recording again."));
    recordingRef.current = null;
    setRecording(false);
  }
  async function start() {
    await action.run(async () => {
      stopSpeech();
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "Microphone recording needs a supported browser on localhost or HTTPS.",
        );
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
        video: false,
      });
      if (!alive.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      let context;
      try {
        context = new AudioContext({ sampleRate: 16000 });
        const code =
          "registerProcessor('lk-capture',class extends AudioWorkletProcessor{process(inputs){if(inputs[0]&&inputs[0][0])this.port.postMessage(inputs[0][0].slice());return true}})";
        const module = URL.createObjectURL(
          new Blob([code], { type: "application/javascript" }),
        );
        try {
          await context.audioWorklet.addModule(module);
        } finally {
          URL.revokeObjectURL(module);
        }
        if (!alive.current) {
          stream.getTracks().forEach((t) => t.stop());
          await context.close();
          return;
        }
        const node = new AudioWorkletNode(context, "lk-capture"),
          source = context.createMediaStreamSource(stream),
          lowRumbleFilter = context.createBiquadFilter(),
          mute = context.createGain();
        lowRumbleFilter.type = "highpass";
        lowRumbleFilter.frequency.value = 80;
        lowRumbleFilter.Q.value = 0;
        mute.gain.value = 0;
        source.connect(lowRumbleFilter).connect(node);
        node.connect(mute).connect(context.destination);
        const chunks = [];
        let captured = 0;
        node.port.onmessage = (e) => {
          chunks.push(e.data);
          captured += e.data.length;
          if (captured >= context.sampleRate * MAX_RECORDING_SECONDS) stop();
        };
        const r = {
          stream,
          context,
          node,
          chunks,
          sampleRate: context.sampleRate,
          elapsed: 0,
          collectionMeta:{id:crypto.randomUUID(),child_id:student?child?.child?.id:null,material_id:materialId||null,material_version:materialVersion||null,page:pageIndex??null,part_index:partIndex,adventure_step_id:adventureStepId||null,expected_text:part,language:lang,preview:!student},
          collectionToken:student?child?.token:null,
        };
        if(repository.collection)r.checkpoint=setInterval(()=>{void persistRecording(r,false);},2000);
        recordingRef.current = r;collectionAudioId.current=r.collectionMeta.id;
        setSeconds(0);
        setAudio(null);
        setResults((current) => ({ ...current, [partIndex]: null }));
        setRecording(true);
        r.timer = setInterval(() => {
          r.elapsed++;
          setSeconds(r.elapsed);
          if (r.elapsed >= MAX_RECORDING_SECONDS) stop();
        }, 1000);
        await context.resume();
      } catch (e) {
        stream.getTracks().forEach((t) => t.stop());
        context?.close();
        throw e;
      }
    });
  }
  async function assess(e) {
    e.preventDefault();
    await action.run(async () => {
      if (!audio || !hasReadableText) throw new Error(uiText("Record this part first."));
      const form = new FormData();
      form.append("audio", audio, "reading.wav");
      form.append("expected_text", part);
      if(repository.collection && collectionAudioId.current)form.append("collection_recording_id",collectionAudioId.current);
      form.append("language", lang);
      if (student && adventureStepId) {
        form.append('adventure_step_id', adventureStepId);
        form.append('page_index', String(pageIndex ?? 0));
        form.append('part_index', String(partIndex));
      }
      if (student) form.append("student_token", child.token);
      else form.append("save_attempt", String(save));
      const response = await repository.api(
        `/v1/ai/${student ? "student-reading" : "reading"}`,
        form,
        { student },
      );
      onChecked?.(response);
      if (response.recognition_status === "unclear") {
        throw new Error(uiText("The recording was hard to understand. Listen to it or move closer to the microphone and try again."));
      }
      if (response.speech_detected === false || !(response.transcript || response.recognized_text)?.trim()) {
        setAudio(null);
        throw new Error(uiText("No clear speech was detected. Move closer to the microphone and try again."));
      }
      setResults((current) => ({ ...current, [partIndex]: response }));
    });
  }
  return (
    <>
      {!embedded && <div className="page-intro">
        <div>
          <span className="eyebrow">{uiText("FIND YOUR READING VOICE")}</span>
          <h2>{uiText("A little practice. A little more confidence.")}</h2>
          <p>{uiText("Practice a word, a sentence, or a longer passage. See which words the recording matches.")}</p>
        </div>
      </div>}
      <section className={`panel reading-panel${embedded ? " story-reading-panel" : ""}`} aria-label={embedded ? uiText("Story reading practice") : undefined}>
        <form className="form-stack" onSubmit={assess}>
          {!embedded && <Select
            label={uiText("Reading language")}
            value={lang}
            disabled={recording || action.busy}
            onChange={(e) => { setLang(e.target.value); clearPassage(); }}
            values={[
              ["en", "English"],
              ["fil", "Filipino"],
            ]}
          />}
          <Field label={uiText(embedded ? "Story words to read" : "Type the words you will read aloud")} hint={embedded ? undefined : text.length + "/" + MAX_READING_TEXT}>
            <textarea
              required
              aria-label={uiText(embedded ? "Story words to read" : "Type the words you will read aloud")}
              readOnly={embedded}
              maxLength={embedded ? undefined : MAX_READING_TEXT}
              spellCheck
              lang={lang === "fil" ? "fil-PH" : "en"}
              rows={embedded ? 3 : 4}
              value={embedded ? part : text}
              disabled={!embedded && (recording || action.busy)}
              onChange={(e) => { setText(e.target.value); clearPassage(); }}
              placeholder={uiText("Example: Good morning everyone")}
              style={{fontSize: '16px', fontWeight: 'bold'}}
            />
          </Field>
          {invalidWord && <Notice error>{uiText("Add spaces between long groups of letters.")}</Notice>}
          {!embedded && !student && !text && (
            <Button type="button" variant="secondary" disabled={action.busy}
              onClick={() => { setText(classroomSentences[sampleGrade][lang]); clearPassage(); }}>{uiText("Try a Grade ")}{sampleGrade}{uiText(" sentence")}</Button>
          )}
          {parts.length > 1 && !invalidWord && (
            <div className={embedded ? "story-parts" : undefined}><Notice>
              <strong>{uiText("Part {0} of {1}", [partIndex + 1, parts.length])}</strong>
              {!embedded && <p lang={lang === "fil" ? "fil-PH" : "en"}>{part}</p>}
              <div className="actions">
                <Button type="button" variant="secondary"
                  disabled={recording || action.busy || partIndex === 0}
                  onClick={() => changePart(partIndex - 1)}>{uiText("Previous part")}</Button>
                <Button type="button" variant="secondary"
                  disabled={recording || action.busy || partIndex === parts.length - 1}
                  onClick={() => changePart(partIndex + 1)}>{uiText("Next part")}</Button>
              </div>
              <small>{uiText("{0} of {1} parts checked", [Object.values(results).filter((item) => item?.transcript || item?.recognized_text).length, parts.length])}</small>
            </Notice></div>
          )}
          {hasReadableText && (
            <>
              <div className="actions">
                <ListenButton text={part} language={lang} reading className="button secondary"
                  disabled={recording || action.busy}>{uiText("Listen before recording")}</ListenButton>
                <ListenButton text={part} language={lang} reading slow className="button ghost"
                  disabled={recording || action.busy}>{uiText("Listen slowly")}</ListenButton>
              </div>
              {!embedded && <small>{uiText("Check the spelling and choose the language of the words before listening.")}</small>}
            </>
          )}
          {["loading", "playing"].includes(speech.status) && (
            <div className="actions">
              <span role="status">{uiText(speech.status === "loading" ? "Preparing audio…" : "Reading aloud…")}</span>
              <Button type="button" variant="ghost" onClick={stopSpeech}>{uiText("Stop reading")}</Button>
            </div>
          )}
          <div className="recording-controls">
            {!embedded && <div className={`microphone ${recording ? "recording" : ""}`}>
              <Icon name="mic" size={38} />
            </div>}
            <strong>
              {recording
                ? uiText("🔴 Recording · {0}s / {1}s", [seconds, MAX_RECORDING_SECONDS])
                : hasReadableText
                  ? uiText(embedded ? "Read aloud at your own pace." : "Read the words at your own pace. Pauses are okay.")
                  : uiText("Enter a word or sentence first")}
            </strong>
            <Button
              type="button"
              variant={recording ? "danger" : "secondary"}
              disabled={action.busy || !hasReadableText}
              onClick={recording ? stop : start}
            >
              {recording ? uiText("Stop recording") : uiText("🎤 Start recording")}
            </Button>
            {embedded && <Button type="submit" disabled={!audio || !hasReadableText || recording || action.busy}>
              {action.busy ? uiText("🎧 Listening carefully…") : uiText("Check my reading")}
            </Button>}
          </div>
          {url && (
            <audio controls src={url} aria-label={uiText("Your reading recording")} />
          )}
          {!embedded && !student && (
            <label className="checkbox">
              <input
                type="checkbox"
                checked={save}
                onChange={(e) => setSave(e.target.checked)}
              />{uiText("Save word counts for this recording")}</label>
          )}
          {embedded ? <details className="story-reading-help"><summary>{uiText("About reading checks")}</summary>
            <p>{uiText("This checks recognized words, not a pronunciation grade.")}</p>
            <small>{repository.collection ? "Collection mode: recordings and input are retained on this laptop. Audio checkpoints are saved every two seconds and when recording stops. AI recognition is separate from saving and does not diagnose pronunciation." : uiText("Recordings and transcripts are used for this request and are not kept by LinguaKids. Recognition can miss accents and background speech; it does not diagnose pronunciation.")}</small>
          </details> : <small>{repository.collection ? "Collection mode: recordings and input are retained on this laptop. Audio checkpoints are saved every two seconds and when recording stops. AI recognition is separate from saving and does not diagnose pronunciation." : uiText("Recordings and transcripts are used for this request and are not kept by LinguaKids. Recognition can miss accents and background speech; it does not diagnose pronunciation.")}</small>}
          {action.error && <Notice error>{action.error}</Notice>}
          {!embedded && <Button type="submit" disabled={!audio || !hasReadableText || recording || action.busy}>
            {action.busy ? uiText("🎧 Listening carefully…") : uiText("Check my reading")}
          </Button>}
          {speech.error && <Notice error>{uiText(speech.error)}</Notice>}
        </form>
        {result && (
          <div className="reading-result">
            <h3>{uiText("Here's what we heard")}</h3>
            <p>
              {result.transcript || result.recognized_text ||
                uiText("No clear speech was detected. Move closer to the microphone and try again.")}
            </p>
            
            {(result.transcript || result.recognized_text) && result.word_results?.length > 0 && (
              <div className="word-level-feedback">
                <h4>{uiText("Word-by-word feedback:")}</h4>
                <div className="word-grid">
                  {result.word_results.map((wordInfo, i) => (
                    <div 
                    key={i}
                    className={`word-item ${wordInfo.correct ? 'correct' : 'unconfirmed'}`}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '8px 12px',
                        margin: '4px',
                        borderRadius: '8px',
                        backgroundColor: wordInfo.correct ? '#d4edda' : '#fff3d3',
                        border: wordInfo.correct ? '2px solid #268043' : '2px solid #b78315',
                        fontSize: '18px',
                        fontWeight: 'bold'
                      }}
                    >
                      <span aria-label={uiText(wordInfo.correct ? "{0} matched" : "{0} not confirmed", [wordInfo.word])}>
                        {wordInfo.word}
                      </span>
                      {!wordInfo.correct && (
                        <ListenButton
                          text={wordInfo.word}
                          language={lang}
                          slow
                          reading
                          className="button ghost"
                          aria-label={uiText("Listen to an example of {0}", [wordInfo.word])}
                          disabled={recording || action.busy}
                        />
                      )}
                    </div>
                  ))}
                </div>
                <p style={{marginTop: '16px', fontSize: '14px', color: '#666'}}>
                  {uiText("Green words matched. Yellow words were not confirmed by the app. Listen to your recording to check them.")}</p>
              </div>
            )}
            
            {(result.transcript || result.recognized_text) && (
              <Stats items={[
                ["Words matched", result.matched_words?.length || 0, "check"],
                ["Words not confirmed", result.missing_words?.length || 0, "book"],
              ]} />
            )}
            {(result.transcript || result.recognized_text) && partIndex < parts.length - 1 && (
              <Button type="button" disabled={recording || action.busy}
                onClick={() => changePart(partIndex + 1)}>{uiText("Record the next part")}</Button>
            )}
          </div>
        )}
      </section>
    </>
  );
}
export function AIManagement() {
  useUiLanguage();
  const { repository, data } = useApp(),
    action = useAction();
  const [jobs, setJobs] = useState(null),
    [queue, setQueue] = useState(false);
  async function load() {
    await action.run(async () => setJobs(await repository.api("/v1/ai/jobs")));
  }
  useEffect(() => {
    load();
  }, []);
  return (
    <>
      <div className="page-intro">
        <div>
          <span className="eyebrow">{uiText("THOUGHTFUL TOOLS FOR LEARNING")}</span>
          <h2>{uiText("Training runs")}</h2>
          <p>{uiText("Queue and monitor training runs. Datasets, packages, and model review are available in the tabs above.")}</p>
        </div>
        <div className="actions">
          <Button
            variant="secondary"
            icon="refresh"
            disabled={action.busy}
            onClick={load}
          >{uiText("Refresh")}</Button>
          <Button icon="plus" onClick={() => { action.setError(""); setQueue(true); }}>{uiText("Start training job")}</Button>
        </div>
      </div>
      <ModelEvidence/>
      <Stats
        items={[
          [
            "Approved datasets",
            data.records.filter(
              (r) => r.kind === "dataset" && r.status === "published",
            ).length,
            "table",
          ],
          ["Training jobs", jobs?.length ?? "—", "spark"],
          ["Active model", data.model_status?.available ? data.model_status.version : "None", "layers"],
        ]}
      />
      {!queue && action.error && <Notice error>{action.error}</Notice>}
      {jobs === null && !action.error ? (
        <Loading />
      ) : (
        <div className="record-list">
          {(jobs || []).map((job) => (
            <article className="panel" key={job.id}>
              <div className="section-heading">
                <h3>{uiText("Training run · ")}{job.id.slice(0, 8)}</h3>
                <Badge>{job.status}</Badge>
              </div>
              <p>
                {dateText(job.created_at)} · {job.configuration?.epochs}{uiText(" epochs · batch ")}{job.configuration?.batch_size}
              </p>
              <progress
                max="100"
                value={
                  job.status === "completed"
                    ? 100
                    : typeof job.progress === "number"
                      ? job.progress
                      : job.progress?.percent
                }
              />
              <small>{uiText("Stage: ")}{job.progress?.phase || job.status}</small>
              {job.error && <p className="job-error-summary">{uiText("This run reported an error. Open run details to review it.")}</p>}
              <details className="admin-disclosure"><summary>{uiText("Run details")}</summary>
              {job.error && (
                <Notice error>
                  {typeof job.error === "string"
                    ? job.error
                    : JSON.stringify(job.error)}
                </Notice>
              )}
              {job.metrics && (
                <div className="metric-list">
                  {Object.entries(job.metrics).map(([direction, value]) => (
                    <div key={direction}>
                      <strong>{direction.replaceAll("_", " ")}</strong>
                      <p>
                        {typeof value === "object"
                          ? Object.entries(value)
                              .filter(([, v]) => typeof v !== "object")
                              .map(([k, v]) => `${k}: ${v}`)
                              .join(" · ")
                          : String(value)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              {job.status === "completed" && (
                <Notice>{uiText("Training completed. Human review and measured evaluation are still required before approval and activation.")}</Notice>
              )}
              <Button
                variant="ghost"
                onClick={() =>
                  download(
                    `training-${job.id}.json`,
                    JSON.stringify(job, null, 2),
                  )
                }
              >{uiText("Download run details")}</Button>
              </details>
            </article>
          ))}
        </div>
      )}
      {jobs?.length === 0 && <Empty title={uiText("No training jobs yet")} />}
      {queue && (
        <Modal title={uiText("Start a training job")} onClose={() => setQueue(false)}>
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              action.run(async () => {
                await repository.api("/v1/ai/jobs", {
                  dataset_record_id: f.get("dataset"),
                  epochs: Number(f.get("epochs")),
                  batch_size: Number(f.get("batch")),
                });
                setQueue(false);
                setJobs(await repository.api("/v1/ai/jobs"));
              });
            }}
          >
            <p>{uiText("Use reviewed data with documented usage rights. Training keeps one copy of repeated pairs. Edit conflicting translations under Datasets.")}</p>
            <Select
              label={uiText("Approved dataset")}
              name="dataset"
              required
              values={[
                ["", "Choose a dataset"],
                ...data.records
                  .filter(
                    (r) => r.kind === "dataset" && r.status === "published",
                  )
                  .map((r) => [r.id, r.title]),
              ]}
            />
            <Field
              label={uiText("Epochs")}
              type="number"
              name="epochs"
              min={1}
              max={20}
              defaultValue={1}
              required
            />
            <Field
              label={uiText("Batch size")}
              type="number"
              name="batch"
              min={1}
              max={16}
              defaultValue={2}
              required
            />
            {action.error && <Notice error>{action.error}</Notice>}
            <Button type="submit" disabled={action.busy}>{uiText("Queue training job")}</Button>
          </form>
        </Modal>
      )}
    </>
  );
}
export function ModelRegistry() {
  useUiLanguage();
  const { repository, data, refresh } = useApp(),
    action = useAction();
  const [importing, setImporting] = useState(false),
    [payload, setPayload] = useState(null),
    [notes, setNotes] = useState(""),
    [confirm, setConfirm] = useState(null);
  return (
    <>
      <div className="page-intro">
        <div>
          <span className="eyebrow">{uiText("REVIEW BEFORE RELEASE")}</span>
          <h2>{uiText("Model registry")}</h2>
          <p>{uiText("Measured results and human review guide every approval.")}</p>
        </div>
        <Button
          icon="plus"
          onClick={() => {
            setImporting(true);
            setPayload(null);
          }}
        >{uiText("Import model & evaluation")}</Button>
      </div>
      {action.error && <Notice error>{action.error}</Notice>}
      <Notice>
        {data.model_status?.available
          ? uiText("Active model: {0} ({1})", [data.model_status.version, data.model_status.source])
          : uiText("No translation model is active. Mount and review an approved model before activation.")}
      </Notice>
      {data.active_model && (
        <Button
          variant="secondary"
          onClick={() => setConfirm({ rollback: true })}
        >{uiText("Roll back active model")}</Button>
      )}
      <div className="record-list">
        {data.models.map((model) => (
          <article className="panel" key={model.id}>
            <div className="section-heading">
              <h3>
                {model.name} · {model.version}
              </h3>
              <Badge>{model.state}</Badge>
            </div>
            <details className="admin-disclosure"><summary>{uiText("Evaluation & artifact details")}</summary>
            <small>{uiText("SHA-256: ")}{model.artifact_checksum}</small>
            <p>{model.artifact_uri}</p>
            <div className="metric-list">
              {(data.model_evaluations || [])
                .filter((e) => e.model_version_id === model.id)
                .map((e) => (
                  <div key={e.id}>
                    <strong>{e.direction}</strong>
                    <p>{uiText("BLEU ")}{e.sacrebleu}{uiText(" · chrF ")}{e.chrf} · {e.sample_count}{" "}{uiText("samples")}</p>
                    <small>{e.human_review?.notes}</small>
                  </div>
                ))}
            </div>
            </details>
            <div className="actions">
              {model.state === "candidate" && (
                <Button
                  variant="secondary"
                  onClick={() => setConfirm({ model, approve: true })}
                >{uiText("Approve reviewed model")}</Button>
              )}
              {model.state === "approved" && (
                <Button onClick={() => setConfirm({ model })}>{uiText("Activate model")}</Button>
              )}
            </div>
          </article>
        ))}
      </div>
      {!data.models.length && <Empty title={uiText("No models registered yet")} />}
      {importing && (
        <Modal
          title={uiText("Import model & measured evaluation")}
          onClose={() => setImporting(false)}
        >
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              action.run(async () => {
                if (!payload)
                  throw new Error("Choose the model registration JSON file.");
                await repository.rpc(
                  payload.manifest?.provenance === "upstream_pretrained"
                    ? "register_pretrained_model"
                    : "register_trained_model",
                  { p_data: { ...payload, review_notes: notes } },
                );
                await refresh();
                setImporting(false);
              });
            }}
          >
            <p>{uiText("Choose a registration JSON containing the hosted artifact, checksum, provenance, and measured results for both directions.")}</p>
            <Field label={uiText("Registration JSON")}>
              <input
                type="file"
                required
                accept=".json,application/json"
                onChange={async (e) => {
                  await action.run(async () => {
                    const file = e.target.files[0];
                    if (file.size > 1000000)
                      throw new Error(
                        "Choose a registration file smaller than 1 MB.",
                      );
                    setPayload(JSON.parse(await file.text()));
                  });
                }}
              />
            </Field>
            {payload && (
              <Notice>
                {payload.name} · {payload.version}
              </Notice>
            )}
            <Field label={uiText("Human review notes")}>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                required
                minLength={20}
                rows={5}
              />
            </Field>
            {action.error && <Notice error>{action.error}</Notice>}
            <Button type="submit" disabled={action.busy}>{uiText("Register candidate")}</Button>
          </form>
        </Modal>
      )}
      {confirm && (
        <Modal
          title={
            confirm.rollback
              ? uiText("Roll back active model")
              : confirm.approve
                ? uiText("Approve reviewed model")
                : uiText("Activate translation model")
          }
          onClose={() => setConfirm(null)}
        >
          <p>
            {confirm.rollback
              ? uiText("Return to the previous approved model.")
              : `${confirm.model.name} · ${confirm.model.version}`}
          </p>
          <p>
            {confirm.approve
              ? uiText("Confirm you reviewed both translation directions and their classroom suitability.")
              : uiText("The approved artifact must be mounted on the private inference service. This affects subsequent translation requests.")}
          </p>
          {action.error && <Notice error>{action.error}</Notice>}
          <Button
            disabled={action.busy}
            onClick={() =>
              action.run(async () => {
                if (confirm.approve)
                  await repository.rpc("approve_trained_model", {
                    p_id: confirm.model.id,
                  });
                else
                  await repository.rpc("workspace_model_action", {
                    p_id: confirm.model?.id || null,
                    p_checksum: confirm.model?.artifact_checksum || "",
                    p_rollback: !!confirm.rollback,
                  });
                await refresh();
                setConfirm(null);
              })
            }
          >{uiText("Confirm")}{" "}
            {confirm.approve
              ? uiText("approval")
              : confirm.rollback
                ? uiText("rollback")
                : uiText("activation")}
          </Button>
        </Modal>
      )}
    </>
  );
}


