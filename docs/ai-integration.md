# AI integration: implementation and operations

This extends the existing Flutter, FastAPI and Supabase application. Only
Administrator and Educator have accounts. Children continue using adult-opened
scoped sessions. Existing lessons, grading, routes, and stored records are retained.

Backup branch: `backup/ai-integration-20261101`. The current uncommitted changes
were also captured before edits under `.preview/ai-backup-20261101/`: a binary Git
patch, untracked source archive, and manifest. The branch alone points to the
previous committed HEAD; the patch/archive preserve the pre-existing dirty work.

## Added and changed files

| Area | Files |
|---|---|
| Private inference | `services/inference/app/main.py`, `translation_runtime.py`, `reading.py`, inference `pyproject.toml` |
| Protected API | `services/api/app/ai_routes.py`, `ai_body_limit.py`, `main.py`, `models.py`, `security.py` |
| Training/model tools | `ml/scripts/bootstrap_pretrained.py`, `download_upstream.py`, `train_pair.py`, `training_worker.py`, `evaluate_package.py`; existing `train.py` now enables fp16 only with CUDA |
| Flutter | `reading_practice_page.dart`, `ai_management_page.dart`, `core/audio/reading_wav.dart`, `memory_audio*.dart`; existing translator, reader, API client, pronunciation service and workspace navigation |
| Android | Microphone permission in `AndroidManifest.xml`; memory-backed playback channel in `MainActivity.kt` |
| Database | `supabase/migrations/20261101050836_ai_integration.sql` |
| Tests | `services/api/tests/test_ai_workflows.py`, `ml/tests/test_ai_runtime.py`, `test_download_upstream.py`, `services/inference/tests/test_service_contract.py`, `apps/linguakids_app/test/ai_features_test.dart`; actual-page renderer `tool/render_ai_pages.dart` |
| Configuration | `.env.example`, Flutter pubspec/lock, `ml/requirements-training.txt`, `.gitignore`, `scripts/start_api.ps1` (scoped local restart) |
| Results | `docs/ai-baseline-smoke-review.md`, `docs/ai-baseline-smoke-results.json`, `docs/test-results.md` |

## Install

From the repository root, create a dedicated Python environment so existing global
packages are not replaced. The requirements use the existing project's pinned
versions; speech recognition and Marian tokenization are added to inference.

```powershell
python -m venv .tools/ai-venv
.tools/ai-venv/Scripts/python.exe -m pip install -r requirements.txt
.tools/ai-venv/Scripts/python.exe -m pip install -e services/inference
.tools/ai-venv/Scripts/python.exe -m pip install -r ml/requirements-training.txt
& .tools/ai-venv/Scripts/Activate.ps1
```

Activate this environment in each service/worker shell, or replace `python` in
the commands below with `.tools/ai-venv/Scripts/python.exe`. Installing packages
in a virtual environment and then launching a different system interpreter will
not use those packages. The training requirements explicitly pin PyArrow 21.0.0
to avoid incompatible older Arrow installations.

Install Flutter dependencies in `apps/linguakids_app` using the existing SDK:

```powershell
flutter pub get
```

`record` 7.1.2 is the only added direct Flutter dependency. Replay uses the existing
web package and an Android MediaDataSource rather than writing recordings to disk.
Android recording requires runtime microphone permission and Android API 23 or
newer. Production web recording requires HTTPS; browsers also permit localhost.

## Environment variables

Use the existing ignored `.env`; do not commit credentials or copy private values
into Flutter or a `--dart-define`. Required server variables:

| Variable | Use |
|---|---|
| `SUPABASE_URL` | Existing project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Token validation/scoped child RPCs |
| `SUPABASE_SECRET_KEY` | Worker only: claim/update training jobs; never sent to Flutter |
| `INFERENCE_BASE_URL` | Private service, normally `http://127.0.0.1:8001` |
| `INFERENCE_SHARED_SECRET` | Long random backend-to-inference credential |
| `MODEL_PACKAGE_PATH` | Initially mounted verified translation package |
| `MODEL_PACKAGE_ROOT` | Locally mounted immutable releases, indexed by model version |
| `TRAINING_BASE_PACKAGE_PATH` | Verified local Marian foundation pair for the worker; defaults to `services/inference/models/opus-baseline-v1` |
| `READING_MODEL_PATH` | Locally downloaded Faster-Whisper directory |
| `INFERENCE_CONCURRENCY` | Bounded CPU/GPU tasks, default 1 |
| `INFERENCE_TIMEOUT_SECONDS` | Translation timeout, default 18; recognition allows 60 seconds |
| `CORS_ORIGINS` | JSON list of approved Flutter web origins |

Paths are relative to the process working directory. Run commands below from the
repository root. `API_BASE_URL` supplied to Flutter is public configuration only.
Use `http://10.0.2.2:8010` on the Android emulator. A physical device needs the
developer computer's LAN address, a reachable local API binding, and an appropriate
debug-only network configuration or HTTPS. Keep Supabase/inference credentials on
the backend. Do not expose the inference or worker directly to device clients.

## Models and evaluation

Translation uses two upstream Apache-2.0 Marian checkpoints:

- [Helsinki-NLP/opus-mt-en-tl](https://huggingface.co/Helsinki-NLP/opus-mt-en-tl)
- [Helsinki-NLP/opus-mt-tl-en](https://huggingface.co/Helsinki-NLP/opus-mt-tl-en)

Application language codes remain `en` and `fil`. `tl` is used only at the model
boundary. The existing verified mT5 package format remains supported.

```powershell
python -m ml.scripts.bootstrap_pretrained --output services/inference/models/opus-baseline-v1 --reading-output services/inference/models/whisper-tiny
```

For Hub-transfer problems, add `--direct-download`. This streams from the same
allowlisted official repositories, pins the revision, and checks upstream sizes
and LFS SHA-256 values. Interrupted range transfers can reuse candidate bytes, but
the full official checksum must pass before an artifact is accepted. A corrupt
partial is discarded and must be downloaded again. Run only one downloader per
destination. Packages have per-file checksums. No remote model code runs.

```powershell
python -m ml.scripts.evaluate_package --package services/inference/models/opus-baseline-v1 --test-csv ml/data/classroom_smoke_test.csv --output ml/outputs/baseline-smoke.json
```

This produces real BLEU/chrF, latency and output samples in both directions.
The supplied 15 original classroom pairs are a **smoke test only**, not a
representative benchmark or a sufficient fine-tuning corpus. They do not establish
translation quality across Grades 1–6 or guarantee exclusion from upstream data.
Use a larger reviewed held-out corpus and qualified human review before deployment.
Never copy upstream published benchmark scores into this project's evaluation.
The actual local measurements and all 30 outputs are recorded in
[the baseline smoke-test review](ai-baseline-smoke-review.md). They are not
production approval or percentage accuracy.

Speech recognition uses [Faster-Whisper](https://github.com/SYSTRAN/faster-whisper)
with a multilingual `Systran/faster-whisper-tiny` checkpoint for CPU testing. Tiny
can miss words, especially in children's speech, noise or Filipino recordings.
Reading comparison reports recognized, missed, and extra words; it does not report
pronunciation accuracy. Advanced phoneme assessment is **not implemented**.

For a local private runtime check, point `MODEL_PACKAGE_PATH` in the ignored
`.env` to `services/inference/models/opus-baseline-v1` after preparing the package.
Public app translation still requires a reviewed active registry entry. The
private `/health` response reports translation `ready` and independent
`reading_ready` flags. Backend credentials are configured locally; no model
credential is included in either Flutter build.

## Database deployment

The owner approved `20261101050836_ai_integration.sql` and it was applied to the
existing Linguakids project (`jdtgakguokulcuirnzkw`). The applied file's SHA-256 is
`28e5382b5dde066a8a58c486670ac0bd221913299ba23545672a157c4f32781e`.
It adds three RLS-protected tables:

- `ai_translation_history`: opt-in, adult-owned text history.
- `ai_reading_attempts`: opt-in adult word counts; no audio/transcript/child identity.
- `ai_training_jobs`: frozen reviewed text, queue state, real worker progress,
  metrics, artifact metadata, and errors; administrator access only.

Existing workspace records remain the dataset metadata/review source. Existing
`model_versions` and `model_evaluations` remain the registry. Two existing model
foreign keys become nullable **only for explicitly marked upstream imports**, so
pretrained checkpoints do not require inventing a local training run or dataset.
The registration RPC requires pinned upstream provenance, measured evaluations
for both directions, and substantive review notes. Existing approval/activation/
rollback RPCs remain responsible for deployment permissions. The active-model RPC
also returns the manifest checksum to the trusted inference gateway.

No production rows are deleted, renamed or replaced. A service-role-only claim RPC
uses `FOR UPDATE SKIP LOCKED` and a worker lease; ordinary clients cannot update
progress, metrics, or run status.

Live catalog checks confirm RLS is enabled on all three tables, adult-owned
history/reading policies, and administrator-only job policies. Privilege checks
confirm anonymous users cannot read history or reading records; neither anonymous
nor authenticated clients can claim jobs; only the service role can claim them;
authenticated clients cannot update training progress/metrics. These are live
structural checks, not a completed two-account browser exercise. No production
fixtures or fabricated model records were created.

Security advisors report the four existing private default-deny table notices and
the existing [disabled leaked-password protection setting](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
This integration did not change Auth settings.

## Run services

```powershell
python -m uvicorn services.inference.app.main:app --host 127.0.0.1 --port 8001
python -m uvicorn services.api.app.main:app --host 127.0.0.1 --port 8010
scripts/start_training_worker.ps1 -CheckOnly
scripts/start_training_worker.ps1
```

Use the project's existing app launcher for connected Flutter. Run
`scripts/start_api.ps1 -Restart` to restart this project's local API after adding
routes. The private service must remain private in hosted
deployment. Use one bounded worker per intended training device. CPU fine-tuning
is supported but can be slow; CUDA enables fp16. No cloud GPU is provisioned or
charged by these commands.

The launcher checks the dedicated Python environment, both local foundation
models and their checksums, the backend credential, queue access and published
dataset candidates before claiming a job. A failed check stops with an actionable
reason. `-CheckOnly` never claims or starts a job. `-Once` processes at most one
queued job. Set the private worker credential in the ignored `.env`, never in
Flutter or chat. The Python worker can also be run directly with
`python -m ml.scripts.training_worker` in the configured environment.

Use `scripts/start_training_worker.ps1 -Background` to leave the worker running
while using the admin page. The launcher records its process ID and local logs in
`.preview/`, reuses an already running project worker, and passes no key on the
command line. Modern `sb_secret_` keys travel only on the `apikey` header;
`Authorization: Bearer` remains reserved for user/legacy JWTs, following the
[official key guidance](https://supabase.com/docs/guides/getting-started/api-keys#known-limitations).
Queue snapshots retain attribution and development/classroom review scope in the
trained package's frozen dataset manifest.

Public development input is documented in
[the dataset README](../ml/data/public/README.md). The attributed CSVs and
reproduction scripts are in the repository; model weights and raw downloads are
ignored. A small local pilot can run without the live worker credential, using
the commands in [the training README](../ml/README.md). It does not approve the
dataset, create a completed queue record, or activate a production model.

For an optional GPU worker, use a machine you control, install a matching CUDA
PyTorch build using the [official installation selector](https://pytorch.org/get-started/locally/),
then run the same worker with its backend-only environment and persistent output
directory. The web/API process never starts or purchases a GPU instance.

## Administrator workflow

1. Open **Translation Datasets**; import CSV, review duplicates/conflicts and
   provenance, and approve a sufficiently large dataset. Never include child audio.
2. Open **AI Management**. Select the approved dataset and press **Start Training**.
   This queues a frozen dataset; it does not launch training in a web request.
3. Start the separate worker. Refresh the job status to inspect actual trainer
   steps, epochs, loss and evaluation results. Queued jobs have no fabricated progress.
4. Worker outputs are under `ml/outputs/jobs/<job-id>/`, including a private log,
   immutable package, held-out CSV, evaluation JSON and human-review samples.
5. Host/mount the artifact, import its actual manifest and evaluation report in
   **Model Registry**, review samples, approve, then activate. For an upstream
   baseline use **Register evaluated pretrained model** in AI Management; it does
   not create a fake local training run.
6. Mount each approved package under `MODEL_PACKAGE_ROOT/<model-version>/`.
   Version changes reload only verified local artifacts; no arbitrary artifact URL
   is fetched by inference. Existing rollback selects the previous version.

Jobs default to the two reviewed OPUS-MT checkpoints. Training/evaluation is real
Python code, not a UI simulation. A completed run still requires human review and
artifact deployment. Stale worker leases fail visibly instead of showing success.

## Educator and child workflows

- Translator retains the existing screen and endpoint. **Save my translation
  history** is optional and off by default. History is scoped to the adult account.
- **Reading Practice** records at most 30 seconds of mono PCM16, 16 kHz audio,
  supports replay/retry/listen-again, and displays supportive recognition feedback.
- **Practice reading** in lesson/story readers opens the same activity with that
  page's bilingual text. Child requests use the scoped session token, not an adult
  JWT. Child recordings/transcripts are never persisted by these endpoints.
- Recording only starts after an explicit button press and microphone permission.
  The API bounds uploads before multipart parsing; invalid WAV formats are rejected.

## API and test commands

New authenticated endpoints: `GET /v1/ai/history`, `GET /v1/ai/jobs`,
`POST /v1/ai/jobs`, `POST /v1/ai/reading`. Scoped child endpoint:
`POST /v1/ai/student-reading`. Audio uses multipart `audio`, `expected_text`,
`language`; child requests add `student_token`. `save_attempt=true` is adult-only
and stores counts. The existing `/v1/translation` adds optional `save_history`.

```powershell
python -m pytest tests -q  # run in services/api
$env:PYTHONPATH = "$PWD;$PWD/ml"
python -m pytest ml/tests -q  # run at repository root
flutter test --no-pub  # run in apps/linguakids_app
flutter build web --no-pub
flutter build apk --debug --no-pub
```

Actual run results and remaining hardware/model checks are recorded separately in
`docs/test-results.md`. Do not infer a completed fine-tuning run, live RLS success,
usable translation model or successful microphone recording merely from unit tests.

## Current completion limits

Translation and speech packages have been downloaded, checksum-verified and
executed on CPU. Reading practice, optional history/counts, the administrator job
queue, dataset review links and model-management integration are implemented.
The approved schema is live. No new account role was introduced.

The pretrained package has not been registered or activated in the production
registry. Classroom deployment still needs a larger reviewed evaluation corpus,
educator review, an artifact URI and a reachable private inference host configured
for that deployment. The connected translator deliberately reports unavailable
until an approved model is active and mounted.

A real local development fine-tuning run completed on 2026-11-02: one CPU epoch
per direction on 192 attributed Tatoeba pairs, with separate 154/19/19 splits.
The model and real checkpoints are saved locally. See
[the measured pilot results and sample review](ai-development-pilot-review.md).
Despite higher scores on 19 test pairs, preliminary output review found severe
mistranslations. This candidate is not approved for classroom deployment.

The private worker credential has now been validated, the attributed development
dataset is available for training in the administrator workspace, and the worker
has completed a real live queue job. See
[verified live training results](ai-live-training-review.md). This completes
development queue/worker execution, not classroom quality approval. The candidate
still has severe mistranslations and remains outside production activation.

Physical microphone/replay, Android compilation and native Filipino speech/TTS
checks remain pending: there is no Android SDK/device here and only an English
system voice is installed. Advanced phoneme-level pronunciation assessment remains
unimplemented; speech word matching is explicitly reading recognition.
