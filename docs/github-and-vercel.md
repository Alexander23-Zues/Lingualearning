# GitHub and Vercel

The complete source repository contains Flutter, the protected Python API, Supabase migrations and tests, original learning content and artwork, and the separate training/inference source. Local SDKs, caches, passwords, private datasets, model weights, and `.env` files are excluded from Git.

## Deploy the app and API together

1. Import `Alexander23-Zues/Lingualearning` into Vercel. Use the repository root, not `apps/linguakids_app`.
2. Keep the **FastAPI** framework preset. `vercel.json` supplies the build command. `.python-version` selects Python 3.12.
3. Set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in the project's environment using the existing Linguakids project. Never substitute a secret/service-role key.
4. Optionally set `ADMIN_SETUP_EMAIL` for the invited owner's setup link. This does not grant a role; Supabase's verified invitation remains authoritative.
5. Deploy. The build downloads SHA-256-verified Flutter 3.44.4 and compiles the connected `lib/main.dart` into `public/`. The root `index.py` exports FastAPI.
6. In Supabase **Authentication → URL Configuration**, set the Site URL and allowed redirect URL to the actual production HTTPS address. Include any explicitly configured `AUTH_REDIRECT_URL`. Add preview URLs only if account use on those previews is intended.
7. Verify `/health`, registration/email confirmation/login, adult roles, and a child learning session on the deployed URL. Confirm logged-out `/v1/me` returns 401.

Vercel serves `public/` assets through its CDN. The API keeps `/v1/...` and `/health`, and the hosted client uses its current origin instead of a laptop API. The root redirect preserves email callback query parameters. Flutter uses hash navigation, so a broad rewrite to HTML is unnecessary.

References: [FastAPI and static assets on Vercel](https://vercel.com/docs/frameworks/backend/fastapi), [Python runtime](https://vercel.com/docs/functions/runtimes/python), [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), [Flutter SDK archive](https://docs.flutter.dev/install/archive).

## Environment

| Variable | Use | Required |
| --- | --- | --- |
| `SUPABASE_URL` | Browser and API | Yes |
| `SUPABASE_PUBLISHABLE_KEY` | Browser and API | Yes |
| `ADMIN_SETUP_EMAIL` | Invited-owner setup UI | Optional |
| `AUTH_REDIRECT_URL` | Canonical email callback | Optional; defaults to current web origin |
| `API_BASE_URL` | Separate API override | Leave unset for this single-project deployment |
| `SUPABASE_SECRET_KEY` | Privileged server workflows | Optional server secret, never compiled into Flutter |
| `CORS_ORIGINS` | Cross-origin API clients | Optional JSON array of exact HTTPS origins |
| `INFERENCE_BASE_URL` | Private model service | Only when enabling translation |
| `INFERENCE_SHARED_SECRET` | API-to-model authentication | Only when enabling translation |

The build copies a fixed allowlist of public client fields. It rejects secret/service-role keys and localhost overrides. Put actual values in Vercel settings, not source files.

## Database and model workloads

Supabase retains live Auth, database, Storage, scoring, permissions, and audit records. A Git push does not copy or reset the data. Existing migrations are already installed in the configured project; the Vercel build does not run migrations.

Training and PyTorch inference remain separate workloads. Their complete source is included, but private datasets, model weights, and training/inference dependencies are excluded from the API function. No approved trained model is currently active. Translation becomes available only after a real model is trained, reviewed, deployed to a suitable private inference host, and activated by an administrator.

## Checks and updates

GitHub Actions checks Flutter, a connected web build, API authorization, deployment configuration, and dataset split validation. A local deployment build can reuse the installed Flutter SDK:

```powershell
python scripts/build_vercel.py --flutter "C:/path/to/flutter/bin/flutter.bat"
```

Set the two public environment variables in that process first. When GitHub is linked to Vercel, subsequent pushes trigger builds. Real inbox delivery and the first verified login still need a smoke test on the production domain.
