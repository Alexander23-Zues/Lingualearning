# Deployment

For the configured monorepo deployment, start with [GitHub and Vercel](github-and-vercel.md).

- Deploy Flutter Web behind HTTPS with SPA fallback to `index.html`.
- Replace the Android debug signing configuration with a protected release keystore before publishing an APK or app bundle.
- Deploy FastAPI behind an HTTPS reverse proxy. Restrict CORS to the deployed web origins.
- Keep `SUPABASE_SECRET_KEY` and `INFERENCE_SHARED_SECRET` in the deployment secret manager.
- Deploy inference privately with one worker per loaded model unless memory testing supports more. Expose it only to the API network.
- Mount an administrator-approved model package read-only. Verify its manifest checksums at startup.
- Apply Supabase migrations before application rollout and run database authorization tests.
- Use hosted Supabase backups and retention appropriate to the institution.
- Do not deploy training dependencies with the normal API or inference image.
- Do not store raw translation requests in logs, analytics, or training datasets.

Production authentication, API, storage, and web traffic must use HTTPS. Rotate any credential that has been exposed to a client or repository.
