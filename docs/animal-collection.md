# Animal adventures collection

The expanded learning shelves contain four original ten-page bilingual storybooks:

- **Finn and the Friendship Picnic** — an orange fox, a turtle, and a rabbit learn to wait, share, and help one another.
- **Ollie's Sparkling Ocean** — an octopus, a dolphin, and a sea turtle care for their coral reef.
- **Milo and the Little Seed** — a rabbit, a hedgehog, and a frog learn patience while growing a garden.
- **Luna's Moonlight Library** — an owl, a kitten, and a squirrel help a little bird and share a warm story.

Each book has a colorful cover with its title inside the book design, ten English–Filipino pages, original animal illustrations, read-aloud controls, progress, and large Back/Next buttons. Four scenes are used across each story's ten pages.

Four six-question quiz packs cover animal words, nature and colors, kind choices, and story comprehension. Each question has exactly four distinct A–D answer buttons. Children answer one question at a time, can go back to change an answer, and submit only after all questions are answered. Correct choices rotate between A, B, C, and D. Quiz keys are private in the connected database.

Four matching games cover pets, ocean words, garden words, and moonlight vocabulary. Every game has four bilingual pairs with large answer buttons, gentle retry feedback, no timer, and a next-match button unlocked by the correct pair.

The same introductory collection is made available in each of Grades 1–6. This is original supplemental practice, not differentiated complete curriculum coverage. There are 72 grade-specific records (24 books, 24 quiz packs, and 24 games), representing four unique books, 24 unique quiz questions, and 16 unique word pairs.

The additive Supabase migration preserves all previous material records, publication states, and progress. Updated shelves prefer the expanded collection over the three original sample cards. Private educator materials are unchanged. Installation creates an audit event.

The public content asset contains no quiz answer keys. Preview-only answer keys are imported exclusively by `main_preview.dart` through its in-memory repository. The production app still receives scores and stars from the server; it does not calculate its own awarded stars.

The artwork is saved at `apps/linguakids_app/assets/images/animal-story-atlas.png`; generation details are in `docs/animal-art-prompt.md`. The original source was produced with the built-in image-generation tool and displayed by source regions in Flutter without editing the original sheet.
