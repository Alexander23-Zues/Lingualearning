# LinguaKids Flutter application

The application targets Android and responsive Flutter Web. It uses Riverpod, GoRouter, Supabase Auth, server-protected workflows, SQLite on Android, and print/PDF export.

## Local screen preview

Double-click `Open LinguaKids Preview.cmd` in the repository root to open
http://127.0.0.1:8080. The launcher uses the SDK recorded in `.preview/flutter-sdk.txt`
(falling back to `.tools/flutter`) and starts a local-only Python server. Close the browser without stopping the server;
the launcher can reopen the same preview later.

To run the preview directly during development:

```powershell
flutter run -d chrome --web-port=8080 --target lib/main_preview.dart
```

The yellow preview toolbar opens the landing page, educator workspace, and
administrator workspace. Preview mode uses an in-memory identity and makes no
Supabase or API requests. Login, registration, cloud persistence, and translation
are unavailable. Demo materials, child profiles, plans, and progress can be edited
in memory and reset when the page refreshes.
The normal `lib/main.dart` entry point still requires real configuration.

## Adult workspaces and elementary students

The preview includes an in-memory original starter collection and one clearly
fictional child profile. Choose **Educator preview → Child Profiles → Start
learning** to inspect lessons, dictionary search, translation readiness, games,
quizzes, illustrated stories, saved vocabulary, stars/badges, progress, and downloads.
Preview changes last only until the page refreshes.

The connected app uses protected database data, original illustrated animal
stories, and distinct lesson/quiz/game pathways for Grades 1–6. Child profile creation is restricted to an
authorized adult and collects only nickname, preset avatar, grade, learning level,
and preferences. There are no child email accounts, photograph uploads, contact
fields, or child PINs. See `docs/end-users-and-permissions.md` at the repository root.

`Open LinguaKids App.cmd` also starts the local API on 127.0.0.1:8010 for connected
translation. Translation remains unavailable until a real approved trained model
and inference service are configured.

## Configure

For Vercel, import the repository root and follow `docs/github-and-vercel.md`.
The hosted build uses the same origin for web and API requests; the database
and accounts remain in Supabase.

```powershell
flutter pub get
flutter gen-l10n
flutter run -d chrome `
  --dart-define=SUPABASE_URL=https://YOUR_PROJECT.supabase.co `
  --dart-define=SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_ME `
  --dart-define=API_BASE_URL=http://127.0.0.1:8000 `
  --dart-define=AUTH_REDIRECT_URL=http://localhost:8080
```

Never put the Supabase secret key in Flutter. Public registration submits only name, email, optional school, and grades; the database trigger assigns `educator` regardless of client metadata.

## Android device

Enable USB debugging, confirm `adb devices`, then use `adb reverse tcp:8000 tcp:8000` for the API during USB testing. See `docs/windows-setup.md` for complete instructions.
