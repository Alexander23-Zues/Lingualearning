# Connected administrator setup

Double-click `Set Up Admin Account.cmd` to open the connected app at
http://localhost:3000/#/admin-setup. Enter your name and a new account password,
then verify the email sent by Supabase. Log in with that email and password.
`Open LinguaKids App.cmd` opens the connected app again later.

The administrator email is provisioned in a private database invitation. Only the
authenticated owner of that verified email can claim the invitation. Signup
metadata always creates an educator profile; the separate claim function activates
the invited first administrator, consumes the invitation, and writes an audit event
in one transaction. Both setup paths use the same transaction lock. The invitation
expires seven days after provisioning and cannot replace an existing administrator.

The app uses only the project's publishable key. The public client configuration
is in `.preview/live-config.json`; the database password and a Supabase secret key
are not stored there or embedded in Flutter. The local server listens only on
127.0.0.1, on port 3000. Open it through `localhost` so the email confirmation
callback uses the same browser origin and can recover its verification state.
Port 8080 remains the independent visual preview.

## Audit coverage

The administrator's **Audit Logs** destination reads the latest 200 database events,
supports searching and refreshing, and shows actor, local time, action, affected
record, and details. Database policies restrict reads to active administrators.
Client insert/update/delete privileges are revoked; a trigger rejects updates and
deletes even through the server role.

Events cover setup preparation, first administrator creation, application session
start/end, educator status changes through the existing server workflow, and model
activation/rollback through that workflow. Application session events are not a
replacement for Supabase Auth's authoritative login and failed-login logs.
Other placeholder feature screens are not represented as fully audited workflows.

The live database has the initial schema, access rules, and admin/audit migration.
The separate legacy PIN-roster migration was not deployed. The user's subsequent
student-profile request is implemented by the learning workspace and session
hardening migrations, using minimal profiles without child PINs.

The privileged Python workflows still need their own server-only configuration.
Login, verified administrator setup, and audit viewing operate directly through
Supabase's user session and RLS; they do not require a secret key in the client.
