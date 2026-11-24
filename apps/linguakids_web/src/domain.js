export const grades = [1, 2, 3, 4, 5, 6];
export const levels = ["beginner", "developing", "independent"];
export const materialStatuses = [
  "draft",
  "classroom",
  "submitted",
  "published",
  "archived",
];
export function learningShelf(materials) {
  return materials.filter(
    (m) =>
      !(
        m.owner_id == null &&
        m.source_label ===
          "LinguaKids original starter · supplemental enrichment" &&
        [
          "A book under the tree",
          "Everyday word check",
          "Match the everyday words",
        ].includes(m.title) &&
        materials.some(
          (n) =>
            n.kind === m.kind &&
            n.grade_level === m.grade_level &&
            String(n.source_label).includes("animal adventures"),
        )
      ),
  );
}
export function materialKindMatches(material, kind) {
  return !kind || material.kind === kind || (kind === "dictionary" && material.kind === "vocabulary");
}
export function materialAvailableFor(m, child) {
  return (
    m.grade_level === child.grade_level &&
    (m.status === "published" ||
      (m.status === "classroom" && m.owner_id === child.adult_id))
  );
}
export const avatars = {
  tarsier: "🐾",
  owl: "🦉",
  turtle: "🐢",
  butterfly: "🦋",
  cat: "🐱",
  star: "⭐",
};
export const educatorNav = [
  ["journey", "Missions", "layers"],
  ["home", "Overview", "home"],
  ["lessons", "Curriculum & Lessons", "book"],
  ["plans", "My Teaching Plans", "calendar"],
  ["dictionary", "Dictionary", "letters"],
  ["translator", "Translator", "translate"],
  ["activities", "Activities & Games", "game"],
  ["stories", "Stories", "book"],
  ["quizzes", "Quiz & Worksheet Builder", "check"],
  ["sessions", "Classroom Sessions", "calendar"],
  ["students", "Students", "users"],
  ["resources", "My Resources", "folder"],
  ["downloads", "Downloads", "download"],
  ["reports", "Gradebook", "chart"],
  ["settings", "Settings", "settings"],
];
export const adminNav = [
  ["overview", "Overview", "home"],
  ["educators", "Educator Management", "users"],
  ["curriculum", "Curriculum References", "book"],
  ["resources", "Teaching Materials", "folder"],
  ["dictionary", "Dictionary", "letters"],
  ["ai", "AI Workspace", "spark"],
  ["reports", "Reports & Gradebook", "chart"],
  ["announcements", "Announcements", "bell"],
  ["settings", "Settings", "settings"],
  ["audit", "Audit Logs", "shield"],
];
export function adminLegacyDestination(section) {
  const destinations = {
    activities: "/workspace/resources?type=game",
    quizzes: "/workspace/resources?type=quiz",
    stories: "/workspace/resources?type=story",
    datasets: "/workspace/ai?tab=datasets",
    training: "/workspace/ai?tab=packages",
    models: "/workspace/ai?tab=models",
    insights: "/workspace/reports?view=participation",
  };
  return Object.hasOwn(destinations, section) ? destinations[section] : null;
}
export const materialSections = {
  lessons: "lesson",
  dictionary: "dictionary",
  activities: "game",
  quizzes: "quiz",
  stories: "story",
};
export const recordSections = {
  plans: "plan",
  sessions: "session",
  curriculum: "curriculum",
  datasets: "dataset",
  training: "training",
  announcements: "announcement",
};
export function homeFor(user) {
  return user?.role === "administrator"
    ? "/workspace/overview"
    : "/workspace/home";
}
export function canVisit(user, section) {
  if (user?.role === "administrator" && adminLegacyDestination(section)) return true;
  return (user?.role === "administrator" ? adminNav : educatorNav).some(
    ([key]) => key === section,
  );
}
export function materialTitle(m) {
  return m.kind === "quiz" && m.quiz_number
    ? `Quiz ${m.quiz_number} · ${m.title}`
    : m.title;
}
export function dateText(date) {
  return date
    ? new Date(date).toLocaleString("en-PH", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";
}
export function errorText(error) {
  const code = error?.code;
  if (code === "invalid_credentials")
    return "Incorrect email or password. Please try again.";
  if (code === "email_not_confirmed")
    return "Verify your email first. Check your inbox and spam folder.";
  if (
    [
      "otp_expired",
      "flow_state_expired",
      "flow_state_not_found",
      "bad_code_verifier",
    ].includes(code)
  )
    return "This link has expired or cannot be opened here. Request a new link and open the latest email in this same browser.";
  if (["over_email_send_rate_limit", "over_request_rate_limit"].includes(code))
    return "Please wait a few minutes before requesting another email.";
  if (code === "same_password")
    return "Choose a password different from your current one.";
  if (error instanceof TypeError && /fetch/i.test(error.message))
    return "Cannot connect. Check your internet connection and try again.";
  return error?.message || String(error || "Please try again.");
}
export function parsePairs(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) throw new Error("Add at least one English–Filipino pair.");
  return lines.map((line, i) => {
    const [en, fil, ...extra] = line.split("|").map((s) => s.trim());
    if (!en || !fil || extra.length)
      throw new Error(`Line ${i + 1}: use English | Filipino.`);
    return { en, fil };
  });
}
export function validatePairs(pairs) {
  const seen = new Map();
  const unique = [];
  const normalize = (value) => value.trim().toLowerCase().replace(/\s+/g, " ");
  for (const [index, pair] of pairs.entries()) {
    const row = index + 1;
    const en = pair.en ?? pair.english ?? "";
    const fil = pair.fil ?? pair.filipino ?? "";
    const source = normalize(en), target = normalize(fil);
    if (!source || !target)
      throw new Error(`Pair ${row} needs English and Filipino text.`);
    const previous = seen.get(source);
    if (previous) {
      if (previous.target !== target)
        throw new Error(`Pairs ${previous.row} and ${row} have different Filipino translations for “${en.trim().slice(0, 120)}”. Review both pairs.`);
      continue;
    }
    seen.set(source, { target, row });
    unique.push({ en: en.trim(), fil: fil.trim() });
  }
  return unique;
}
export function parseCsv(text) {
  const rows = [];
  let row = [],
    cell = "",
    quoted = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i <= text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if ((c === "," || c === "\n" || c === undefined) && !quoted) {
      row.push(cell.replace(/\r$/, ""));
      cell = "";
      if (c !== ",") {
        if (row.some(Boolean)) rows.push(row);
        row = [];
      }
    } else cell += c ?? "";
  }
  if (quoted) throw new Error("The CSV contains an unfinished quoted field.");
  if (!rows.length) throw new Error("The CSV is empty.");
  const header = rows.shift().map((s) => s.toLowerCase().trim());
  const en = header.findIndex((s) =>
    ["en", "english", "source_text"].includes(s),
  );
  const fil = header.findIndex((s) =>
    ["fil", "filipino", "tagalog", "target_text"].includes(s),
  );
  if (en < 0 || fil < 0)
    throw new Error("CSV headers must include english and filipino.");
  return validatePairs(
    rows.map((row) => ({
      en: (row[en] || "").trim(),
      fil: (row[fil] || "").trim(),
    })),
  );
}
export function csvText(rows) {
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((value) => {
            let text = String(value ?? "");
            if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
            return '"' + text.replaceAll('"', '""') + '"';
          })
          .join(","),
      )
      .join("\r\n")
  );
}
export function download(name, content, type = "application/json") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function quizIdentity(value) {
  return `${value.material_id || value.id}:${value.grade_level ?? 0}:${value.quiz_number ?? "legacy"}:v${value.material_version ?? value.version ?? 1}`;
}
export function recordedQuizAttempts(data) {
  const byId = new Map((data.materials || []).map((m) => [m.id, m])),
    seen = new Set();
  return (data.attempts || [])
    .filter((a) => {
      const identity = a.submission_id || a.id;
      if (identity && seen.has(identity)) return false;
      if (identity) seen.add(identity);
      return (a.activity_kind || byId.get(a.material_id)?.kind) === "quiz";
    })
    .map((a) => {
      const m = byId.get(a.material_id);
      return {
        ...a,
        activity_kind: "quiz",
        grade_level: a.grade_level ?? m?.grade_level,
        quiz_number: a.quiz_number ?? m?.quiz_number,
        material_title: a.material_title ?? m?.title,
      };
    });
}
export function latestQuizAttempts(attempts) {
  const map = new Map();
  for (const attempt of attempts.filter((a) => a.activity_kind === "quiz" && a.assessment_type !== 'pending_online_scoring' && a.correct_count != null && a.total_count > 0)) {
    const key = `${attempt.child_id}:${quizIdentity(attempt)}`,
      previous = map.get(key);
    if (
      !previous ||
      new Date(attempt.completed_at) > new Date(previous.completed_at) ||
      (attempt.completed_at === previous.completed_at &&
        String(attempt.id) > String(previous.id))
    )
      map.set(key, attempt);
  }
  return [...map.values()];
}
export function gradebookMatrix(data, children, grade = "") {
  const latest = latestQuizAttempts(recordedQuizAttempts(data)),
    columns = new Map();
  for (const m of learningShelf(data.materials || []))
    if (m.kind === "quiz" && ["published", "classroom"].includes(m.status)) {
      const key = quizIdentity(m);
      columns.set(key, { ...m, key });
    }
  for (const a of latest) {
    const key = quizIdentity(a);
    if (!columns.has(key))
      columns.set(key, {
        id: a.material_id,
        key,
        title: a.material_title,
        version: a.material_version,
        kind: "quiz",
        grade_level: a.grade_level,
        quiz_number: a.quiz_number,
        status: "archived",
        historical: true,
      });
  }
  const selected = [...columns.values()]
    .filter(
      (m) =>
        (!grade || m.grade_level === Number(grade)) &&
        (children.some((c) => c.grade_level === m.grade_level) ||
          latest.some(
            (a) =>
              quizIdentity(a) === m.key &&
              children.some((c) => c.id === a.child_id),
          )),
    )
    .sort(
      (a, b) =>
        a.grade_level - b.grade_level ||
        (a.quiz_number || 0) - (b.quiz_number || 0) ||
        String(a.title).localeCompare(String(b.title)),
    );
  return {
    columns: selected,
    rows: children.map((child) => ({
      child,
      cells: selected.map((m) => {
        const attempt = latest.find(
          (a) => a.child_id === child.id && quizIdentity(a) === m.key,
        );
        if (attempt)
          return {
            kind: "score",
            text: `${attempt.correct_count}/${attempt.total_count}`,
            attempt,
          };
        const assigned = !m.historical && materialAvailableFor(m, child);
        return {
          kind: assigned ? "missing" : "unassigned",
          text: assigned ? "No attempt" : "Not assigned",
        };
      }),
    })),
  };
}
export function worksheetHtml(material) {
  const escape = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>${escape(materialTitle(material))}</title><style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;padding:20px;line-height:1.6}h1{font-size:24px}li{break-inside:avoid;margin-bottom:25px}.option{margin:8px 0 8px 25px}@media print{body{margin:0}}</style><h1>${escape(materialTitle(material))}</h1><p>Grade ${escape(material.grade_level)} · LinguaKids</p><p>Name: _________________________ Date: __________________</p><ol>${(material.body?.questions || []).map((q) => `<li><strong>${escape(q.prompt)}</strong>${q.options.map((o, i) => `<div class="option">${String.fromCharCode(65 + i)}. ${escape(o.text)}</div>`).join("")}</li>`).join("")}</ol></html>`;
}
export function progressSummary(data) {
  const attempts = data.attempts || [],
    children = data.children || [];
  const quizzes = latestQuizAttempts(attempts);
  const total = quizzes.reduce((n, a) => n + a.total_count, 0);
  return {
    students: children.filter((c) => c.active).length,
    participants: new Set(attempts.map((a) => a.child_id)).size,
    completed: attempts.length,
    score: total
      ? Math.round(
          (quizzes.reduce((n, a) => n + a.correct_count, 0) / total) * 100,
        )
      : null,
    stars: attempts.reduce((n, a) => n + (a.stars || 0), 0),
  };
}
export const safeWebUrl = (url) => {
  try {
    return ["http:", "https:"].includes(new URL(url).protocol)
      ? url
      : undefined;
  } catch {
    return undefined;
  }
};
