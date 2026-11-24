import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { OfflineLibrary } from "./offline-library";
import library from "../public/offline-library.json";

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});

it("ships public practice across all grades and opens lessons, stories, games and the bilingual dictionary without an account", async () => {
  expect(library.materials).toHaveLength(144);
  for (const grade of [1, 2, 3, 4, 5, 6]) {
    const materials = library.materials.filter(material => material.grade_level === grade);
    expect(new Set(materials.map(material => material.kind))).toEqual(new Set(["lesson", "story", "game"]));
    expect(materials.filter(material => material.body.collection === "word-garden-classroom-v1")).toHaveLength(4);
    expect(materials.every(material => material.status === "published" && !material.owner_id && !material.body.questions)).toBe(true);
  }
  const fetch = vi.fn(async () => ({ ok: true, json: async () => library }));
  vi.stubGlobal("fetch", fetch);
  try {
    render(<OfflineLibrary />);
    fireEvent.change(screen.getByRole("combobox", { name: "Grade", exact: true }), { target: { value: "1" } });
    for (const [kind, category, control] of [["lesson", "Lessons", "Read"], ["story", "Stories", "Read"], ["game", "Games", "Play"]]) {
      const material = library.materials.find(item => item.kind === kind);
      fireEvent.click(screen.getByRole("button", { name: category, exact: true }));
      const title = await screen.findByRole("heading", { name: material.title, exact: true });
      fireEvent.click(within(title.closest("article")).getByRole("button", { name: control }));
      const reader = screen.getByRole("dialog");
      expect(within(reader).getByRole("button", { name: "Finish practice" })).toBeTruthy();
      expect(within(reader).queryAllByRole("button", { name: /^Listen/ })).toHaveLength(0);
      fireEvent.click(within(reader).getAllByRole("button", { name: "Close", exact: true })[0]);
    }
    fireEvent.click(screen.getByRole("button", { name: "Dictionary", exact: true }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search dictionary" }), { target: { value: "pusa" } });
    expect(screen.getAllByText("pusa").length).toBeGreaterThan(0);
    expect(screen.getByText("cat")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Quizzes", exact: true })).toBeNull();
    expect(fetch.mock.calls.map(([url]) => url)).toEqual(["/offline-library.json"]);
  } finally { vi.unstubAllGlobals(); }
});
