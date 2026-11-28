# Railway full-system deployment

For the noncommercial school deployment, run
`python deploy/prepare_upload.py --include-school-voices`. The command prints
the path of a fresh release directory. Upload that exact path using
`railway up "<printed path>" --path-as-root --detach` from the linked project.
Use `--output` to request a specific new release directory outside the source tree.

Cloud builds bundle pinned translation and Whisper checkpoints and, for the
school release, English and Tagalog pronunciation models. See the deployed
`/model-credits.txt` for their model licenses. The release directory excludes
local secrets, private datasets, and local model weights.

1. Use the existing Railway service and its approved GitHub release commit.
   Alternatively, use the upload command above in a supported Railway CLI environment.
2. Attach a persistent volume mounted at `/data` BEFORE the first deployment.
3. Set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and a random
   `INFERENCE_SHARED_SECRET` as runtime variables. Supply `SUPABASE_SECRET_KEY`
   only for privileged workflows/training. Never place secrets in source/build args.
4. Leave laptop path/URL overrides unset: `API_BASE_URL`, `MODEL_PACKAGE_PATH`,
   `READING_MODEL_PATH`, `MODEL_PACKAGE_ROOT`, `TRAINING_BASE_PACKAGE_PATH`.
   Startup loads the bundled baseline and Whisper models from the image;
   new model releases and training outputs use the volume.
5. Generate the Railway HTTPS domain; set Supabase Auth Site URL and permitted
   callback URL to it. Set `AUTH_REDIRECT_URL` only if an explicit override is needed.
6. `/ready` must return 200 with translation and reading true. Verify real login,
   permissions, translation in both directions, a recorded reading exercise, and the four Offline Library categories. For the school build, check that /ready also reports offline_speech and both voice languages return audio.
   Loading the baseline does not approve or activate it in the database;
   preserve the existing administrator review/activation workflow.
7. Training source/dependencies are included. Set `ENABLE_TRAINING_WORKER=true`
   only when intentionally processing the live queue and allocating enough memory.
   Job artifacts persist under `/data/training/jobs`. Reviewed releases must still
   be published into `/data/models/releases` through the existing release workflow.

This CPU image can also run on a Docker VPS with a `/data` volume. CPU training
can be slow; resource sizing requires an actual model/load test. No database reset
or migration is run by deployment. Existing Supabase accounts/data remain there.

## Retired legacy deployment configuration

The root `railway.json` is archived as `deploy/legacy/railway.json.disabled`.
Before deploying this removal, preserve its settings on the existing Railway
service: the Dockerfile builder and `Dockerfile` path, `/ready` healthcheck,
300-second healthcheck timeout, `ON_FAILURE` restart policy and three retries.
Clear the service's Config File path with an empty string. This settings update
does not itself deploy or change a volume; a later release deployment uses the
preserved service configuration. Keep the existing `/data` mount, variables,
replicas, region and domain. Do not recreate the service or volume.

The packager works when the legacy root file is absent. Its compatibility flag
`--after-iac-cutover` also omits a legacy file in an older checkout after the
service path has been cleared. `--include-school-voices` works with either the
normal Dockerfile default or an already-enabled school release.

The `.railway/railway.ts` file is prepared for future IaC adoption; a normal
Git deployment does not apply it or assign IaC resource ownership. Preserving
service settings and retiring the legacy file is not a completed IaC plan/apply.
Inspect a supported CLI plan before any later apply, retaining the data volume
and unmanaged secrets. See [Railway's migration guide](https://docs.railway.com/infrastructure-as-code#migrating-from-config-as-code).

