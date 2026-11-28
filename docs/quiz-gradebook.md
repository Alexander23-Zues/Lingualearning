# Student quiz gradebook

Open **Reports & Gradebook** in the educator or administrator workspace. Student Submissions also opens this page. Select Grade 1–6, search a student nickname, or choose one quiz.

## Recording and reading grades

- Quizzes have a permanent number within their grade: **Quiz #1 — quiz title**, **Quiz #2 — quiz title**, and so on. A new quiz receives the next number automatically when saved. Editing its name keeps its number. Moving it to another grade assigns the next number in that grade.
- Each submitted quiz records the child profile ID, quiz ID, correct answers, total questions, completion time, material version, and the quiz number/title/grade at submission. The server grades answers using its private key and supplies the saved labels.
- The table has one student per row and one quiz per column. It shows the **latest submitted attempt**, its raw score and percentage, and the attempt count. Tap a score to see every attempt, its date and saved name, plus the latest and best percentages. Retaking a quiz retains earlier results.
- **Not taken** means no recorded submission. **Not assigned** means the current quiz is not available to that student. Neither is a zero. A real `0/6` result contributes `0%` to averages.
- Percentage is `correct answers / total questions × 100`. Student averages equally average the recorded quiz percentages; the class metric averages the latest recorded student/quiz percentages under the selected filters. These are raw quiz percentages, not an official transmuted grade or pass/fail decision.
- **Quiz attempt history** lists individual submissions. **All activity records** retains the lesson, story, game and other activity history.
- **Copy gradebook CSV** copies the filtered latest-score table. **Copy quiz attempts CSV** copies the filtered complete quiz history, including IDs, raw scores, versions and UTC timestamps. Paste into a spreadsheet. CSV fields are quoted and formula prefixes neutralized.

## Student flow

Create or select a child profile, choose **Start learning**, open **Quizzes**, choose a numbered quiz and submit the answers. The result also appears in the student's **My progress** page. Return using **Adult controls**; the adult workspace reloads its records. **Refresh records** retrieves results submitted on another device.

Alternatively, in **Quiz and Worksheet Builder**, press **Start quiz for a student** on the desired quiz. Choose the child from the eligible active profiles for that grade. This opens that exact quiz in locked student mode. The quiz identifies the selected child, and successful submission confirms **Result recorded for [nickname]**. The student's quiz list also displays the latest recorded score.

Offline submissions remain pending until synchronized successfully. They are not presented as server-recorded grades. Adult grade records require an online connection. The connected app saves results in Supabase.

The standalone local preview saves demo profiles, quiz results and material edits in this browser, at the same address. Reloading or reopening the page retains them; **Refresh records** also reloads saved demo data from another preview tab at that address. Clearing site data removes this local copy. Demo results are separate from connected Supabase records. Child session tokens and adult credentials are not part of the saved preview workspace.

Each new demo result has a separate durable storage entry. Simultaneous quiz submissions in different tabs cannot overwrite each other's grades through an older workspace snapshot. Existing saved workspace results are merged by attempt ID when loading, so earlier preview history is retained without duplicate results.

Quizzes opened from an adult library are marked **Teacher preview — results are not recorded**. They have no selected child and cannot create a student grade. Use **Open child profiles → Start learning → Quizzes** for a recorded attempt, answer all questions and press **Check answers**. A completed attempt displays **Wonderful work!** with the saved score. Selecting answers without that final submission does not record a grade.

## History and access

`20261026010711_quiz_gradebook.sql` adds grade-specific quiz numbers and insert-time result metadata. Existing results are not rewritten. An older result without a saved label uses the available material metadata; its historical name cannot be reconstructed. A stale material version must be reopened before a new submission is accepted.

Existing access rules continue to apply: educators see their authorized students, administrators use their authorized workspace, and student sessions only see their own progress. The feature collects no additional child identity fields. Nicknames are labels; distinct profile IDs keep students with the same nickname separate.

Database regression checks live in `supabase/tests/quiz_gradebook.test.sql`. They use rollback-only test fixtures and leave no student grades or fixture accounts behind.
