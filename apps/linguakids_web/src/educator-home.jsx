import { assignedGrades } from './grade-scope';
import { uiText, useUiLanguage } from "./i18n";
import { LessonArt } from "./lesson-art";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "./context";
import { grades, learningShelf, materialTitle } from "./domain";
import { AnimalScene } from "./art";
import { Icon, Notice } from "./ui";
import { ListenButton } from "./listen-button";
import { MaterialReader } from "./reader";

export function EducatorHome() {
  useUiLanguage();
  const { data, user } = useApp(),
    [grade, setGrade] = useState(user.grade_levels?.length===1?user.grade_levels[0]:0),
    [reader, setReader] = useState(null);
  const materials = learningShelf(data.materials),
    recent = materials
      .filter((m) => !grade || m.grade_level === grade)
      .sort((a, b) =>
        String(b.updated_at || "").localeCompare(a.updated_at || ""),
      );
  const stats = [
    ["Child profiles", data.children.length, "users", "students"],
    [
      "My teaching materials",
      materials.filter((m) => m.owner_id === user.id).length,
      "book",
      "resources",
    ],
    ["Activities completed", data.attempts.length, "check", "insights"],
    [
      "Stars earned by students",
      data.attempts.reduce((n, a) => n + (a.stars || 0), 0),
      "star",
      "reports",
    ],
  ];
  return (
    <div className="original-home">
      <div className="original-greeting">
        <h2>{uiText("Good day, ")}{user.name}</h2>
        <p>{uiText("A little preparation. A whole world of discovery.")}</p>
      </div>
      {data.records
        .filter((r) => r.kind === "announcement" && r.status === "published")
        .map((r) => (
          <Notice key={r.id}>
            <strong>{r.title}</strong>
            <br />
            {r.data.details}
          </Notice>
        ))}
      <section className="original-welcome">
        <div>
          <span className="language-tag">{user.grade_levels?.length===1?uiText("ENGLISH + FILIPINO · GRADE {0}",[user.grade_levels[0]]):uiText("ENGLISH + FILIPINO · GRADES 1–6")}</span>
          <h2>{uiText("Kumusta, Kaibigan!")}</h2>
          <p>{uiText("Let's make room for a little wonder.")}<br />{uiText("Learn, listen, and grow together today.")}</p>
          <div className="actions">
            <Link className="button mango" to="/workspace/students">
              <Icon name="users" />{uiText("Open student profiles")}</Link>
            <Link className="button welcome-outline" to="/workspace/lessons">{uiText("Browse lessons")}</Link>
          </div>
        </div>
        <div className="welcome-word-cards">
          <span className="welcome-bird" aria-hidden="true">
            🦜
          </span>
          <div>
            {[
              ["☀️", "sun", "araw"],
              ["📖", "book", "aklat"],
            ].map(([emoji, en, fil]) => (
              <ListenButton
                key={en}
                className="welcome-word-card"
                text={[{ text: en, lang: 'en' }, { text: fil, lang: 'fil' }]}
                aria-label={uiText("Listen to {0} and {1}", [en, fil])}
              >
                <span>{emoji}</span>
                <strong>{en}</strong>
                <small>{fil}</small>
              </ListenButton>
            ))}
          </div>
        </div>
      </section>
      <div className="original-metrics">
        {stats.map(([label, value, icon, route]) => (
          <Link key={label} to={`/workspace/${route}`}>
            <div>
              <Icon name={icon} />
              <Icon name="arrow" size={16} />
            </div>
            <strong>{value}</strong>
            <span>{label}</span>
          </Link>
        ))}
      </div>
      <div className="section-heading">
        <div>
          <h2>{uiText("What shall we teach today?")}</h2>
          <p>{uiText("Little words, playful practice, big smiles.")}</p>
        </div>
      </div>
      <div className="original-activities">
        {[
          [
            "dictionary",
            "Learn words",
            "Explore English and Filipino vocabulary, one word at a time.",
            "Open word library",
            1,
            "leaf",
          ],
          [
            "translator",
            "Translate",
            "Find the words to connect two languages and bring lessons to life.",
            "Open translator",
            8,
            "sky",
          ],
          [
            "quizzes",
            "Play & practice",
            "Prepare a quiz or worksheet and celebrate every little win.",
            "Explore quizzes",
            12,
            "coral",
          ],
        ].map(([route, title, detail, action, scene, color]) => (
          <article key={route}>
            <AnimalScene
              scene={scene}
              label={uiText("{0} with the LinguaKids animal friends", [title])}
            />
            <div>
              <h3>{title}</h3>
              <p>{detail}</p>
              <Link className={`button ${color}`} to={`/workspace/${route}`}>
                {action}
              </Link>
            </div>
          </article>
        ))}
      </div>
      <div className="section-heading">
        <div>
          <h2>{uiText("Your learning shelf")}</h2>
          <p>{uiText("Recently updated learning materials, ready to explore.")}</p>
        </div>
        <Link to="/workspace/lessons">{uiText("View all lessons ")}<Icon name="arrow" size={16} />
        </Link>
      </div>
      <div className="pills" aria-label={uiText("Learning shelf grades")}>
        {(assignedGrades(user).length===1?assignedGrades(user):[0,...assignedGrades(user)]).map((g) => (
          <button
            key={g}
            className={grade === g ? "active" : ""}
            onClick={() => setGrade(g)}
          >
            {g ? uiText("Grade {0}", [g]) : uiText("All grades")}
          </button>
        ))}
      </div>
      <section className="panel learning-shelf">
        {recent.slice(0, 4).map((m) => (
          <button key={m.id} onClick={() => setReader(m)}>
            <span className="shelf-art">
              {m.kind === "lesson" ? <LessonArt material={m} /> : (<AnimalScene
                scene={m.body?.cover_scene ?? m.grade_level}
                label={m.title}
              />)}
            </span>
            <span>
              <strong>{materialTitle(m)}</strong>
              <small>{uiText("Grade ")}{m.grade_level} · {m.kind} · {m.status}
              </small>
            </span>
            <Icon name="arrow" />
          </button>
        ))}
        {!recent.length && (
          <p>{uiText("A fresh page awaits. Choose another grade or create a lesson.")}</p>
        )}
      </section>
      <section className="cheer-card">
        <h2>{uiText("Every little step deserves a cheer. ⭐")}</h2>
        <p>{uiText("See what your students have practiced and plan what comes next.")}</p>
        <Link to="/workspace/insights">{uiText("View progress insights ")}<Icon name="arrow" size={17} />
        </Link>
      </section>
      <Notice>{uiText("Students use learning profiles you create. Open a student profile to begin their activities and save their results.")}</Notice>
      {reader && (
        <MaterialReader material={reader} onClose={() => setReader(null)} />
      )}
    </div>
  );
}
