# Grade pathways and account fixes

The new original supplemental collection adds **54 distinct activities**: 18 lessons, 18 quizzes, and 18 games. Every grade gets three linked topic sets. Each lesson has four English–Filipino pages, each quiz has six A–D questions, and each game matches four lesson terms. Existing stories and other content remain available.

| Grade | Topics |
| --- | --- |
| 1 | Animal nouns; garden colors; polite expressions |
| 2 | Action words; position words; complete sentences |
| 3 | Adjectives; singular/plural nouns; event sequence |
| 4 | Verb tense; cause and effect; comparison |
| 5 | Main idea; context clues; evidence-based inference |
| 6 | Fact and opinion; claims and reasons; figurative language |

These are original enrichment activities, not a claim of official curriculum certification. Vocabulary questions and word games reinforce the lesson terms; the last two quiz questions apply the topic.

Adults can browse all six grades with the Grade filter. Children receive the grade selected on their adult-created profile. Quiz answer keys remain in the private answer table; the public asset has no answer keys.

## Real accounts

- **Connected login:** <http://localhost:3000/#/login>
- **Educator registration:** <http://localhost:3000/#/register>
- **Invited administrator setup:** <http://localhost:3000/#/admin-setup>
- **Independent demo:** <http://127.0.0.1:8080/>

The demo does not authenticate real accounts. Its existing header buttons, **Log in** and **Educator registration**, now open the connected account pages directly. The extra preview-bar account button and repeated hero account buttons were removed so the landing page has only one account navigation pair. Old demo account URLs still offer links to the connected app. Its launcher also starts the connected server when configured. It never forwards typed credentials between origins.

The previous router was rebuilt with an initial location whenever the account state changed. Keeping one router and refreshing its access decisions preserves the current form and entered text on login or registration errors. The revised forms include password visibility, keyboard submission, email validation, specific account error messages, confirmation-email resend, and reset-email feedback. Registration success uses an inline confirmation page, avoiding a dialog left open after navigation.

Signup and email authentication were enabled in the live project; email confirmation was required. There were zero real accounts when inspected. The owner must choose an account password, complete registration, and verify the received email before the first real login. The database password does not create an app login. No owner password was chosen or email sent by this repair.

Recovery emails return to the configured site URL, avoiding an unsupported path in the hash-routed app. The app captures password-recovery events during startup, including PKCE exchanges, and routes the signed-in recovery session to the new-password form.

## Verification

The live rollback-based test `supabase/tests/grade_pathways.test.sql` delivered and graded all 54 activities, checked grade isolation and private answer keys, and confirmed public registration cannot choose an administrator role. Its temporary accounts and progress were rolled back.

App regression tests exercise failed login and retry, successful navigation, failed and successful registration, email feedback, recovery routing, preview account links, phone layout, lesson pagination, all six grade collections, and the installed Supabase SDK's requests. Real inbox delivery and the owner's first verified login require the owner's registration and mailbox access.
