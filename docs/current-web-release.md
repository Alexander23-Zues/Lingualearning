# Current LinguaKids web/PWA release

The current application is `apps/linguakids_web` (React). The earlier Flutter
client remains in the repository for history. Use the root Dockerfile for the
existing Railway service; it includes the protected API and private inference.

Teachers register directly for one available grade and confirm their own email.
Administrator approval and invitation codes are not required. Existing school
records are retained; new registrations do not automatically inherit a prior
teacher classroom. See `docs/teacher-registration.txt`.

Teacher pages provide mission progress, latest/best quiz attempts, English
assessment evidence and teacher-confirmed starting missions. Children follow
the assigned sequence and need 80% on each quiz. Recognition compares heard
words; it is not validated pronunciation grading. Mother Tongue assessments
do not automatically determine English placement.

Mission completion awards one badge per learner, grade and mission. Class
rankings display aliases and order completed missions first, then assigned
completion percentage; equal results share a rank. Skipped missions and
unverified answers earn no badge. Offline awards remain pending independent
cloud verification. Grade and real/demonstration classroom scopes are separate.

Recordings collected on the prepared laptop can be backed up, transferred
privately, played by their own teacher, and checked online against the exact
current English story part. Exported scores and reading flags are not trusted.
Transfer the same archive again to continue safely without duplicate attempts.

Online student handoff clears the adult sign-in from that browser. Returning
requires teacher verification. The laptop collection server enforces its own
adult lock. Prepare a grade-approved account online before taking its laptop
offline. Its SQLite database and audio are never placed in this repository.
Cloud quizzes without local marking keys stay pending online scoring; they
do not award an invented grade or unlock the next mission offline.

Build checks:

```
npm ci --prefix apps/linguakids_web
npm test --prefix apps/linguakids_web -- --maxWorkers=1 --exclude 'src/live-*'
python scripts/build_react.py --preview
python -m pytest tests/test_offline_collection.py tests/test_offline_restore.py tests/test_mission_placement.py tests/test_adventure_collection.py tests/test_mission_rewards.py
```

Run the API suite from the `services/api` directory:

```
python -m pytest tests
```

Deploy only this reviewed source. Preserve the existing `/data` volume and
server-side variables. The Docker build downloads pinned baseline translation,
Whisper, and noncommercial school voices. It does not activate a training run,
reset data, or apply SQL migrations. The 30 canonical migrations match the hosted
history as of this release. See `deploy/README.md` for runtime configuration.

Remaining release gates: verify actual confirmation/reset email delivery after
correcting Gmail SMTP; teacher-labeled English speech/content evaluation; real
Android/iPhone/tablet microphone, PWA and classroom-load tests; managed backup
restore drill and the Auth leaked-password-protection setting.
