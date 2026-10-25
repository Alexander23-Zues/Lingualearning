# Acceptance matrix

## Implemented and locally verified

| Requirement | Evidence |
|---|---|
| Exactly two account roles | PostgreSQL enum, Python enum, Dart enum, and role contract test contain only administrator and educator. |
| Public signup cannot grant administrator | Flutter sends no role; the auth trigger always inserts `educator`. |
| Suspended accounts are denied | FastAPI checks every request; restrictive RLS gates all protected content using current profile status. |
| Private educator ownership | Owner-derived API writes and RLS owner policies protect resources, plans, quizzes, labels, sessions, downloads, and sync events. |
| No learner account required | Children use minimal adult-created child profiles and scoped learning sessions. No child email accounts, contact fields, photographs, or child PINs are requested. |
| Student progress is isolated | Live database assertions verify cross-adult ownership, scoped child progress, hidden quiz answer keys, server scoring, idempotency, session closure, and suspended-adult denial. |
| Adult pages save real content | Material editors, teaching plans, sessions, source references, datasets, training manifests, announcements, settings, reports, and audit views connect to protected data. |
| Presentation hides private controls | Dedicated full-screen route shows only presentation controls and requires educator password verification to exit. |
| Missing model state is accurate | API returns the specified message and has a passing regression test. |
| Dataset/model administration | Dataset validation, review schema, snapshots, split membership, model evaluation, activation, rollback, and audit paths are administrator-only. |
| Duplicate-safe synchronization | UUID sync events and one transactional RPC prevent duplicate session creation; API regression test passes. |
| Leakage-safe bidirectional splits | Related translations are grouped before split assignment, then expanded into both directions; tests pass. |
| Offline foundations | Android SQLite stores checksum-verified versioned resources and retryable unique session events. |
| Printable plan output | Generic teaching-plan PDF generation and system print/share flow are implemented without claiming an official DLL/DLP format. |

## Requires project data, credentials, or hardware before acceptance can be signed

| Requirement | Needed evidence |
|---|---|
| Login redirect and email recovery in hosted environment | Supabase project URL/keys, email provider configuration, and approved redirect URLs. |
| Further authorization verification | The focused live learning-permission assertions passed; the broader legacy pgTAP suite remains a separate check. |
| Curriculum-aligned lessons | Page-level official source entries and authorized reviewer decisions; no wording or codes are fabricated. |
| Expanded learning libraries | Thirty original supplemental starter materials are provided. Broader age-appropriate original/licensed content still needs authoring and review. |
| Translation quality and inference | Approved real parallel corpus, suitable GPU training, measured two-direction evaluation, human review, and activated package. |
| Android USB and projection behavior | Flutter SDK, Android toolchain, and the target physical phone/projector environment. |
| Full curriculum coverage | A reviewed content program across applicable grades, school years, learning areas, and quarters; no demonstration data is represented as complete coverage. |
