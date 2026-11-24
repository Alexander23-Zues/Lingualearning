// Demonstration data belongs only to the explicitly labeled offline preview.
import {previewMissionTools} from './adventure/preview-missions';
export function createPreviewRepository() {
  const key = "linguakids.react.preview.v1",
    listeners = new Set();
  let role = sessionStorage.getItem("linguakids.react.preview-role");
  const makeUser = (r) => ({
    id: `preview-${r}`,
    name: r === "administrator" ? "Alex Administrator" : "Teacher Alex",
    email: "preview@example.test",
    role: r,
    status: "active",
    grade_levels: [1, 2, 3, 4, 5, 6],
  });
  const lesson = {
    id: "preview-lesson",
    title: "A little seed, a big discovery",
    kind: "lesson",
    grade_level: 1,
    learning_level: "beginner",
    version: 1,
    status: "published",
    summary: "Discover new words together in English and Filipino.",
    body: {
      english:
        "A little seed grows in the garden. We give it water and sunshine.",
      filipino:
        "Tumutubo ang maliit na buto sa hardin. Dinidiligan natin ito at binibigyan ng sikat ng araw.",
    },
  };
  const story = {
    ...lesson,
    id: "preview-story",
    kind: "story",
    title: "The reading garden",
    summary: "Follow Owl and Turtle on a reading adventure.",
    body: {
      pages: [
        {
          english: "Owl finds a book under the tree.",
          filipino: "Nakakita si Kuwago ng aklat sa ilalim ng puno.",
        },
        {
          english: "Turtle comes to read with a friend.",
          filipino: "Lumapit si Pagong upang magbasa kasama ang kaibigan.",
        },
        {
          english: "They share a new story together.",
          filipino: "Sabay silang nagbasa ng bagong kuwento.",
        },
      ],
    },
  };
  const dictionary = {
    ...lesson,
    id: "preview-words",
    kind: "dictionary",
    title: "Words from our garden",
    body: {
      pairs: [
        { en: "tree", fil: "puno" },
        { en: "book", fil: "aklat" },
        { en: "friend", fil: "kaibigan" },
      ],
    },
  };
  const quiz = {
    ...lesson,
    id: "preview-quiz",
    kind: "quiz",
    quiz_number: 1,
    title: "Words we discovered",
    body: {
      questions: [
        {
          id: "demo-question",
          prompt: "Which word means book?",
          options: [
            { id: "demo-a", text: "aklat" },
            { id: "demo-b", text: "puno" },
          ],
        },
      ],
    },
  };
  let data;
  try {
    data = JSON.parse(localStorage.getItem(key));
  } catch {}
  data ||= {
    materials: [
      lesson,
      story,
      dictionary,
      {
        ...dictionary,
        id: "preview-game",
        kind: "game",
        title: "Match our garden words",
      },
      quiz,
    ],
    records: [],
    children: [
      {
        id: "preview-child-1",
        adult_id: "preview-educator",
        nickname: "Mika",
        avatar_key: "owl",
        grade_level: 1,
        learning_level: "beginner",
        active: true,
        preferences: {},
      },
      {
        id: "preview-child-2",
        adult_id: "preview-educator",
        nickname: "Sam",
        avatar_key: "turtle",
        grade_level: 1,
        learning_level: "developing",
        active: true,
        preferences: {},
      },
    ],
    attempts: [],
    educators: [makeUser("educator")],
    models: [],
    favorites: [],
    reviews: [],
    model_evaluations: [],
    model_activations: [],
    active_model: null,
  };
  const persist = () => localStorage.setItem(key, JSON.stringify(data));
  const missions=previewMissionTools(data,persist);
  const auth = () => ({
    session: role ? { user: { id: `preview-${role}` } } : null,
    recovery: false,
  });
  const emit = () => listeners.forEach((fn) => fn(auth()));
  let prefs = {
    locale: "en",
    text_scale: 1,
    reduced_motion: false,
    muted: false,
  };
  async function rpc(name, p) {
    if(name==='educator_adventure')return missions.path(p.p_grade);
    if(name==='educator_adventure_progress')return data.children.filter(c=>c.active&&c.grade_level===p.p_grade).map(c=>({child_id:c.id,nickname:c.nickname,adventure:missions.state(c),quiz_attempts:data.attempts.filter(a=>a.child_id===c.id&&a.activity_kind==='quiz'&&a.adventure_step_id).map(a=>({...a,step_id:a.adventure_step_id}))}));
    if(name==='save_adventure')return missions.save(p);
    if(name==='educator_placement')return {placement:data.preview_missions.placements[p.p_child_id]||null,has_started:missions.started(p.p_child_id),adventure:missions.state(data.children.find(c=>c.id===p.p_child_id))};
    if (name === "workspace_snapshot") return structuredClone(data);
    if (name === "learning_material_editor")
      return structuredClone(data.materials.find((m) => m.id === p.p_id));
    if (name === "open_child_session")
      return {
        token: `preview:${p.p_child_id}`,
        child: data.children.find((c) => c.id === p.p_child_id),
      };
    if (
      name === "record_account_event" ||
      name === "claim_initial_administrator"
    )
      return;
    if (name === "set_material_favorite") {
      data.favorites = p.p_saved
        ? [...new Set([...data.favorites, p.p_id])]
        : data.favorites.filter((id) => id !== p.p_id);
      persist();
      return;
    }
    if (
      [
        "save_learning_material",
        "save_workspace_record",
        "save_child_profile",
      ].includes(name)
    ) {
      const collection =
          name === "save_learning_material"
            ? "materials"
            : name === "save_child_profile"
              ? "children"
              : "records",
        old = data[collection].find((r) => r.id === p.p_id),
        id = p.p_id || crypto.randomUUID();
      const value = {
        ...old,
        ...p.p_data,
        id,
        owner_id: old?.owner_id || `preview-${role}`,
        updated_at: new Date().toISOString(),
        version: (old?.version || 0) + 1,
      };
      if (collection === "children")
        value.adult_id = old?.adult_id || `preview-${role}`;
      if (
        collection === "materials" &&
        value.kind === "quiz" &&
        !value.quiz_number
      )
        value.quiz_number =
          data.materials.filter((m) => m.kind === "quiz").length + 1;
      data[collection] = [
        ...data[collection].filter((r) => r.id !== id),
        value,
      ];
      persist();
      return id;
    }
    if (name === "review_learning_material") {
      data.materials.find((m) => m.id === p.p_id).status = p.p_decision;
      persist();
      return;
    }
    if (name === "admin_update_educator") {
      data.educators.find((u) => u.id === p.p_id).status = p.p_status;
      persist();
      return;
    }
    throw new Error("This operation requires the connected app.");
  }
  async function studentRpc(name, p, token) {
    const id = token.replace("preview:", ""),
      child = data.children.find((c) => c.id === id);
    if (!child) throw new Error("Reopen the preview profile.");
    if (name === "close_child_session") return;
    if(name==='student_choose_adventure_start')return missions.choose(child,p);
    if(name==='student_adventure_state')return {...await studentRpc('student_learning_state',{},token),adventure:missions.state(child)};
    if(name==='student_adventure_complete'){
      const adventure=missions.state(child),step=adventure.stages.flatMap(s=>s.steps).find(s=>s.id===p.p_step_id);
      if(p.p_revision!==adventure.revision||!step||step.id!==adventure.current_step_id)throw new Error('Finish the current mission activity first.');
      if(step.kind==='story'&&!step.teacher_approved)throw new Error('Demonstration reading does not produce AI evidence. Use the connected app for a real reading check.');
      const result=await studentRpc('student_complete_material',{...p,p_material_id:step.material_id,p_version:step.material_version},token);result.adventure_step_id=step.id;persist();return {...result,adventure_passed:step.kind!=='quiz'||result.correct_count*100>=result.total_count*80,adventure:missions.state(child)};
    }
    if (name === "student_learning_state")
      return {
        child,
        materials: structuredClone(
          data.materials.filter((m) => m.grade_level === child.grade_level),
        ),
        attempts: data.attempts.filter((a) => a.child_id === id),
        stars: data.attempts
          .filter((a) => a.child_id === id)
          .reduce((n, a) => n + a.stars, 0),
        badges: [],
        saved_vocabulary: [],
      };
    if (name === "student_save_vocabulary") return;
    if (name === "student_complete_material") {
      const existing = data.attempts.find(
        (a) => a.submission_id === p.p_submission_id,
      );
      if (existing) return existing;
      const m = data.materials.find((m) => m.id === p.p_material_id);
      const questions = m.body.questions || [];
      const total = m.kind === "quiz" ? questions.length : 1;
      const correct =
        m.kind === "quiz"
          ? questions.filter(
              (q) => p.p_answers[q.id] === (q.correct_option_id || "demo-a"),
            ).length
          : 1;
      const attempt = {
        id: crypto.randomUUID(),
        submission_id: p.p_submission_id,
        child_id: id,
        material_id: m.id,
        material_version: m.version,
        material_title: m.title,
        grade_level: m.grade_level,
        quiz_number: m.quiz_number,
        activity_kind: m.kind,
        correct_count: correct,
        total_count: total,
        stars: correct === total ? 3 : 1,
        completed_at: new Date().toISOString(),
      };
      data.attempts.push(attempt);
      persist();
      return attempt;
    }
    throw new Error("Use the connected app for this operation.");
  }
  return {
    preview: true,
    config: {},
    rpc,
    studentRpc,
    initialize: async () => auth(),
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    profile: async () => (role ? makeUser(role) : null),
    enterPreview: async (r) => {
      role = r;
      sessionStorage.setItem("linguakids.react.preview-role", r);
      emit();
    },
    signOut: async () => {
      role = null;
      sessionStorage.removeItem("linguakids.react.preview-role");
      emit();
    },
    signIn: async () => {
      throw new Error(
        "Preview does not accept account passwords. Use the connected app.",
      );
    },
    snapshot: async () => structuredClone(data),
    preferences: async () => prefs,
    savePreferences: async (_, v) => {
      prefs = v;
    },
    api: async (path, body) => {
      if(!body&&path.startsWith('/v1/offline/recordings?'))return {items:[],next_offset:null};
      if (!body && ["/v1/ai/jobs", "/v1/ai/history"].includes(path)) return [];
      throw new Error(
        "Live translation, reading recognition, and training are available only in the connected app.",
      );
    },
    loadTable: async () => [],
    saveTable: async () => {
      throw new Error("Use the connected app to edit this library.");
    },
  };
}
