# LinguaKids React frontend

This is the active browser application. It uses React, Vite, HashRouter and the
official Supabase JavaScript SDK. It renders ordinary HTML; Flutter is not
embedded, loaded in an iframe or required to build this frontend.

From the repository root:

```powershell
./scripts/open_app.ps1
./scripts/open_preview.ps1
```

The connected app uses http://localhost:3000. The older address
http://localhost:8080 redirects to the same connected app, preserving hash routes
and email callback parameters. Both normal launchers open the connected system.
The in-memory demonstration repository is used only by isolated development tests.

For development, prepare the public settings and use Vite's hot reload:

```powershell
python scripts/build_react.py --prepare-only
./scripts/start_api.ps1
npm run dev
```

The normal launcher prepares `public/config.json` from an explicit allowlist in
the existing `.preview/live-config.json`. Hosted builds use the corresponding
environment fields. A secret key is rejected as a browser key. Never put a
backend secret in a `VITE_` variable. Generated configuration and build outputs
are ignored by Git. Only the public URL, publishable key, API URL, email redirect
and optional administrator invitation email reach the browser.

Run `npm test:web` from the repository root for React tests. Build with
`python scripts/build_react.py`. The launcher copies each build into its own
connected serving directory. The legacy preview address serves only a redirect;
it does not load demonstration accounts or write browser-local classroom records.

`src/repository.js` contains the authenticated data calls. Student requests use a
separate fetch with a scoped student token and no educator JWT. Database roles,
material ownership, publication, training and grading remain enforced by the
existing Supabase policies and checked RPCs. The local API is normally on 8010;
hosted requests use the same origin unless API_BASE_URL is explicitly configured.
