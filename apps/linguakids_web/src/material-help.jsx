import { uiText, useUiLanguage } from "./i18n";
import { Button, Modal } from './ui';

export const materialVisibility = {
  draft: {label:'Draft',description:'A work in progress. Only its owner and administrators can open it; students cannot use it yet.'},
  classroom: {label:'Classroom',description:'Ready for your own students in the selected grade. Other educators cannot use this private classroom material.'},
  submitted: {label:'Submitted for review',description:'Waiting for an administrator to review. Students cannot use it until it is published or shared with your classroom.'},
  published: {label:'Published',description:'Available to students in the selected grade. An administrator controls publication.'},
  archived: {label:'Archived',description:'Kept for reference and past results. It is no longer available as an active student activity.'},
};
export function MaterialVisibilityHint({status}) {
  useUiLanguage();
  const visibility=materialVisibility[status];
  if(!visibility)return null;
  return <p className="material-visibility-hint" role="status"><strong>{visibility.label}</strong>{visibility.description}</p>;
}
export function MaterialGuide({admin,onClose,onCreate}) {
  useUiLanguage();
  return <Modal title={uiText("How Teaching Materials works")} onClose={onClose} wide>
    <div className="material-guide">
      <p>{uiText("A shared library of English–Filipino learning activities. Start with one grade and one learning goal.")}</p>
      <ol className="material-guide-steps">
        <li><strong>{uiText("Find the right activity")}</strong><p>{uiText("Choose a material type, then search or filter by grade. Active filters appear below the search box; remove one to widen your results.")}</p></li>
        <li><strong>{uiText("Create and preview")}</strong><p>{uiText("Add a title, grade and content. Lessons and stories use bilingual pages; games and vocabulary use English–Filipino pairs; quizzes need questions and correct answers.")}</p></li>
        <li><strong>{admin?uiText('Review before publishing'):uiText('Choose who can use it')}</strong><p>{admin?uiText('Open Preview to check the activity. In Review, choose a decision and explain it in the review notes. Publishing makes the activity available to students of its grade.'):uiText('Save a Draft while you work. Choose Classroom when it is ready for your own students, or Submitted when you want an administrator to review it for publication.')}</p></li>
        <li><strong>{uiText('Arrange the mission sequence')}</strong><p>{uiText('Place in missions opens the grade’s sequence editor. Review the order, then save it. Students follow the assigned sequence and cannot skip locked tasks.')}</p></li>
        <li><strong>{uiText("Use student mode to record results")}</strong><p>{uiText('Open Students & missions → Continue assigned mission. Student completion saves the result to their record. Teacher preview never records a student grade.')}</p></li>
      </ol>
      <details className="material-guide-statuses"><summary>{uiText("What do the visibility settings mean?")}</summary>
        {Object.entries(materialVisibility).map(([status])=><MaterialVisibilityHint key={status} status={status}/>)}
      </details>
      <p className="material-guide-tip">{uiText("Quiz scores appear in Reports & Gradebook. Activity completion contributes to student progress.")}</p>
    </div>
    <div className="modal-actions"><Button variant="secondary" onClick={onClose}>{uiText("Got it")}</Button>{onCreate&&<Button icon="plus" onClick={onCreate}>{uiText("Create a material")}</Button>}</div>
  </Modal>;
}
