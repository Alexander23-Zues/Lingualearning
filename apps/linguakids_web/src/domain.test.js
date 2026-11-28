import { describe, it, expect } from "vitest";
import {
  canVisit,
  csvText,
  latestQuizAttempts,
  parseCsv,
  parsePairs,
  progressSummary,
  gradebookMatrix,
  worksheetHtml,
  validatePairs,
} from "./domain";
import { encodeWav } from "./tools";
describe("Data boundaries and exports", () => {
  it("keeps absent work distinct from zero and uses frozen results for historical quizzes", () => {
    const children = [
      { id: "one", nickname: "Sam", grade_level: 1, adult_id: "teacher" },
      { id: "two", nickname: "Sam", grade_level: 1, adult_id: "teacher" },
      { id: "three", grade_level: 2 },
    ];
    const m = {
        id: "quiz",
        kind: "quiz",
        grade_level: 1,
        title: "Current title",
        status: "published",
      },
      attempt = {
        child_id: "one",
        material_id: "quiz",
        material_title: "Original title",
        activity_kind: "quiz",
        grade_level: 1,
        correct_count: 0,
        total_count: 4,
        material_version: 1,
      };
    const result = gradebookMatrix(
      { materials: [m], attempts: [attempt] },
      children,
    );
    expect(result.rows[0].cells[0].text).toBe("0/4");
    expect(result.rows[0].cells[0].attempt.material_title).toBe(
      "Original title",
    );
    expect(result.rows[1].cells[0].text).toBe("No attempt");
    expect(result.rows[2].cells[0].text).toBe("Not assigned");
  });
  it("exports a printable worksheet without answer keys or executable content", () => {
    const html = worksheetHtml({
      title: "<script>bad()</script>",
      grade_level: 1,
      body: {
        questions: [
          {
            prompt: "What is a book?",
            correct_option_id: "private-answer",
            options: [{ text: '<img onerror="bad()">' }],
          },
        ],
      },
    });
    expect(html).not.toContain("private-answer");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
  it("separates administrator tools from educator teaching routes", () => {
    expect(canVisit({ role: "educator" }, "ai")).toBe(false);
    expect(canVisit({ role: "administrator" }, "students")).toBe(false);
    expect(canVisit({ role: "administrator" }, "ai")).toBe(true);
    expect(canVisit({ role: "educator" }, "students")).toBe(true);
  });
  it("imports quoted bilingual CSV, skips repeated pairs, and identifies conflicts by pair number", () => {
    expect(
      parseCsv(
        'english,filipino\n"Hello, friend","Kumusta, kaibigan"\n"A ""book""",aklat\n"HELLO,  FRIEND","kumusta, kaibigan"',
      ),
    ).toEqual([
      { en: "Hello, friend", fil: "Kumusta, kaibigan" },
      { en: 'A "book"', fil: "aklat" },
    ]);
    expect(() =>
      validatePairs([
        { en: "Book", fil: "aklat" },
        { en: " book ", fil: "basa" },
      ]),
    ).toThrow(/Pairs 1 and 2.*different Filipino translations/);
    expect(() => parsePairs("book")).toThrow(/English/);
    expect(() => parseCsv("wrong,fields\na,b")).toThrow(/headers/);
  });
  it("escapes formulas and preserves quotes/newlines in CSV exports", () => {
    const text = csvText([
      ["=SUM(A1)", "+command", "@x", 'Sam, "A"', "line\nbreak", 0],
    ]);
    expect(text).toContain("'=SUM(A1)");
    expect(text).toContain("'+command");
    expect(text).toContain('Sam, ""A""');
    expect(text).toContain('"0"');
  });
  it("keeps true zero scores and separates same-name student identities", () => {
    const attempts = [
      {
        child_id: "one",
        material_id: "quiz",
        activity_kind: "quiz",
        correct_count: 4,
        total_count: 4,
        completed_at: "2026-01-01",
      },
      {
        child_id: "one",
        material_id: "quiz",
        activity_kind: "quiz",
        correct_count: 0,
        total_count: 4,
        completed_at: "2026-01-02",
      },
      {
        child_id: "two",
        material_id: "quiz",
        activity_kind: "quiz",
        correct_count: 2,
        total_count: 4,
        completed_at: "2026-01-01",
      },
    ];
    const latest = latestQuizAttempts(attempts);
    expect(latest).toHaveLength(2);
    expect(latest.find((a) => a.child_id === "one").correct_count).toBe(0);
    expect(progressSummary({ attempts, children: [] }).score).toBe(25);
    expect(progressSummary({ attempts: [], children: [] }).score).toBe(null);
  });
  it("encodes private reading audio as bounded mono PCM16 at 16 kHz", async () => {
    const blob = encodeWav([new Float32Array([0, 1, -1, 0.5])], 32000);
    const reader = new FileReader();
    const buffer = await new Promise((resolve) => {
      reader.onload = () => resolve(reader.result);
      reader.readAsArrayBuffer(blob);
    });
    const view = new DataView(buffer);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(4);
  });
});
