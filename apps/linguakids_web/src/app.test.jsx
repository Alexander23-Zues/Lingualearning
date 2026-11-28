import { beforeEach, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import App from "./App";
import { createPreviewRepository } from "./preview";
import { adminNav, educatorNav } from "./domain";
import { navigationGroups } from "./WorkspaceNavigation";
import { MaterialReader } from "./reader";
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/#/");
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
for (const [role, nav] of [
  ["educator", educatorNav],
  ["administrator", adminNav],
])
  it(`opens every ${role} destination using the React navigation`, async () => {
    const repository = createPreviewRepository();
    await repository.enterPreview(role);
    window.history.replaceState(
      null,
      "",
      `/#/workspace/${role === "educator" ? "home" : "overview"}`,
    );
    render(<App repository={repository} />);
    for (const [slug, label] of nav) {
      const navigation = await screen.findByRole("navigation", {
        name: "Workspace navigation",
      });
      const group = navigationGroups(nav, role).find(group => group.items.some(([key]) => key === slug));
      const toggle = within(navigation).queryByRole("button", { name: group.label, exact: true });
      if (toggle && toggle.getAttribute("aria-expanded") !== "true") fireEvent.click(toggle);
      fireEvent.click(
        within(navigation).getByRole("link", { name: label, exact: true }),
      );
      await screen.findByRole("heading", {
        level: 1,
        name: label,
        exact: true,
      });
      await waitFor(() =>
        expect(
          document.querySelector(".workspace-main").textContent.length,
        ).toBeGreaterThan(10),
      );
      expect(window.location.hash).toBe(`#/workspace/${slug}`);
      if (role === "educator" && !['home','journey'].includes(slug)) {
      expect(
        document.querySelector(
          '.workspace-main svg[role="img"], .workspace-main img',
        ),
      ).not.toBe(null);
      }
    }
  }, 20000);
it("keeps the public landing page available while a saved student lock protects adult destinations", async () => {
  localStorage.setItem("linguakids.adult_locked", "true");
  const repository = createPreviewRepository();
  render(<App repository={{...repository,preview:false}} />);
  await screen.findByRole("heading", { name: /A little learning/ });
  window.location.hash = "#/workspace/ai";
  await screen.findByRole("heading", {
    name: "Return to educator controls",
  });
  expect(window.location.hash).toBe("#/adult-unlock");
  expect(localStorage.getItem("linguakids.adult_locked")).toBe("true");
});
it("creates a student profile, enters student mode and guards educator navigation", async () => {
  const repository = createPreviewRepository();
  await repository.enterPreview("educator");
  window.location.hash = "#/workspace/students";
  render(<App repository={repository} />);
  fireEvent.click(await screen.findByRole("button", { name: "Add student" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Nickname" }), {
    target: { value: "New Learner" },
  });
  fireEvent.submit(
    screen.getByRole("button", { name: "Save profile" }).closest("form"),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBe(null));
  await screen.findByRole("button", { name: "New Learner" });
  const card = screen
    .getByRole("button", { name: "New Learner" })
    .closest('[data-student-id]');
  fireEvent.click(within(card).getByRole("button", { name: /Continue assigned mission/ }));
  await screen.findByRole('button',{name:'Back to teacher'});
  expect(localStorage.getItem("linguakids.adult_locked")).toBe("true");
  window.location.hash = "#/workspace/reports";
  await waitFor(() => expect(window.location.hash).toBe("#/student"));
  expect(document.querySelector(".sidebar")).toBe(null);
  fireEvent.keyDown(window, { ctrlKey: true, shiftKey: true, code: "Digit9" });
  await screen.findByRole("heading", {
    name: "Return to the preview workspace",
  });
  expect(window.location.hash).toBe("#/adult-unlock");
  expect(localStorage.getItem("linguakids.adult_locked")).toBe("true");
});
it("does not permit quiz submission until all questions have answers and retries with the same submission ID", async () => {
  const onComplete = vi
    .fn()
    .mockRejectedValueOnce(new Error("Connection interrupted"))
    .mockResolvedValueOnce({ correct_count: 0, total_count: 1, stars: 1 });
  const material = {
    id: "quiz",
    kind: "quiz",
    title: "Fixture quiz",
    grade_level: 1,
    body: {
      questions: [
        {
          id: "q",
          prompt: "Choose a word",
          options: [
            { id: "a", text: "aklat" },
            { id: "b", text: "puno" },
          ],
        },
      ],
    },
  };
  render(
    <MaterialReader
      material={material}
      student
      onClose={() => {}}
      onComplete={onComplete}
    />,
  );
  const finish = screen.getByRole("button", { name: "Finish activity" });
  expect(finish.disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "A. aklat" }));
  fireEvent.click(finish);
  await screen.findByText("Connection interrupted");
  fireEvent.click(finish);
  await screen.findByText("0 of 1 correct · 1 stars earned");
  expect(onComplete.mock.calls[0][0]).toEqual({ q: "a" });
  expect(onComplete.mock.calls[0][1]).toBe(onComplete.mock.calls[1][1]);
});
it('labels lesson completion separately from a graded correct-answer score',async()=>{
  render(<MaterialReader material={{id:'lesson-score-fixture',title:'Lesson',kind:'lesson',version:1,body:{english:'Read the word book.'}}} student onClose={()=>{}} onComplete={async()=>({correct_count:1,total_count:1,stars:1})}/>);
  fireEvent.click(screen.getByRole('button',{name:'Finish activity'}));
  await screen.findByText('Activity completed · 1 stars earned');
  expect(screen.queryByText('1 of 1 correct · 1 stars earned')).toBeNull();
});
it("requires reading all story pages before completion", () => {
  render(
    <MaterialReader
      material={{
        title: "Fixture story",
        kind: "story",
        body: {
          pages: [
            { english: "First page", filipino: "Una" },
            { english: "Last page", filipino: "Huli" },
          ],
        },
      }}
      student
      onClose={() => {}}
    />,
  );
  expect(screen.getByRole("button", { name: "Finish activity" }).disabled).toBe(
    true,
  );
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByRole("button", { name: "Finish activity" }).disabled).toBe(
    false,
  );
});

it("retries failed educator workspace loading when the tab regains focus", async () => {
  const repository = createPreviewRepository();
  await repository.enterPreview("educator");
  const snapshot = repository.snapshot;
  vi.spyOn(repository, "snapshot")
    .mockRejectedValueOnce(new Error('relation "educators" does not exist'))
    .mockImplementation(snapshot);
  window.location.hash = "#/workspace/home";
  render(<App repository={repository} />);
  await screen.findByText('relation "educators" does not exist');
  fireEvent.focus(window);
  await screen.findByRole("heading", { name: "Class overview" });
  expect(screen.queryByText('relation "educators" does not exist')).toBe(null);
  expect(repository.snapshot).toHaveBeenCalledTimes(2);
});
