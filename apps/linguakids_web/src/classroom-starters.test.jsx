import { beforeEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import App from "./App";
import { createPreviewRepository } from "./preview";
import { wordGardenCollection } from "./classroom-materials";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});

async function mount(page, prepare) {
  const repository = createPreviewRepository();
  await repository.enterPreview("educator");
  if (prepare) await prepare(repository);
  window.history.replaceState(null, "", `/#/workspace/${page}`);
  render(<App repository={repository} />);
  return repository;
}

it("saves Male and Female on student profiles and leaves older profiles editable", async () => {
  const repository = await mount("students");
  const original = await repository.snapshot();
  expect(original.children.every((child) => !child.gender)).toBe(true);
  for (const [nickname, gender, label] of [["Preview One", "male", "Male"], ["Preview Two", "female", "Female"]]) {
    fireEvent.click(await screen.findByRole("button", { name: "Add student" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Nickname" }), { target: { value: nickname } });
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Gender" }), { target: { value: gender } });
    fireEvent.submit(dialog.querySelector("form"));
    const profile = await screen.findByRole("button", { name: nickname });
    expect(within(profile.closest('[data-student-id]')).getByText(new RegExp(label))).toBeTruthy();
    expect((await repository.snapshot()).children.find((child) => child.nickname === nickname).gender).toBe(gender);
  }
  expect((await repository.snapshot()).children.find((child) => child.id === original.children[0].id).gender).toBeUndefined();
  const editCard = screen.getByRole("button", { name: "Preview One" }).closest('[data-student-id]');
  fireEvent.click(within(editCard).getByRole("button", { name: "Edit profile" }));
  const edit = screen.getByRole("dialog");
  const gender = within(edit).getByRole("combobox", { name: "Gender" });
  expect(gender.value).toBe("male");
  fireEvent.change(gender, { target: { value: "" } });
  fireEvent.submit(edit.querySelector("form"));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBe(null));
  expect((await repository.snapshot()).children.find((child) => child.nickname === "Preview One").gender).toBeNull();
});

it("saves suggested materials once, keeps worksheet keys out of downloads, and preserves saved copies on reload", async () => {
  const prepare = async (repository) => {
    const snapshot = await repository.snapshot();
    const quiz = snapshot.materials.find((material) => material.kind === "quiz");
    quiz.body.questions[0].correct_option_id = "fixture-answer";
    repository.snapshot = async () => snapshot;
  };
  await mount("downloads", prepare);
  fireEvent.click(await screen.findByRole("button", { name: "Save suggested materials" }));
  await screen.findByText("Words we discovered saved to Downloads.");
  const saved = JSON.parse(localStorage.getItem("linguakids.react.downloads.preview-educator"));
  expect(saved).toHaveLength(1);
  expect(saved[0].body.questions[0].correct_option_id).toBeUndefined();
  expect(screen.queryByRole("region", { name: "Suggested downloads" })).toBe(null);
  cleanup();
  await mount("downloads", prepare);
  expect(await screen.findByRole("heading", { name: /Words we discovered/ })).toBeTruthy();
});

it("opens a selected ten-word set from a forty-word Grade 1 Word Garden collection", async () => {
  const vocabulary = ["cat", "dog", "bird", "fish", "book", "door", "moon", "star", "milk", "tree"];
  await mount("activities", async (repository) => {
    const snapshot = await repository.snapshot();
    const sets = [1, 2, 3, 4].map((number) => ({
      id: `garden-${number}`, title: `Word Garden 1 · Set ${number}`, kind: "game",
      grade_level: 1, learning_level: "beginner", status: "published",
      body: {
        collection: wordGardenCollection, garden_set: number,
        pairs: vocabulary.map((en) => ({ en, fil: `Clue ${number} ${en}` })),
      },
    }));
    repository.snapshot = async () => ({ ...snapshot, materials: [...sets, ...snapshot.materials] });
  });
  await screen.findByText(/40 words in 4 sets/);
  fireEvent.change(screen.getByRole("combobox", { name: "Word Garden set" }), { target: { value: "garden-4" } });
  fireEvent.click(screen.getByRole("button", { name: "Play Word Garden" }));
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByText("Clue 4 cat", { selector: ".garden-clue strong" })).toBeTruthy();
  expect(within(dialog).getByText("0 / 10 found")).toBeTruthy();
});

it("searches Filipino words across all dictionary pages", async () => {
  await mount("dictionary", async (repository) => {
    repository.loadTable = async () => Array.from({ length: 24 }, (_, i) => ({
      id: `entry-${i}`,
      english_term: `Word ${String(i).padStart(2, "0")}`,
      filipino_term: i === 23 ? "talasalitaan" : "halimbawa",
      state: "published",
    }));
  });
  await screen.findByRole("heading", { name: "Word 00" });
  expect(document.querySelectorAll(".dictionary-grid article")).toHaveLength(20);
  fireEvent.click(screen.getByRole("button", { name: "Next page" }));
  expect(screen.getByRole("heading", { name: "Word 23" })).toBeTruthy();
  fireEvent.change(screen.getByRole("searchbox", { name: "Search dictionary", exact: true }), {
    target: { value: "  TALASALITAAN  " },
  });
  expect(document.querySelectorAll(".dictionary-grid article")).toHaveLength(1);
  expect(screen.getByRole("heading", { name: "Word 23" })).toBeTruthy();
});
