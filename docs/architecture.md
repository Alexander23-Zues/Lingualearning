# Architecture

## Boundaries

- Flutter uses the Supabase publishable key for authentication and RLS-protected reads/writes. It never receives privileged credentials.
- FastAPI validates each Supabase access token, loads the protected profile, denies suspended accounts, derives ownership from the token, and applies role dependencies.
- Supabase PostgreSQL is the authorization source of truth. RLS protects direct client access; server checks protect privileged service-key operations.
- SQLite stores versioned downloaded teaching resources and unique queued class-session events on Android.
- The inference service is private, separately configured, authenticated with a shared service credential, and loads one approved model per worker.
- Training runs only on a suitable external GPU machine using approved immutable snapshots.

## Roles and classroom privacy

Only `administrator` and `educator` are authenticated adult account roles. Public signup is always an educator. Students use adult-created `child_profiles` with a nickname, preset avatar, grade, learning level, and constrained preferences. There is no child email account or child PIN. Adult-owned child profiles, random scoped learning sessions, private quiz answer keys, and server-derived learning attempts provide individual progress without child contact information.

Adult workspace mutations use authenticated invoker RPCs backed by private implementations that derive identity from `auth.uid()` and check the current account status. Student RPCs accept a scoped learning token rather than an adult JWT or a caller-selected child ID. Adult routes are locked during student mode, including after a reload. Leaving student mode requires adult verification, and closes the student capability token.

Cross-platform content downloads use per-profile local cache keys. Adult caches are scoped to the account ID, and child queues store answers and idempotency IDs without session tokens or fabricated stars. The original Android SQLite foundations remain available for device-specific resource synchronization.

## Translation request flow

1. Educator submits at most 300 characters to FastAPI.
2. FastAPI confirms an active account and reads the atomically active model registry row.
3. FastAPI calls the private inference worker with a service credential and timeout.
4. The worker validates model version, applies an explicit direction prefix, and returns generated text.
5. Neither service logs raw input. The UI marks every result as requiring educator review.
