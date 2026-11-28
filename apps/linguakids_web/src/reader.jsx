import { DictionaryLookup } from "./dictionary-lookup";
import { uiText, useUiLanguage } from "./i18n";
import { LessonArt } from "./lesson-art";
import { LessonSource } from './lesson-source';
import { WordGarden, supportsWordGarden } from './word-garden';
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useApp } from "./context";
import {
  avatars,
  materialTitle,
  materialKindMatches,
  safeWebUrl,
  errorText,
  download,
  worksheetHtml,
  learningShelf,
} from "./domain";
import {
  Badge,
  Button,
  Empty,
  Icon,
  Loading,
  Modal,
  Notice,
  Select,
  useAction,
} from "./ui";
import { ReadingPractice, Translator } from "./tools";
import { AnimalScene, cartoonFriends, FriendArt } from "./art";
import { stopSpeech, useSpeechState } from './speech';
import { ListenButton } from './listen-button';
import { StudentAdventure } from './adventure/StudentAdventure';

export function MaterialReader({
  material,
  onClose,
  onComplete,
  student = false,
  offlinePractice = false,
  initialLanguage,
  initialGameMode = 'matching',
  guidedStep,
  onRetry,
  onReadingUpdate,
}) {
  useUiLanguage();
  const collectionApp = useApp();
  const [gameMode, setGameMode] = useState(initialGameMode);
  const [practice, setPractice] = useState(Boolean(guidedStep && material.kind === 'story'));
  const [visited, setVisited] = useState(() => new Set([0]));
  const speech = useSpeechState();
  const [page, setPage] = useState(0),
    [answers, setAnswers] = useState({}),
    [result, setResult] = useState(null),
    [lang, setLang] = useState(
      initialLanguage ||
        (document.documentElement.lang === "fil" ? "fil" : "both"),
    ),
    action = useAction();
  const [submissionId] = useState(() => crypto.randomUUID());
  const readerRef = useRef(null);
  useEffect(()=>{
    if(!collectionApp?.repository.collection || !Object.keys(answers).length)return;
    void collectionApp.repository.captureDraft({id:'activity-'+submissionId,kind:'activity_answers',title:material.title,material_id:material.id,material_version:material.version,child_id:student?collectionApp.child?.child?.id:null,preview:!student,answers},student?collectionApp.child?.token:null).catch(()=>{});
  },[answers,submissionId]);
  useEffect(() => {
    setVisited(previous => new Set([...previous, page]));
    const dialog = readerRef.current?.closest('dialog');
    if (dialog) dialog.scrollTop = 0;
    stopSpeech();
  }, [page, lang, practice]);
  const body = material.body || {},
    questions = body.questions || [],
    pages = body.pages?.length
      ? body.pages
      : [{ english: body.english, filipino: body.filipino }],
    pairs = body.pairs || [];
  const quiz = material.kind === "quiz",
    game = material.kind === "game";
  const current = quiz ? questions[page] : pages[page];
  const count = quiz ? questions.length : game ? 1 : pages.length;
  const complete = quiz
    ? questions.length > 0 && questions.every((q) => answers[q.id])
    : game
      ? pairs.length > 0 && pairs.every((p) => answers[p.en] === p.fil)
      : page === pages.length - 1 && (!guidedStep || visited.size === pages.length);
  useEffect(
    () => () => {
      stopSpeech();
    },
    [],
  );
  async function finish() {
    await action.run(async () => {
      if (!complete) throw new Error("Finish every part before submitting.");
      const value = onComplete
        ? await onComplete(guidedStep && !quiz && !game ? {...answers, _visited_pages:[...visited]} : answers, submissionId)
        : { preview: true };
      setResult(value);
    });
  }
  return (
    <Modal title={materialTitle(material)} onClose={onClose} wide>
      <div className={`reader${practice ? " story-practice-mode" : ""}`} ref={readerRef}>
        {!student && quiz && (
          <Button
            variant="secondary"
            icon="download"
            onClick={() =>
              download(
                `${material.title}-worksheet.html`,
                worksheetHtml(material),
                "text/html",
              )
            }
          >{uiText("Download worksheet")}</Button>
        )}
        <div className={`reader-meta ${game ? 'game-reader-meta' : ''}`}>
          {game ? <small>{uiText("Grade ")}{material.grade_level}{offlinePractice ? uiText(' · Offline practice') : !student && uiText(' · Educator preview · no student grade')}</small> : <>
          <Badge>{uiText("Grade ")}{material.grade_level}</Badge>
          <Badge>{material.kind}</Badge>
          {offlinePractice ? <Badge>{uiText("Offline practice")}</Badge> : !student && <Badge>{uiText("Educator preview · no student grade")}</Badge>}
          </>}
        </div>
        {!student && !practice && <LessonSource material={material} offline={offlinePractice}/>}
        {!result && (
          <>
            {game && !guidedStep && supportsWordGarden(pairs) && <div className="game-mode-picker" role="group" aria-label={uiText("Game mode")}>
              <span>{uiText("Play your way")}</span>
              <button type="button" aria-pressed={gameMode === 'matching'} onClick={() => {if(gameMode !== 'matching'){setGameMode('matching');setAnswers({});}}}>{uiText("Match words")}</button>
              <button type="button" aria-pressed={gameMode === 'word-builder'} onClick={() => {if(gameMode !== 'word-builder'){setGameMode('word-builder');setAnswers({});}}}>{uiText("Word Garden")}</button>
            </div>}
            {game && !guidedStep && supportsWordGarden(pairs) && <p className="game-mode-note">{uiText("Changing game mode starts a fresh round.")}</p>}
            {quiz ? (
              <section className="quiz-question">
                <span className="eyebrow">{uiText("QUESTION ")}{page + 1}{uiText(" OF ")}{count}
                </span>
                <h2>{current?.prompt}</h2>
                <div className="answer-options">
                  {current?.options.map((o, i) => (
                    <button
                      key={o.id}
                      className={answers[current.id] === o.id ? "selected" : ""}
                      aria-label={`${String.fromCharCode(65 + i)}. ${o.text}`}
                      onClick={() =>
                        setAnswers({ ...answers, [current.id]: o.id })
                      }
                    >
                      <span>{String.fromCharCode(65 + i)}</span>
                      {o.text}
                    </button>
                  ))}
                </div>
              </section>
            ) : game && gameMode === 'word-builder' && supportsWordGarden(pairs) ? (
              <WordGarden pairs={pairs} answers={answers} onSolve={pair => setAnswers(previous => ({...previous, [pair.en]: pair.fil}))} />
            ) : game ? (
              <section>
                <span className="eyebrow">{uiText("LET'S FIND A MATCH")}</span>
                <h2>{uiText("Which Filipino word belongs with each English word?")}</h2>
                <div className="matching">
                  {pairs.map((pair, i) => (
                    <div key={i}>
                      <strong>{pair.en}</strong>
                      <Select
                        label={uiText("Match for {0}", [pair.en])}
                        value={answers[pair.en] || ""}
                        onChange={(e) =>
                          setAnswers({ ...answers, [pair.en]: e.target.value })
                        }
                        values={[
                          ["", "Choose a word"],
                          ...pairs.map((p) => [p.fil, p.fil]),
                        ]}
                      />
                      {answers[pair.en] === pair.fil ? (
                        <span aria-label={uiText("Correct match")}>✓</span>
                      ) : (
                        answers[pair.en] && <small>{uiText("Try another word 🌱")}</small>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ) : pairs.length ? (
              <section className="word-pairs">
                {pairs.map((p, i) => (
                  <article key={i}>
                    <strong lang="en">{p.en}</strong>
                    <span lang="fil">{p.fil}</span>
                    {!offlinePractice && <div className="actions">
                      <ListenButton text={p.en} language="en" aria-label={uiText("Listen in English to {0}", [p.en])}>{uiText("English")}</ListenButton>
                      <ListenButton text={p.fil} language="fil" aria-label={uiText("Listen in Tagalog to {0}", [p.fil])}>{uiText("Tagalog")}</ListenButton>
                    </div>}
                  </article>
                ))}
              </section>
            ) : (
              <section className="story-page">
                {material.kind === "story" && !guidedStep && <div className="story-reader-tools">
                  <Select label={uiText("Reading language")} value={lang} onChange={e => setLang(e.target.value)}
                    values={[...(!practice ? [["both", "English + Filipino"]] : []), ["en", "English"], ["fil", "Filipino"]]} />
                  {!offlinePractice && <Button variant="secondary" icon={practice ? "back" : "mic"} aria-expanded={practice} onClick={() => {if (!practice && lang === "both") setLang("en"); setPractice(!practice);}}>
                    <span className={practice ? "practice-back-label" : undefined}>{uiText(practice ? "Close reading practice" : "Practice reading this story")}</span>
                  </Button>}
                </div>}
                {!practice && <div className="story-art">
                  {material.kind === "lesson" ? (
                    <LessonArt material={material} pageIndex={page} scene={current?.scene} />
                  ) : (
                  <AnimalScene
                    scene={current?.scene ?? body.cover_scene ?? page}
                    label={
                      current?.illustration ||
                      uiText("Animal friends learning together")
                    }
                  />
                  )}
                </div>}
                {!offlinePractice && !(material.kind === "story" && practice) && <div className="actions" aria-live="polite">
                  {speech.status === "loading" && <span role="status">{uiText("Preparing audio…")}</span>}
                  {speech.status === "playing" && <span role="status">{uiText("Reading aloud…")}</span>}
                  {["loading", "playing"].includes(speech.status) && <Button variant="secondary" onClick={stopSpeech}>{uiText("Stop reading")}</Button>}
                  {speech.error && <Notice error>{uiText(speech.error)}</Notice>}
                </div>}
                {material.kind !== "story" && <Select
                  label={uiText("Reading language")}
                  value={lang}
                  onChange={(e) => setLang(e.target.value)}
                  values={["both", ["en", "English"], ["fil", "Filipino"]]}
                />}
                {!practice && lang !== "fil" && (
                  <div className="bilingual">
                    <span className="eyebrow">{uiText("ENGLISH")}</span>
                    <p>{current?.english}</p>
                    {current?.english && !offlinePractice && (
                      <ListenButton text={current.english} language="en">{uiText("Listen")}</ListenButton>
                    )}
                  </div>
                )}
                {!practice && lang !== "en" && (
                  <div className="bilingual filipino">
                    <span className="eyebrow">{uiText("FILIPINO")}</span>
                    <p>{current?.filipino}</p>
                    {current?.filipino && !offlinePractice && (
                      <ListenButton text={current.filipino} language="fil">{uiText("Listen")}</ListenButton>
                    )}
                  </div>
                )}
                {material.kind === "story" && (
                  offlinePractice ? <p className="story-practice-note">{uiText("Connect to the internet to record and check your story reading.")}</p> : <div className="story-practice">
                    {practice && <ReadingPractice
                      key={`${material.id}:${page}:${lang}:${current?.english || ""}:${current?.filipino || ""}`}
                      embedded student={student} materialId={material.id} materialVersion={material.version} pageIndex={page}
                      passage={(lang === "fil" ? current?.filipino : current?.english) || ""}
                      language={lang === "fil" ? "fil" : "en"}
                      adventureStepId={guidedStep?.id}
                      onChecked={onReadingUpdate}
                    />}
                  </div>
                )}
                {!practice && !offlinePractice && safeWebUrl(body.pronunciation_url) && (
                  <audio
                    controls
                    src={body.pronunciation_url}
                    aria-label={uiText("Recorded pronunciation")}
                  />
                )}
              </section>
            )}
            {count > 1 && (
              <div className="reader-navigation">
                <Button
                  variant="secondary"
                  disabled={page === 0}
                  onClick={() => setPage(page - 1)}
                >{uiText("Previous")}</Button>
                <span>
                  {page + 1} / {count}
                </span>
                <Button
                  variant="secondary"
                  disabled={page === count - 1}
                  onClick={() => setPage(page + 1)}
                >{uiText("Next")}</Button>
              </div>
            )}
            {action.error && <Notice error>{action.error}</Notice>}
            <div className="modal-actions">
              <Button variant="secondary" onClick={onClose}>{uiText("Close")}</Button>
              <Button disabled={!complete || action.busy} onClick={finish}>
                {action.busy
                  ? uiText("Saving…")
                  : offlinePractice
                    ? uiText("Finish practice")
                    : student
                    ? uiText("Finish activity")
                    : uiText("Finish preview")}
              </Button>
            </div>
          </>
        )}
        {result && (
          <div className="celebration">
            <span>{result.queued ? "🌱" : "🌟"}</span>
            <h2>
              {offlinePractice ? uiText("Practice complete") : result.preview
                ? uiText("Preview complete")
                : result.assessment_type==='pending_online_scoring'
                  ? uiText('Answers saved · Awaiting online scoring')
                : result.queued
                  ? uiText("Saved for later")
                  : guidedStep && result.adventure_passed === false
                    ? 'Naitala ang quiz. Subukan ulit!'
                    : uiText("You did it!")}
            </h2>
            <p>
              {offlinePractice ? uiText("Open another activity to keep learning.") : result.preview
                ? uiText("This preview did not create a student grade.")
                : result.queued
                  ? uiText("Connect to the internet and reopen this profile to sync your activity.")
                  : result.assessment_type==='pending_online_scoring' ? uiText('Your answers are saved on this laptop. An educator can export and transfer them online for scoring.')
                  : !['quiz','game'].includes(material.kind) ? uiText('Activity completed · {0} stars earned',[result.stars])
                  : uiText("{0} of {1} correct · {2} stars earned", [result.correct_count, result.total_count, result.stars])}
            </p>
            {guidedStep && result.adventure_passed === false && result.assessment_type !== 'pending_online_scoring' && <><p>Kailangan ng 80% para magpatuloy. Nai-save ang attempt na ito para sa iyong guro.</p><Button onClick={onRetry}>Ulitin ang quiz</Button></>}
            <Button onClick={onClose}>{guidedStep ? 'Balik sa adventure map' : uiText("Keep exploring")}</Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
export function StudentPage() {
  return <StudentAdventure Reader={MaterialReader}/>;
}
function LinkHome() {
  useUiLanguage();
  return (
    <span className="brand">
      <span className="brand-icon">
        <Icon name="book" />
      </span>{uiText("Lingua")}<span>{uiText("Kids")}</span>
    </span>
  );
}

