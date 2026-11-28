// One definition of progress for the roster, student record and mission monitor.
export function quizPercent(attempt) {
  if (attempt?.assessment_type === 'pending_online_scoring' || attempt?.correct_count == null || !(attempt.total_count > 0)) return null;
  return 100 * attempt.correct_count / attempt.total_count;
}

export function quizVersionKey(attempt) {
  return `${attempt.material_id}:${attempt.material_version ?? attempt.version ?? 1}`;
}

export function mergeRecordedAttempts(...groups) {
  const values=new Map();
  for(const attempt of groups.flat()) {
    const key=attempt.submission_id||attempt.id;
    if(key)values.set(key,attempt);
  }
  return [...values.values()];
}

export function quizDevelopment(attempts = []) {
  const groups = new Map();
  const seen = new Set();
  for (const attempt of attempts) {
    if (attempt.activity_kind !== 'quiz' || quizPercent(attempt) === null) continue;
    const id = attempt.submission_id || attempt.id;
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    const key = quizVersionKey(attempt);
    groups.set(key, [...(groups.get(key) || []), attempt]);
  }
  return [...groups].map(([key, values]) => {
    const history = [...values].sort((a, b) => String(a.completed_at || '').localeCompare(String(b.completed_at || '')) || String(a.id).localeCompare(String(b.id)));
    const first = history[0], latest = history.at(-1);
    const best = history.reduce((a, b) => quizPercent(b) > quizPercent(a) ? b : a);
    return { key, first, latest, best, attempts: history.length, change: quizPercent(latest) - quizPercent(first) };
  });
}

export function learnerProgress(learner, attempts = []) {
  if (!learner) return { state: 'unavailable', label: 'Progress unavailable', completed: 0, total: 0, percent: null, current: null, stage: null, reviews: [], quizzes: [] };
  const stages = learner.adventure?.stages || [];
  const steps = stages.flatMap(stage => stage.steps || []).filter(step=>step.status!=='not-assigned');
  const completed = steps.filter(step => step.status === 'completed').length;
  const current = steps.find(step => step.id === learner.adventure?.current_step_id) || null;
  const stage = stages.find(item => item.steps?.some(step => step.id === current?.id)) || null;
  const reviews = stages.flatMap(stage => (stage.steps || []).filter(step => step.status === 'needs_review').map(step => ({ stage, step })));
  let state = !steps.length ? 'unprepared' : !current && completed === steps.length ? 'completed' : completed ? 'in-progress' : 'not-started';
  if (current?.status === 'needs_review') state = 'reading-review';
  else if (current?.status === 'pending_online_scoring') state = 'pending-scoring';
  else if (current?.kind === 'quiz' && current.score?.correct != null && current.score.total > 0 && 100 * current.score.correct / current.score.total < 80) state = 'quiz-retry';
  if(learner.adventure?.placement?.requires_review)state='placement-review';
  const labels = { unprepared: 'Missions not prepared', completed: 'All missions completed', 'in-progress': 'In progress', 'not-started': 'Ready to start', 'reading-review': 'Teacher reading review', 'pending-scoring': 'Awaiting online scoring', 'quiz-retry': 'Quiz needs another try','placement-review':'Teacher placement review' };
  const allAttempts = [...attempts, ...(learner.quiz_attempts || [])];
  const dates = allAttempts.map(a => a.completed_at).filter(value => value && Number.isFinite(Date.parse(value))).sort((a, b) => Date.parse(b) - Date.parse(a));
  return { state, label: labels[state], completed, total: steps.length, percent: steps.length ? Math.round(100 * completed / steps.length) : null,
    current, stage, stageNumber: stage ? stages.indexOf(stage) + 1 : null, reviews,
    completedLevels: stages.filter(stage => stage.status === 'completed').length, totalLevels: stages.length,
    lastActivity: dates[0] || null, quizzes: quizDevelopment(allAttempts) };
}
