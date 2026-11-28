import { GradeSelect } from './grade-select';
import { uiText, useUiLanguage } from "./i18n";
import { useRef, useState } from "react";
import { MaterialVisibilityHint } from './material-help';
import { useApp } from "./context";
import {
  avatars,
  grades,
  levels,
  materialStatuses,
  safeWebUrl,
  parseCsv,
  parsePairs,
  validatePairs,
} from "./domain";
import { Button, Field, Modal, Notice, Select, useAction } from "./ui";

const newQuestion = () => ({
  id: crypto.randomUUID(),
  prompt: "",
  options: [1, 2, 3, 4].map(() => ({ id: crypto.randomUUID(), text: "" })),
  correct_option_id: "",
});
export function QuestionEditor({ questions, setQuestions }) {
  useUiLanguage();
  function update(i, change) {
    setQuestions(questions.map((q, n) => (n === i ? { ...q, ...change } : q)));
  }
  return (
    <div className="question-editor">
      {questions.map((q, i) => (
        <fieldset key={q.id}>
          <legend>{uiText("Question ")}{i + 1}</legend>
          <Field
            label={uiText("Question {0} prompt", [i + 1])}
            required
            value={q.prompt}
            onChange={(e) => update(i, { prompt: e.target.value })}
          />
          {q.options.map((o, j) => (
            <div className="question-option" key={o.id}>
              <input
                aria-label={uiText("Correct answer {0} option {1}", [i + 1, j + 1])}
                type="radio"
                name={`answer-${q.id}`}
                checked={q.correct_option_id === o.id}
                onChange={() => update(i, { correct_option_id: o.id })}
              />
              <input
                aria-label={uiText("Question {0} option {1}", [i + 1, j + 1])}
                required
                value={o.text}
                placeholder={uiText("Option {0}", [String.fromCharCode(65 + j)])}
                onChange={(e) =>
                  update(i, {
                    options: q.options.map((old, n) =>
                      n === j ? { ...old, text: e.target.value } : old,
                    ),
                  })
                }
              />
              <button
                type="button"
                className="icon-button"
                aria-label={uiText("Remove option {0} from question {1}", [String.fromCharCode(65 + j), i + 1])}
                disabled={q.options.length <= 2}
                onClick={() =>
                  update(i, {
                    options: q.options.filter((option) => option.id !== o.id),
                    correct_option_id:
                      q.correct_option_id === o.id ? "" : q.correct_option_id,
                  })
                }
              >
                ×
              </button>
            </div>
          ))}
          <Button
            type="button"
            variant="ghost"
            disabled={q.options.length >= 4}
            onClick={() =>
              update(i, {
                options: [...q.options, { id: crypto.randomUUID(), text: "" }],
              })
            }
          >{uiText("Add option to question ")}{i + 1}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={questions.length === 1}
            onClick={() => setQuestions(questions.filter((_, n) => n !== i))}
          >{uiText("Remove question")}</Button>
        </fieldset>
      ))}
      <Button
        type="button"
        variant="secondary"
        disabled={questions.length >= 50}
        onClick={() => setQuestions([...questions, newQuestion()])}
      >{uiText("Add question")}</Button>
      <small>{uiText("Select the correct answer beside each option. Answer keys are stored securely by the server.")}</small>
    </div>
  );
}
function checkedQuestions(questions) {
  if (
    questions.some(
      (q) =>
        !q.prompt.trim() ||
        !q.correct_option_id ||
        q.options.some((o) => !o.text.trim()),
    )
  )
    throw new Error("Complete every question and choose its correct answer.");
  return questions;
}
export function MaterialEditor({ initial, kind = "lesson", onClose, onSaved }) {
  useUiLanguage();
  const { repository, user, data } = useApp(),
    action = useAction();
  const old = initial || {};
  const [type, setType] = useState(old.kind || kind),
    [grade, setGrade] = useState(old.grade_level || user?.grade_levels?.[0] || 1),
    [level, setLevel] = useState(old.learning_level || "beginner");
  const [status, setStatus] = useState(old.status || "draft"),
    [questions, setQuestions] = useState(
      old.body?.questions || [newQuestion()],
    );
  const [pages, setPages] = useState(
    old.body?.pages?.length ? old.body.pages : [{ english: old.body?.english || "", filipino: old.body?.filipino || "" }],
  );
  const [paged, setPaged] = useState(old.kind === "story" || kind === "story" || !!old.body?.pages?.length);
  const [title, setTitle] = useState(old.title || "");
  const [english, setEnglish] = useState(old.body?.english || "");
  const [filipino, setFilipino] = useState(old.body?.filipino || "");
  const [importLanguage, setImportLanguage] = useState("english");
  const [imported, setImported] = useState("");
  const lessonFile = useRef(null);
  const [reference, setReference] = useState(
    old.curriculum?.reference_id || "",
  );
  const [area, setArea] = useState(old.curriculum?.learning_area || ""),
    [quarter, setQuarter] = useState(old.curriculum?.quarter || 1);
  const refs = (data?.records || []).filter(
    (r) =>
      r.kind === "curriculum" &&
      r.status === "published" &&
      Number(r.data.grade_level) === Number(grade),
  );
  const banks = (data?.records || []).filter(
    (r) => r.kind === "question_bank" && r.status !== "archived",
  );
  async function uploadLesson(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    await action.run(async () => {
      if (file.size > 2_000_000) throw new Error("Choose a lesson file under 2 MB.");
      const form = new FormData();
      form.append("file", file);
      const { text } = await repository.api("/v1/lessons/import", form);
      if (typeof text !== "string" || !text.trim()) throw new Error("The file has no readable lesson text.");
      if (paged) {
        const emptyPage = pages.findIndex((page) => !page[importLanguage]?.trim());
        if (emptyPage >= 0) {
          setPages(pages.map((page, index) => index === emptyPage ? { ...page, [importLanguage]: text } : page));
        } else {
          if (pages.length >= 30) throw new Error("Free up a lesson page before importing another file.");
          setPages([...pages, { english: "", filipino: "", [importLanguage]: text }]);
        }
      } else {
        const append = (current) => current.trim() ? `${current.trimEnd()}\n\n${text}` : text;
        if (importLanguage === "english") setEnglish(append);
        else setFilipino(append);
      }
      setTitle((current) => current.trim() ? current : file.name.replace(/\.[^.]+$/, "").trim().slice(0, 160));
      setImported(file.name);
    });
  }
  async function submit(e) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await action.run(async () => {
      let body = { ...old.body };
      if (type === "quiz") body = { questions: checkedQuestions(questions) };
      else if (["dictionary", "vocabulary", "game"].includes(type))
        body = { pairs: parsePairs(f.get("pairs")) };
      else if (type === "story" || (type === "lesson" && f.get("paged"))) {
        if (pages.some((p) => !p.english?.trim() || !p.filipino?.trim()))
          throw new Error("Add English and Filipino text to every page.");
        body = {
          ...body,
          pages,
          english: pages.map((p) => p.english).join("\n"),
          filipino: pages.map((p) => p.filipino).join("\n"),
        };
      } else
        body = {
          ...body,
          english: f.get("english"),
          filipino: f.get("filipino"),
        };
      if (type === "lesson" && !f.get("paged")) delete body.pages;
      if (type === "lesson" && new TextEncoder().encode(JSON.stringify(body)).length > 140_000)
        throw new Error("The lesson text is too long. Split it into shorter lessons.");
      if (["story", "lesson"].includes(type))
        body.cover_scene = Number(f.get("cover_scene") || 0);
      const audio = f.get("pronunciation_url")?.trim();
      if (audio && !safeWebUrl(audio))
        throw new Error("Use a valid HTTP or HTTPS pronunciation URL.");
      if (audio) body.pronunciation_url = audio;
      else delete body.pronunciation_url;
      const ref = refs.find((r) => r.id === reference),
        curriculum = ref
          ? {
              reference_id: ref.id,
              quarter: ref.data.quarter,
              learning_area: ref.data.learning_area,
            }
          : area
            ? { learning_area: area, quarter: Number(quarter) }
            : {};
      const savedMaterial = {
          kind: type,
          title: f.get("title").trim(),
          summary: f.get("summary"),
          grade_level: Number(grade),
          learning_level: level,
          status,
          body,
          curriculum,
      };
      const savedId = await repository.rpc("save_learning_material", {
        p_id: old.id || null,
        p_data: savedMaterial,
      });
      await onSaved({...savedMaterial, id: savedId});
      onClose();
    });
  }
  return (
    <Modal
      title={uiText("{0} learning material", [old.id ? "Edit" : "Create"])}
      onClose={onClose}
      wide
    >
      <form className="form-stack" onSubmit={submit}>
        <Field
          label={uiText("Title")}
          name="title"
          required
          maxLength={160}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <div className="form-grid">
          <Select
            label={uiText("Material type")}
            value={type}
            onChange={(e) => {setType(e.target.value);if(e.target.value === "story")setPaged(true);}}
            disabled={!!old.id || action.busy}
            values={[
              "lesson",
              "story",
              "quiz",
              "game",
              "dictionary",
              "vocabulary",
            ]}
          />
          <GradeSelect
            label={uiText("Grade")}
            value={grade}
            onChange={(e) => {
              setGrade(Number(e.target.value));
              setReference("");
            }}
            values={grades.map((g) => [g, `Grade ${g}`])}
          />
          <Select
            label={uiText("Learning level")}
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            values={levels}
          />
          <Select
            label={uiText("Visibility")}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            values={
              user.role === "administrator"
                ? materialStatuses
                : materialStatuses.filter((s) => s !== "published")
            }
          />
        </div>
        <Field label={uiText("Summary")}>
          <textarea
            name="summary"
            maxLength={600}
            defaultValue={old.summary || ""}
            rows={2}
          />
        </Field>
        <MaterialVisibilityHint status={status}/>
        <Select
          label={uiText("Curriculum reference")}
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          values={[
            ["", "Supplemental enrichment"],
            ...refs.map((r) => [r.id, r.title]),
          ]}
        />
        {!reference && (
          <div className="form-grid">
            <Select
              label={uiText("Learning area")}
              value={area}
              onChange={(e) => setArea(e.target.value)}
              values={[["", "Supplemental enrichment"], "English", "Filipino"]}
            />
            <Select
              label={uiText("Quarter")}
              value={quarter}
              onChange={(e) => setQuarter(Number(e.target.value))}
              values={[1, 2, 3, 4]}
            />
          </div>
        )}
        {["lesson", "story"].includes(type) && (
          <Select
            label={uiText("Cover illustration")}
            name="cover_scene"
            defaultValue={old.body?.cover_scene || 0}
            values={Array.from({ length: 16 }, (_, i) => [
              i,
              type === "lesson" ? `Topic variation ${i + 1}` : `Animal scene ${i + 1}`,
            ])}
          />
        )}
        {type === "quiz" ? (
          <>
            {user.role === "administrator" && banks.length > 0 && (
              <Select
                label={uiText("Copy from question bank")}
                value=""
                onChange={(e) => {
                  const bank = banks.find((b) => b.id === e.target.value);
                  if (bank)
                    setQuestions(
                      bank.data.questions.map((q) => {
                        const options = q.options.map((o) => ({
                          ...o,
                          id: crypto.randomUUID(),
                        }));
                        return {
                          ...q,
                          id: crypto.randomUUID(),
                          options,
                          correct_option_id:
                            options[
                              q.options.findIndex(
                                (o) => o.id === q.correct_option_id,
                              )
                            ]?.id || "",
                        };
                      }),
                    );
                }}
                values={[
                  ["", "Choose a question bank"],
                  ...banks.map((b) => [b.id, b.title]),
                ]}
              />
            )}
            <QuestionEditor questions={questions} setQuestions={setQuestions} />
          </>
        ) : ["dictionary", "vocabulary", "game"].includes(type) ? (
          <Field
            label={uiText("English–Filipino pairs")}
            hint={uiText("One pair per line: English | Filipino")}
          >
            <textarea
              name="pairs"
              required
              rows={7}
              defaultValue={(old.body?.pairs || [])
                .map((p) => `${p.en} | ${p.fil}`)
                .join("\n")}
            />
          </Field>
        ) : (
          <>
            {["lesson", "story"].includes(type) && (
              <>
                <fieldset disabled={action.busy}>
                  <legend>{type === "story" ? uiText("Import story text") : uiText("Import lesson text")}</legend>
                  <p>{uiText("Choose a PDF with selectable text, Word (.docx), or UTF-8 text (.txt) file, up to 2 MB. Review the text before saving.")}</p>
                  <Select
                    label={uiText("File language")}
                    value={importLanguage}
                    onChange={(event) => setImportLanguage(event.target.value)}
                    values={[["english", "English"], ["filipino", "Filipino"]]}
                  />
                  <input ref={lessonFile} type="file" accept=".pdf,.docx,.txt" onChange={uploadLesson} hidden />
                  <Button type="button" variant="secondary" onClick={() => lessonFile.current?.click()}>{type === "story" ? uiText("Upload story file") : uiText("Upload lesson file")}</Button>
                  {imported && <Notice>{uiText("Imported ")}{imported}{uiText(". You can edit its text below.")}</Notice>}
                </fieldset>
                <div className="lesson-single-text" hidden={type === "story" || paged}>
                <Field label={uiText("English")}>
                  <textarea
                    name="english"
                    rows={5}
                    value={english}
                    onChange={(event) => setEnglish(event.target.value)}
                    disabled={action.busy}
                  />
                </Field>
                <Field label={uiText("Filipino")}>
                  <textarea
                    name="filipino"
                    rows={5}
                    value={filipino}
                    onChange={(event) => setFilipino(event.target.value)}
                    disabled={action.busy}
                  />
                </Field>
                </div>
                {type === "lesson" && <label className="checkbox">
                  <input
                    type="checkbox"
                    name="paged"
                    checked={paged}
                    disabled={action.busy}
                    onChange={event=>setPaged(event.target.checked)}
                  />{uiText("Use pages for this lesson")}</label>}
              </>
            )}
            <div hidden={type === 'lesson' && !paged}>
            <div className="page-editor">
              <h3>
                {type === "story" ? uiText("Story pages") : uiText("Lesson pages")}
              </h3>
              {pages.map((page, i) => (
                <fieldset key={i}>
                  <legend>{uiText("Page ")}{i + 1}</legend>
                  {["english", "filipino"].map((lang) => (
                    <Field
                      key={lang}
                      label={uiText("{0} page {1}", [lang === "english" ? "English" : "Filipino", i + 1])}
                    >
                      <textarea
                        rows={3}
                        value={page[lang] || ""}
                        disabled={action.busy}
                        onChange={(e) =>
                          setPages(
                            pages.map((p, n) =>
                              n === i ? { ...p, [lang]: e.target.value } : p,
                            ),
                          )
                        }
                      />
                    </Field>
                  ))}
                  <Select
                    label={uiText("Page {0} illustration", [i + 1])}
                    value={page.scene ?? old.body?.cover_scene ?? 0}
                    disabled={action.busy}
                    onChange={(e) =>
                      setPages(
                        pages.map((p, n) =>
                          n === i ? { ...p, scene: Number(e.target.value) } : p,
                        ),
                      )
                    }
                    values={Array.from({ length: 16 }, (_, n) => [
                      n,
                      type === "lesson" ? `Topic variation ${n + 1}` : `Animal scene ${n + 1}`,
                    ])}
                  />
                  <Button
                    variant="ghost"
                    type="button"
                    disabled={action.busy || pages.length === 1}
                    onClick={() => setPages(pages.filter((_, n) => n !== i))}
                  >{uiText("Remove page")}</Button>
                </fieldset>
              ))}
              <Button
                type="button"
                variant="secondary"
                disabled={action.busy || pages.length >= 30}
                onClick={() =>
                  setPages([...pages, { english: "", filipino: "" }])
                }
              >{uiText("Add page")}</Button>
            </div>
            </div>
          </>
        )}
        {type !== "quiz" && (
          <Field
            label={uiText("Recorded pronunciation URL (optional)")}
            name="pronunciation_url"
            type="url"
            defaultValue={old.body?.pronunciation_url || ""}
          />
        )}
        {action.error && <Notice error>{action.error}</Notice>}
        <div className="modal-actions">
          <Button variant="secondary" type="button" onClick={onClose}>{uiText("Cancel")}</Button>
          <Button type="submit" disabled={action.busy}>
            {action.busy ? uiText("Saving…") : uiText("Save material")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
export function StudentEditor({ initial, onClose, onSaved }) {
  useUiLanguage();
  const { repository, user } = useApp(),
    action = useAction(),
    old = initial || {};
  return (
    <Modal
      title={old.id ? uiText("Edit student profile") : uiText("Welcome a new student")}
      onClose={onClose}
    >
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          action.run(async () => {
            await repository.rpc("save_child_profile", {
              p_id: old.id || null,
              p_data: {
                nickname: f.get("nickname").trim(),
                grade_level: Number(f.get("grade")),
                ...(f.get("gender") || old.gender ? { gender: f.get("gender") || null } : {}),
                avatar_key: f.get("avatar"),
                learning_level: f.get("level"),
                active: f.get("active") === "on",
                preferences: {
                  language: f.get("language"),
                  sound: f.get("sound") === "on",
                  reduced_motion: f.get("reduced_motion") === "on",
                },
              },
            });
            await onSaved();
            onClose();
          });
        }}
      >
        <p>{uiText("Create a learning profile. Student emails and passwords are not needed.")}</p>
        <Field
          label={uiText("Nickname")}
          name="nickname"
          required
          maxLength={40}
          defaultValue={old.nickname || ""}
        />
        <GradeSelect
          label={uiText("Grade")}
          name="grade"
          defaultValue={old.grade_level || user?.grade_levels?.[0] || 1}
          values={grades.map((g) => [g, `Grade ${g}`])}
        />
        <Select
          label={uiText("Gender")}
          name="gender"
          defaultValue={old.gender || ""}
          values={[["", "Not specified"], ["male", "Male"], ["female", "Female"]]}
        />
        <Select
          label={uiText("Avatar")}
          name="avatar"
          defaultValue={old.avatar_key || "owl"}
          values={Object.entries(avatars).map(([k, v]) => [k, `${v} ${k}`])}
        />
        <Select
          label={uiText("Learning level")}
          name="level"
          defaultValue={old.learning_level || "beginner"}
          values={levels}
        />
        <Select
          label={uiText("Student reading language")}
          name="language"
          defaultValue={old.preferences?.language || "bilingual"}
          values={[
            ["bilingual", "English and Filipino"],
            ["en", "English"],
            ["fil", "Filipino"],
          ]}
        />
        <label className="checkbox">
          <input
            name="sound"
            type="checkbox"
            defaultChecked={old.preferences?.sound !== false}
          />{uiText("Enable reading sounds")}</label>
        <label className="checkbox">
          <input
            name="reduced_motion"
            type="checkbox"
            defaultChecked={old.preferences?.reduced_motion === true}
          />{uiText("Reduce motion for this student")}</label>
        <label className="checkbox">
          <input
            type="checkbox"
            name="active"
            defaultChecked={old.active !== false}
          />{uiText("Active profile")}</label>
        {action.error && <Notice error>{action.error}</Notice>}
        <div className="modal-actions">
          <Button type="button" variant="secondary" onClick={onClose}>{uiText("Cancel")}</Button>
          <Button type="submit" disabled={action.busy}>{uiText("Save profile")}</Button>
        </div>
      </form>
    </Modal>
  );
}
export function RecordEditor({ kind, initial, onClose, onSaved }) {
  useUiLanguage();
  const { repository, data, user } = useApp(),
    old = initial || {},
    details = old.data || {},
    action = useAction();
  const [grade, setGrade] = useState(details.grade_level || user?.grade_levels?.[0] || 1),
    [selected, setSelected] = useState(details.material_ids || []),
    [uploaded, setUploaded] = useState(null),
    [fileError, setFileError] = useState("");
  const [questions, setQuestions] = useState(
    details.questions || [newQuestion()],
  );
  const datasets = (data.records || []).filter(
    (r) => r.kind === "dataset" && r.status === "published",
  );
  async function submit(e) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await action.run(async () => {
      let content = { ...details, details: f.get("details") };
      if (["plan", "session", "curriculum"].includes(kind))
        content.grade_level = Number(grade);
      if (["plan", "session"].includes(kind)) content.material_ids = selected;
      if (kind === "curriculum")
        Object.assign(content, {
          quarter: Number(f.get("quarter")),
          learning_area: f.get("area"),
          curriculum_version: f.get("version"),
          source_url: f.get("source"),
        });
      if (kind === "dataset")
        Object.assign(content, {
          pairs: validatePairs(uploaded || parsePairs(f.get("pairs"))),
          source_url: f.get("source"),
          license: f.get("license"),
          classroom_approved: f.get("classroom") === "on",
          review_notes: f.get("review"),
        });
      if (kind === "session")
        Object.assign(content, {
          session_date: f.get("date"),
          participant_count: Number(f.get("participants")),
          correct_count: Number(f.get("correct")),
          total_count: Number(f.get("total")),
        });
      if (kind === "session" && content.correct_count > content.total_count)
        throw new Error("Correct responses cannot exceed total responses.");
      if (kind === "training") content.dataset_id = f.get("dataset");
      if (kind === "question_bank")
        content.questions = checkedQuestions(questions);
      if (kind === "training" && old.status === "published") content = details;
      await repository.rpc("save_workspace_record", {
        p_id: old.id || null,
        p_data: {
          kind,
          title: f.get("title").trim(),
          status: f.get("status"),
          data: content,
        },
      });
      await onSaved();
      onClose();
    });
  }
  return (
    <Modal
      title={`${old.id ? "Edit" : "Create"} ${kind.replace("_", " ")}`}
      onClose={onClose}
      wide
    >
      <form className="form-stack" onSubmit={submit}>
        <Field
          label={uiText("Title")}
          name="title"
          required
          maxLength={180}
          defaultValue={old.title || ""}
        />
        <Field label={uiText("Details")}>
          <textarea
            name="details"
            rows={4}
            defaultValue={details.details || ""}
          />
        </Field>
        {["curriculum", "plan", "session"].includes(kind) && (
          <GradeSelect
            label={uiText("Grade")}
            value={grade}
            onChange={(e) => {
              setGrade(Number(e.target.value));
              setSelected([]);
            }}
            values={grades.map((g) => [g, `Grade ${g}`])}
          />
        )}
        {kind === "curriculum" && (
          <>
            <div className="form-grid">
              <Field
                label={uiText("Learning area")}
                name="area"
                defaultValue={details.learning_area || "English"}
                required
              />
              <Select
                label={uiText("Quarter")}
                name="quarter"
                defaultValue={details.quarter || 1}
                values={[1, 2, 3, 4]}
              />
              <Field
                label={uiText("Curriculum version")}
                name="version"
                required
                defaultValue={details.curriculum_version || ""}
              />
            </div>
            <Field
              label={uiText("Official source URL")}
              type="url"
              name="source"
              required
              defaultValue={details.source_url || ""}
            />
          </>
        )}
        {kind === "dataset" && (
          <>
            <Field
              label={uiText("Source URL / provenance")}
              name="source"
              required
              defaultValue={details.source_url || ""}
            />
            <Field
              label={uiText("License / permission")}
              name="license"
              required
              defaultValue={details.license || ""}
            />
            <Field
              label={uiText("Import bilingual CSV")}
              hint={uiText("Columns: english, filipino. Up to 50,000 reviewed pairs.")}
            >
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={async (e) => {
                  try {
                    setFileError("");
                    const file = e.target.files[0];
                    if (!file) return;
                    if (file.size > 10000000)
                      throw new Error("Choose a CSV smaller than 10 MB.");
                    const pairs = parseCsv(await file.text());
                    if (pairs.length > 50000)
                      throw new Error("Use at most 50,000 pairs per dataset.");
                    setUploaded(pairs);
                  } catch (error) {
                    setFileError(error.message);
                    setUploaded(null);
                  }
                }}
              />
            </Field>
            {fileError && <Notice error>{fileError}</Notice>}
            {uploaded ? (
              <Notice>
                {uploaded.length}{uiText(" pairs imported.")}{" "}
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setUploaded(null)}
                >{uiText("Use manual pairs instead")}</button>
              </Notice>
            ) : (
              <Field
                label={uiText("English–Filipino pairs")}
                hint={uiText("One pair per line: English | Filipino")}
              >
                <textarea
                  name="pairs"
                  required
                  rows={7}
                  defaultValue={(details.pairs || [])
                    .map((p) => `${p.en ?? p.english ?? ""} | ${p.fil ?? p.filipino ?? ""}`)
                    .join("\n")}
                />
              </Field>
            )}
            <Field label={uiText("Review notes")}>
              <textarea
                name="review"
                defaultValue={details.review_notes || ""}
              />
            </Field>
            <label className="checkbox">
              <input
                type="checkbox"
                name="classroom"
                defaultChecked={details.classroom_approved === true}
              />{uiText("Reviewed and approved for classroom use")}</label>
            <Notice>{uiText("Training approval and classroom approval are separate. Review the source, license, and translations before approval.")}</Notice>
          </>
        )}
        {kind === "training" && (
          <Select
            label={uiText("Approved dataset")}
            name="dataset"
            required
            defaultValue={details.dataset_id || ""}
            values={[
              ["", "Choose a dataset"],
              ...datasets.map((r) => [r.id, r.title]),
            ]}
          />
        )}
        {kind === "session" && (
          <>
            <Field
              label={uiText("Session date")}
              type="date"
              name="date"
              required
              defaultValue={
                details.session_date || new Date().toISOString().slice(0, 10)
              }
            />
            <div className="form-grid">
              {[
                ["participants", "Participants", "participant_count"],
                ["correct", "Correct responses", "correct_count"],
                ["total", "Total responses", "total_count"],
              ].map(([name, label, key]) => (
                <Field
                  key={name}
                  label={label}
                  name={name}
                  type="number"
                  required
                  min={0}
                  defaultValue={details[key] || 0}
                />
              ))}
            </div>
          </>
        )}
        {["plan", "session"].includes(kind) && (
          <fieldset>
            <legend>{uiText("Learning sequence · Grade ")}{grade}</legend>
            {data.materials
              .filter(
                (m) =>
                  m.grade_level === Number(grade) && m.status !== "archived",
              )
              .map((m) => (
                <label className="checkbox" key={m.id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(m.id)}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [...selected, m.id]
                          : selected.filter((id) => id !== m.id),
                      )
                    }
                  />
                  {m.title}
                </label>
              ))}
            {selected.length > 0 && (
              <ol>
                {selected.map((id, i) => (
                  <li key={id}>
                    {data.materials.find((m) => m.id === id)?.title}
                    <button
                      className="text-button"
                      type="button"
                      disabled={!i}
                      onClick={() => {
                        const next = [...selected];
                        [next[i - 1], next[i]] = [next[i], next[i - 1]];
                        setSelected(next);
                      }}
                    >{uiText("Move up")}</button>
                  </li>
                ))}
              </ol>
            )}
          </fieldset>
        )}
        {kind === "question_bank" && (
          <QuestionEditor questions={questions} setQuestions={setQuestions} />
        )}
        <Select
          label={uiText("Status")}
          name="status"
          defaultValue={old.status || "draft"}
          values={
            kind === "training" && old.status === "published"
              ? ["published", "archived"]
              : ["draft", "published", "archived"]
          }
        />
        {action.error && <Notice error>{action.error}</Notice>}
        <div className="modal-actions">
          <Button variant="secondary" type="button" onClick={onClose}>{uiText("Cancel")}</Button>
          <Button disabled={action.busy} type="submit">{uiText("Save ")}{kind.replace("_", " ")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

