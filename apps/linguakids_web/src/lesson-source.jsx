import { uiText, useUiLanguage } from "./i18n";
import { safeWebUrl } from './domain';
import './lesson-source.css';

export function LessonSource({material, offline = false}) {
  useUiLanguage();
  const source=material.body?.source;
  if(!source || source.basis!=='portal_topic_reference' || !safeWebUrl(source.url))return null;
  return <details className="lesson-source">
    <summary>{uiText("Lesson source & teaching notes")}</summary>
    <div><p>{source.authorship}</p>
      {offline ? <p>{source.title}</p> : <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title} ↗</a>}
      <p>{source.publisher} · {source.curriculum_version}</p>
      <p>{source.locator}</p>
      <p>{source.alignment_note}</p>
      {material.body.teacher_notes&&<p><strong>{uiText("Teaching notes: ")}</strong>{material.body.teacher_notes}</p>}
    </div>
  </details>;
}
