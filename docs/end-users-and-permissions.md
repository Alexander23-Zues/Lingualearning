# End users and permissions

### A. Elementary Student

Students use child profiles created by an authorized adult.

They can:

- Study lessons.
- Search the dictionary.
- Translate using the active trained model.
- Play learning games.
- Complete quizzes.
- Read illustrated stories.
- Practice saved vocabulary.
- Earn stars and badges.
- View their own progress.
- Use downloaded learning content offline.

Collect only a nickname, preset avatar, grade, learning level, and preferences.

Do not require children to provide an email, exact birth date, address, phone number, or photograph.

## Implemented access boundaries

| User | Access |
|---|---|
| Administrator | Manage adult educator status, review/publish teaching materials, maintain curriculum sources and datasets, prepare training manifests, activate already approved trained models, view reports and append-only audit logs, and manage authorized child profiles. |
| Educator | Create private drafts and classroom-ready materials, prepare teaching plans, record sessions, create/manage their own child profiles, and view their own students' progress. Public publication requires administrator review. |
| Elementary student | Use the scoped learning session opened by their authorized adult. The session selects the child identity; children cannot request another child's progress or use adult workspace endpoints. |

Child profile forms and the API reject extra identity fields. Avatars come from six
presets. Preferences allow only content language, sound, and reduced motion.
Child session tokens are random, hashed in the private database, expire after two
hours, and are revoked when adult controls are reopened or the profile is archived.
The child's HTTP client never attaches the adult's account JWT.

Quiz answer keys stay in a private table. The server grades submitted answers,
awards stars, deduplicates submission retries, and prevents repeated practice of
the same material version from farming stars. Stars/badges and progress are derived
from that child's recorded learning activity. Progress is append-only.

Downloaded material is saved per child profile on the device. Offline practice
queues answers without the learning token or a client-provided score; it earns no
stars until checked after reconnection. The adult must open the profile before
offline use; a fresh app launch requires adult verification before adult controls
or a new learning session can be opened.

The original starter collection contains 30 supplemental materials across Grades
1–6. It is not represented as official curriculum coverage. Additional content can
be authored in the workspace. Real translation requires an approved trained model
and running inference service; the application shows its absence accurately.
