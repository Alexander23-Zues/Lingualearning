import { uiText, useUiLanguage } from "./i18n";
export function AnimalScene({ scene = 0, label = "Colorful animal friends" }) {
  useUiLanguage();
  const cell = Math.max(0, Math.min(15, Number(scene) || 0));
  return (
    <svg
      className="animal-scene"
      viewBox={`${cell % 4} ${Math.floor(cell / 4)} 1 1`}
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label={label}
    >
      <image
        href="/assets/animal-story-atlas.png"
        x="0"
        y="0"
        width="4"
        height="4"
      />
    </svg>
  );
}
export const cartoonFriends = [
  ["lesson", "Finn", "Lessons", 0],
  ["dictionary", "Luna", "Dictionary", 1],
  ["translator", "Milo", "Translator", 2],
  ["game", "Pippa", "Games", 3],
  ["quiz", "Koko", "Quizzes", 4],
  ["story", "Pip", "Stories", 5],
  ["saved", "Ellie", "My words", 6],
  ["progress", "Tali", "My progress", 7],
  ["downloads", "Otti", "Saved learning", 8],
];
export function FriendArt({ cell, name }) {
  useUiLanguage();
  const edges = [0, 418, 810, 1254],
    column = cell % 3,
    row = Math.floor(cell / 3);
  return (
    <svg
      className="friend-art"
      viewBox={`${column * 418} ${edges[row]} 418 ${edges[row + 1] - edges[row]}`}
      role="img"
      aria-label={uiText("{0} the learning friend", [name])}
    >
      <image
        href="/assets/student-cartoon-friends-v1.png"
        width="1254"
        height="1254"
      />
    </svg>
  );
}
export const sectionArt = {
  insights: [
    7,
    "Every little step deserves a cheer.",
    "See what your learners have practiced and plan what comes next.",
  ],
  lessons: [
    0,
    "Little words. Big possibilities.",
    "English and Filipino lessons for every stage of the journey.",
  ],
  plans: [
    6,
    "A little preparation. A world of discovery.",
    "Build a teaching sequence that brings your classroom together.",
  ],
  dictionary: [
    1,
    "One word opens a new world.",
    "Listen, discover, and practice English–Filipino vocabulary.",
  ],
  translator: [
    8,
    "Two languages. More ways to connect.",
    "Use a reviewed model to explore a new way to say it.",
  ],
  reading: [
    10,
    "Find your reading voice.",
    "A little practice builds a little more confidence.",
  ],
  activities: [
    12,
    "Play, practice, and grow.",
    "Match words and make room for a joyful discovery.",
  ],
  stories: [
    3,
    "There is a story waiting for you.",
    "Open an illustrated adventure in English and Filipino.",
  ],
  quizzes: [
    4,
    "Small wins are worth celebrating.",
    "Build questions, print worksheets, and follow real student progress.",
  ],
  sessions: [
    9,
    "Learning is better together.",
    "Keep your classroom materials and session records in one place.",
  ],
  students: [
    5,
    "Every learner has a story.",
    "Welcome students through simple profiles you create and guide.",
  ],
  resources: [
    2,
    "Your ideas belong here.",
    "Create, organize, and review materials for your classroom.",
  ],
  downloads: [
    11,
    "Keep your discoveries close.",
    "Save learning content for later and manage your downloads.",
  ],
  reports: [
    7,
    "Every result has a story.",
    "Look at the latest scores and preserve each learning attempt.",
  ],
  educators: [
    5,
    "A community of curious minds.",
    "Support educators and manage their access.",
  ],
  curriculum: [
    6,
    "Give each lesson a direction.",
    "Use verified references and document your curriculum mapping.",
  ],
  datasets: [
    1,
    "Thoughtful data, thoughtful learning.",
    "Review bilingual pairs, their sources, and usage rights.",
  ],
  training: [
    9,
    "Prepare the next discovery.",
    "Build documented training packages from approved data.",
  ],
  models: [
    8,
    "Review before release.",
    "Measured results and human review guide each model.",
  ],
  announcements: [
    13,
    "Keep your classroom connected.",
    "Share updates with your teaching community.",
  ],
  ai: [
    14,
    "Tools that support your teaching.",
    "Monitor real training jobs and review their measured results.",
  ],
  audit: [
    15,
    "A clear record of your community.",
    "Follow account and content activity in the audit log.",
  ],
  settings: [
    2,
    "Make yourself at home.",
    "Choose the reading and accessibility settings that suit you.",
  ],
};
export function SectionBanner({ section }) {
  useUiLanguage();
  const item = sectionArt[section];
  if (!item) return null;
  return (
    <section className="section-banner">
      <div>
        <strong>{item[1]}</strong>
        <p>{item[2]}</p>
      </div>
      <AnimalScene
        scene={item[0]}
        label={uiText("LinguaKids illustration for {0}", [section])}
      />
    </section>
  );
}
