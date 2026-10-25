# API

FastAPI publishes interactive OpenAPI documentation at `/docs` and machine-readable schema at `/openapi.json`.

## Public

- `GET /health` — API liveness.

## Any active authenticated account

- `GET /v1/me` — verified profile and role.
- `POST /v1/translation` — short connected translation; fails accurately when no model is active.

## Educator only

- `POST /v1/resources` — creates a private, owner-derived resource draft.
- `POST /v1/sessions/sync` — duplicate-safe class-level session synchronization by event UUID.

## Administrator only

- `PATCH /v1/admin/educators/{id}/status` — activates or suspends an educator with audit reason.
- `POST /v1/admin/datasets/validate` — validates a UTF-8 CSV up to 5 MB and reports duplicates/conflicts.
- `POST /v1/admin/models/activate` — atomic activation after checksum, approval, and two-direction evaluation checks.
- `POST /v1/admin/models/rollback` — atomic rollback to the immediately previous active model.

All protected routes reject expired/invalid sessions and suspended profiles. The service does not accept role or owner IDs from the client for authorization.

## Adult workspace and child learning

The Flutter workspace uses authenticated Supabase invoker RPCs for
`workspace_snapshot`, `save_learning_material`, `learning_material_editor`,
`save_workspace_record`, `save_child_profile`, `open_child_session`,
`admin_update_educator`, and `workspace_model_action`. Private implementations check
the current adult profile and derive ownership from the authenticated identity.

Child-only RPCs `student_learning_state`, `student_complete_material`,
`student_save_vocabulary`, and `close_child_session` accept only the random scoped
learning token. They do not accept an adult JWT or a caller-selected child ID.
The child client calls them using the publishable key with no adult authorization
header. Quiz answers are graded against a private key; the client never supplies
a score or awarded stars.

`POST /v1/student-translation` accepts the learning token, a short sentence, and
the two supported language directions. It validates the session through Supabase
before using the active trained model. An absent model returns the honest missing
model state. This local API uses port 8010; port 8000 may belong to another app.

The compatibility `/v1/students` routes now accept only nickname, preset avatar,
grade, learning level, and constrained preferences. No child contact fields or
PIN are accepted. An adult opens the learning session with an empty request body.
