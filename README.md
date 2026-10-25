# LinguaKids

LinguaKids is a Flutter mobile and responsive web workspace for adult-led English–Filipino language and literacy instruction in Grades 1–6. Its authenticated adult roles are `administrator` and `educator`. Elementary students use minimal child profiles created by an authorized adult, without child email accounts. See `docs/end-users-and-permissions.md` for the profile fields and learning permissions.

## Repository layout

- `apps/linguakids_app` — Flutter Android/Web application using Riverpod and GoRouter.
- `services/api` — FastAPI application for protected workflows and Supabase integration.
- `services/inference` — separately deployable authenticated translation inference service.
- `supabase` — PostgreSQL migrations, RLS/storage policies, and authorization tests.
- `ml` — dataset validation, leakage-safe splitting, mT5 training/evaluation, packaging, and notebook.
- `scripts` — secure first-administrator setup.
- `docs` — architecture, setup, deployment, API, testing, and source guidance.

## Quick start

For GitHub and Vercel hosting, see [the deployment guide](docs/github-and-vercel.md).
The root Vercel project hosts the connected Flutter web app and protected API;
Supabase retains the live accounts and database. Model training and inference
remain separate workloads.

For the configured live project, use `Set Up Admin Account.cmd` to choose the first
administrator's account password and verify the invited email. Use
`Open LinguaKids App.cmd` for normal login afterward. See `docs/admin-setup.md`.

To inspect the screens without configuring accounts or a database, double-click
`Open LinguaKids Preview.cmd`. It opens http://127.0.0.1:8080 with a clearly labeled
local preview and buttons for the educator and administrator workspaces.
This preview does not save data or provide live authentication or translation.

For a connected development environment:

1. Follow `docs/windows-setup.md` and copy `.env.example` to `.env` without committing it.
2. Apply the Supabase migrations in timestamp order.
3. Start the API from `services/api` and the inference service only when an approved model package exists.
4. Run the Flutter app with `--dart-define` values documented in `apps/linguakids_app/README.md`.
5. Create the first administrator with `scripts/create_admin.py`; public registration always creates educators.

No private dataset, credential, model weight, fabricated competency, or claimed model score is included.
