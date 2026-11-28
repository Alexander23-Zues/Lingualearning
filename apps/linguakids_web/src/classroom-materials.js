export const wordGardenCollection = "word-garden-classroom-v1";

export const classroomSentences = {
  1: { en: "The cat sits by the door.", fil: "Nakaupo ang pusa sa tabi ng pinto." },
  2: { en: "I bring a pencil and an eraser to school.", fil: "Nagdadala ako ng lapis at pambura sa paaralan." },
  3: { en: "Bea helped her friend gather the scattered papers.", fil: "Tinulungan ni Bea ang kaibigan niyang tipunin ang nagkalat na papel." },
  4: { en: "The reading corner has a low shelf where pupils can reach the books.", fil: "May mababang estante ang sulok-basa kaya abot ng mga mag-aaral ang mga aklat." },
  5: { en: "The group moved the seedlings because the tray had cracked.", fil: "Inilipat ng pangkat ang mga punla dahil nabiyak ang lalagyan." },
  6: { en: "Neri took an umbrella because the dark clouds suggested rain.", fil: "Nagdala ng payong si Neri dahil tila uulan batay sa maiitim na ulap." },
};

export function classroomMaterials(materials, grade) {
  const published = materials.filter(
    (material) => material.status === "published" && (!grade || material.grade_level === grade),
  );
  const recommended = [];
  for (const level of grade ? [grade] : [1, 2, 3, 4, 5, 6]) {
    const matching = published.filter((material) => material.grade_level === level);
    const lessons = matching.filter((material) => material.body?.collection === "deped-topic-lessons-v1");
    const english = lessons.find((material) => material.curriculum?.learning_area === "English");
    const filipino = lessons.find((material) => material.curriculum?.learning_area === "Filipino");
    const quiz = matching.find((material) => material.kind === "quiz" && material.quiz_number);
    const games = matching.filter((material) => material.body?.collection === wordGardenCollection);
    recommended.push(...[english, filipino, quiz, ...games].filter(Boolean));
  }
  return recommended;
}
