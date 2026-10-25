# Verification results

Run on Windows 11 in the provided development environment on 2026-10-25.

## Completed

- `python -m compileall -q services ml scripts` — passed.
- `python -m pytest -q` in `services/api` — 9 passed.
- `python -m pytest -q tests` in `ml` with `PYTHONPATH=.` — 2 passed.
- Static role scan — exactly `administrator` and `educator` in PostgreSQL, Python, and Dart role definitions.
- Forbidden-table scan — no learner, child-profile, parent, or guardian account table definitions.

## Local browser preview verification

Using the existing Flutter 3.44.4 SDK and Dart 3.12.2:

- `flutter analyze --no-pub` — no issues found.
- `flutter test --no-pub` — 5 passed, including preview navigation, a 390-pixel landing page, and refusal of live credentials/API calls in preview mode.
- `flutter build web --no-pub --target lib/main_preview.dart --no-web-resources-cdn` — passed.
- Local preview health endpoint returned HTTP 200, and the landing page was visually checked in the browser.
- Launch with `Open LinguaKids Preview.cmd` at the repository root. The server listens only on `127.0.0.1:8080`.

The build reported optional WebAssembly compatibility findings in the third-party text-to-speech plugin; the delivered preview is the successful JavaScript web build. The launcher disables the optional WebAssembly dry run on future preview builds.

The API tests cover owner-derived private resource creation, administrator/educator endpoint separation, duplicate-safe session sync, the exact missing-model state, administrator-only dataset review, duplicate/conflict detection, and suspended-account denial. ML tests cover related-pair split isolation and bidirectional expansion.

## Connected admin and audit verification

- Live initial-schema, RLS/storage, and admin/audit migrations applied to the empty Linguakids project.
- `flutter analyze --no-pub` — no issues found for the connected app.
- Eight Flutter tests pass, covering role contracts, preview behavior, narrow-screen layout, administrator form validation, audit searching, and bounded audit API reads.
- The production `lib/main.dart` web entry point built successfully with publishable-key configuration.
- Anonymous HTTP reads of profiles and audit logs returned 401.
- Database privilege checks deny anonymous administrator claims, signed-in invitation reads, and client audit inserts/updates.
- A transaction test confirmed that an authenticated SQL role without a user identity cannot claim administrator access.
- Supabase Auth reports email authentication enabled and email confirmation required.
- The setup page was visually verified at `http://localhost:3000/#/admin-setup`.
- No admin password was chosen by the assistant and no Auth account was created. The invited owner must submit the setup form and verify email to activate the first administrator.
- The full rollback-based admin fixture script is provided in `supabase/tests/admin_setup_and_audit.test.sql`; attempts to execute it returned connector request-state errors, so its full runtime assertions are not reported as passed.
- Security advisors reported no warnings or errors; the private invitation table's deliberate lack of RLS policies appeared as an informational default-deny notice.
- The student-roster migration was rejected by automatic approval review as beyond the admin/audit scope and was not deployed.

## Learning workspaces and minimal child profiles

- Source analysis: `flutter analyze --no-pub` passed with no issues.
- Flutter: 13 tests passed, including all administrator/educator destinations, a 390-pixel child-profile form, student-mode route locking, anonymous scoped child HTTP without an adult JWT, and offline answer queueing without local stars or stored session tokens.
- Python API: 22 tests passed, including rejection of child email, birth-date, address, phone, photograph, custom avatar URL, child PIN, and identity data hidden in preferences. Translation also refuses to forward text when private inference authentication is not configured.
- Live `supabase/tests/learning_permissions.test.sql` assertions passed. They cover adult ownership, minimal profile fields, constrained preferences, inaccessible adult routes, hidden answer keys/adult ownership data, server quiz grading, duplicate submission handling, child-to-child progress isolation, token revocation, and suspended-adult denial.
- The database test rolled back its fixtures; zero fixture accounts remained.
- The same live test also verifies saving a classroom quiz, restoring its private answer key in the adult editor, preventing an educator from publishing globally, saving a private teaching plan, and saving a child's vocabulary without leaking classroom content or plans across adults.
- Anonymous HTTP reads of child profiles and learning attempts returned 401. Student translation with an invalid learning token returned 403.
- Security advisors returned no warnings/errors. The three private default-deny tables were reported only as informational RLS-without-policy notices.
- Thirty original supplemental starter materials were installed across Grades 1–6. No trained translation model or official curriculum alignment is claimed.
- The PIN-based legacy roster migration is archived under `supabase/legacy`; it is not part of the active migration set. The new learning/child-profile and session-hardening migrations were applied after the user's explicit student-feature request.
- Preview and connected web builds passed. They use separate output folders (`build/web_preview` and `build/web_live`), and HTTP checks returned 200 for each page, icon font manifest, and student illustration.
- Browser verification covered both adult dashboards, opening a child learning session, completing the demo quiz, earning three demo stars and the First steps badge, and viewing the student's own progress. Screenshots are saved under `.preview/`.

## Expanded animal quizzes, games, and storybooks

- `flutter analyze --no-pub`: no issues. All 19 app tests passed.
- New tests cover the collection for all six grades, six questions with four distinct choices and varied correct positions, saved selections when moving back, complete quiz submission, retry feedback and progression for matching games, ten-page story completion, and clickable book covers on a 390-pixel screen.
- Both preview and production web builds passed and serve the new public content asset and animal illustration sheet with HTTP 200.
- Local rendering of the actual Flutter bookshelf, quiz, and story widgets confirmed colorful cover illustrations, large A–D choices, and persistent page controls. Browser automation was unavailable in Work settings, so this final visual check used widget rendering rather than a browser session.
- The additive `animal_storybook_collection` migration installed 72 records and private quiz keys. A verification query found 24 ten-page book records, 24 six-question quiz records, 24 matching games, zero public answer-key leaks, and zero existing records archived.
- `supabase/tests/animal_collection.test.sql` passed live: it validates the whole collection and completes all 12 Grade 1 activities using server grading. All temporary accounts, sessions, and progress roll back.
- Security advisors returned no warnings or errors; the existing private default-deny tables remain informational notices.
- The original proposal to archive old sample records was rejected by automatic approval review. The successful revision was additive and made no changes to old records or progress.

## Grade 1–6 pathways and account form repair

- `flutter analyze --no-pub` passed with no issues. All 30 app tests passed, including the installed Supabase SDK's signup, recovery, resend, profile lookup, and login-audit requests with mocked HTTP.
- Form tests cover preserved fields after failure, a successful login retry, registration success without a stranded dialog, phone layouts, password visibility, validated reset/resend actions, and recovery routing.
- All six grades have three distinct four-page lessons, three six-question A–D quizzes, and three four-pair games in the new grade pathways collection. Older stories, materials, and progress were preserved.
- The additive `grade_pathways_collection` migration installed 54 records and 18 private quiz keys. Live counts confirmed three activities of each kind per grade.
- `supabase/tests/grade_pathways.test.sql` passed live for all 54 activities. It checked grade delivery, scoring, hidden answer keys, and refusal of an administrator role supplied through public registration metadata. All temporary records rolled back.
- Supabase security advisors returned no warnings/errors, with the same three private default-deny informational notices.
- Live auth settings confirmed signup enabled and email verification required. No real registered accounts existed during inspection. Real inbox delivery and the owner's first verified login remain dependent on the owner's account creation and email access.
- The preview now links to real account pages, and its launcher starts the configured connected server as well. The demo remains independent of real account credentials and data.
- Both updated web builds passed. Each app returned HTTP 200 for its page, grade collection, and animal artwork. Actual Flutter widget rendering verified clean initial login/register forms and the Grade 6 lesson; images are saved in `.preview/account-login.png`, `.preview/account-register.png`, and `.preview/grade-six-lesson.png`.
- Account-navigation cleanup: removed the extra preview-bar and hero account buttons; existing header account controls now open the connected app directly from the demo. Source analysis and all three existing preview/navigation/phone-layout tests passed after the cleanup.

## GitHub and Vercel preparation

- All 30 Flutter tests passed after adding current-origin URL handling; source analysis found no issues.
- The hosted build script completed using the existing Flutter 3.44.4 SDK. It compiled the connected entry point with public configuration only and without a local API URL.
- A separate validation environment installed the exact top-level Python dependency versions from `requirements.txt`. All 22 API tests and seven deployment/configuration tests passed there. Two dataset preparation tests passed as well.
- Deployment checks verified public health, protected API routes, preservation of email PKCE callback parameters, and rejection of server secrets and local endpoints in frontend configuration.
- GitHub Actions is configured for these checks and a Linux Flutter build using a pinned official SDK archive with SHA-256 verification. That Linux/cloud path is not claimed as executed until the workflow/deployment reports success.
- Vercel production deployment and production email callbacks require the Vercel connection, environment variables, and the actual HTTPS address in Supabase's redirect settings. The local build does not confirm a live deployment.

## Remaining external checks

- The owner must finish account creation, email confirmation, and first real login before the positive invitation-claim path can be verified with that account. The independent preview does not initialize Supabase or make API requests.
- The legacy broad pgTAP suite includes student-roster assertions and was not run against this narrower admin/audit deployment.
- Android USB behavior requires a configured physical phone.
- Model inference requires a real approved dataset, GPU training run, reviewed checkpoint, and mounted package.
- Official curriculum mappings require authorized reviewers to enter page-level source records.

These items are intentionally not reported as successful until their required environment, credentials, source documents, data, or hardware are supplied.
