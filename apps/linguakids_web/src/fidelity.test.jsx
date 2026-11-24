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
import { gradebookMatrix } from "./domain";

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
async function mount(section = "home", role = "educator") {
  const repository = createPreviewRepository();
  await repository.enterPreview(role);
  window.history.replaceState(null, "", `/#/workspace/${section}`);
  const original=repository.rpc.bind(repository);
  const rpc = vi.spyOn(repository, "rpc").mockImplementation(async(name,args)=>{
    if(name==='educator_adventure_progress'){
      const data=await repository.snapshot();
      return data.children.filter(child=>child.grade_level===args.p_grade&&child.active).map(child=>({child_id:child.id,nickname:child.nickname,quiz_attempts:[],adventure:{revision:1,current_step_id:'preview-lesson:1:read',stages:[{id:'stage-1',title:'First mission',status:'active',completed:0,total:1,steps:[{id:'preview-lesson:1:read',material_id:'preview-lesson',material_version:1,title:'A little seed, a big discovery',kind:'lesson',status:'current'}]}]}}));
    }
    return original(name,args);
  });
  render(<App repository={repository} />);
  await screen.findByRole("navigation", { name: "Workspace navigation" });
  await waitFor(() =>
    expect(document.querySelector(".workspace-main .loading")).toBe(null),
  );
  return { repository, rpc };
}
it("opens connected teacher records and filters classroom metrics by grade", async () => {
  await mount();
  await screen.findByRole("heading", { name: "Class overview" });
  expect(
    screen
      .getByRole("link", { name: "Students & missions" })
      .getAttribute("href"),
  ).toBe("#/workspace/students");
  expect(
    screen.getByRole("link", { name: "Arrange grade missions" }).getAttribute("href"),
  ).toBe("#/workspace/journey?view=levels");
  expect(screen.getByRole('link',{name:/Active students/}).textContent).toContain('2');
  fireEvent.change(screen.getByRole('combobox',{name:'Class grade'}),{target:{value:'6'}});
  expect(screen.getByRole('link',{name:/Active students/}).textContent).toContain('0');
  fireEvent.change(screen.getByRole('combobox',{name:'Class grade'}),{target:{value:''}});
  expect(screen.getByRole('link',{name:/Active students/}).textContent).toContain('2');
});
it("submits the database-supported submitted state with curriculum fields and clears old page content", async () => {
  const { rpc } = await mount("lessons");
  fireEvent.click(
    await screen.findByRole("button", { name: "Create material" }),
  );
  const form = screen.getByRole("dialog");
  fireEvent.change(within(form).getByRole("textbox", { name: "Title" }), {
    target: { value: "A connected lesson" },
  });
  fireEvent.change(
    within(form).getByRole("textbox", { name: "English", exact: true }),
    { target: { value: "A book." } },
  );
  fireEvent.change(
    within(form).getByRole("textbox", { name: "Filipino", exact: true }),
    { target: { value: "Isang aklat." } },
  );
  fireEvent.change(within(form).getByRole("combobox", { name: "Visibility" }), {
    target: { value: "submitted" },
  });
  fireEvent.change(
    within(form).getByRole("combobox", { name: "Learning area" }),
    { target: { value: "Filipino" } },
  );
  fireEvent.change(within(form).getByRole("combobox", { name: "Quarter" }), {
    target: { value: "2" },
  });
  fireEvent.submit(
    within(form).getByRole("button", { name: "Save material" }).closest("form"),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBe(null));
  const request = rpc.mock.calls.find(
    ([name]) => name === "save_learning_material",
  )[1];
  expect(request.p_data.status).toBe("submitted");
  expect(request.p_data.curriculum).toEqual({
    learning_area: "Filipino",
    quarter: 2,
  });
  expect(request.p_data.body.english).toBe("A book.");
  expect(request.p_data.body.pages).toBeUndefined();
  expect(request.p_data).not.toHaveProperty("owner_id");
});
it("saves a teaching plan with the selected material IDs in teaching order", async () => {
  const { rpc } = await mount("plans");
  fireEvent.click(screen.getByRole("button", { name: "Create plan" }));
  const dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Title" }), {
    target: { value: "Week one" },
  });
  fireEvent.click(
    within(dialog).getByRole("checkbox", {
      name: "A little seed, a big discovery",
    }),
  );
  fireEvent.click(
    within(dialog).getByRole("checkbox", { name: "The reading garden" }),
  );
  fireEvent.submit(
    within(dialog).getByRole("button", { name: "Save plan" }).closest("form"),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBe(null));
  const request = rpc.mock.calls.find(
    ([name]) => name === "save_workspace_record",
  )[1];
  expect(request.p_data.data.material_ids).toEqual([
    "preview-lesson",
    "preview-story",
  ]);
  expect(request.p_data.data.grade_level).toBe(1);
  await screen.findByRole("heading", { name: "Week one" });
});
it("saves only permitted student preferences and preserves inactive profiles", async () => {
  const { rpc } = await mount("students");
  fireEvent.click(screen.getByRole("button", { name: "Add student" }));
  const dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Nickname" }), {
    target: { value: "A learner" },
  });
  fireEvent.change(
    within(dialog).getByRole("combobox", { name: "Student reading language" }),
    { target: { value: "fil" } },
  );
  fireEvent.click(
    within(dialog).getByRole("checkbox", { name: "Enable reading sounds" }),
  );
  fireEvent.click(
    within(dialog).getByRole("checkbox", {
      name: "Reduce motion for this student",
    }),
  );
  fireEvent.click(
    within(dialog).getByRole("checkbox", { name: "Active profile" }),
  );
  fireEvent.submit(
    within(dialog)
      .getByRole("button", { name: "Save profile" })
      .closest("form"),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBe(null));
  const payload = rpc.mock.calls.find(
    ([name]) => name === "save_child_profile",
  )[1].p_data;
  expect(payload.preferences).toEqual({
    language: "fil",
    sound: false,
    reduced_motion: true,
  });
  expect(payload.active).toBe(false);
  expect(Object.keys(payload).sort()).toEqual(
    [
      "nickname",
      "grade_level",
      "avatar_key",
      "learning_level",
      "active",
      "preferences",
    ].sort(),
  );
  const card = screen
    .getByRole("button", { name: "A learner" })
    .closest('[data-student-id]');
  expect(
    within(card).getByRole("button", { name: /Continue assigned mission/ }).disabled,
  ).toBe(true);
});
it("opens a student’s assigned mission and keeps teacher previews out of student results", async () => {
  await mount("students");
  fireEvent.click(screen.getByRole("button", { name: "Mika", exact: true }));
  await screen.findByRole("button", { name: "Mission progress" });
  await screen.findByRole("heading", { name: /A little seed, a big discovery/ });
  fireEvent.click(
    screen.getByRole("button", { name: "Teacher preview", exact: true }),
  );
  await screen.findByText("Educator preview · no student grade");
  expect(screen.queryByRole("button", { name: "Finish activity" })).toBe(null);
});
it("removes a local download without changing or deleting the shared material", async () => {
  const { repository, rpc } = await mount("lessons");
  fireEvent.click(
    screen.getByRole("button", { name: "Save offline", exact: true }),
  );
  await screen.findByText(/saved to Downloads/);
  const navigation = screen.getByRole("navigation", {
    name: "Workspace navigation",
  });
  fireEvent.click(
    within(navigation).getByRole("link", { name: "Downloads", exact: true }),
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Remove download" }),
  );
  await screen.findByRole("heading", {
    name: "No saved downloads yet",
  });
  expect(
    (await repository.snapshot()).materials.some(
      (m) => m.id === "preview-lesson",
    ),
  ).toBe(true);
  expect(rpc.mock.calls.some(([name]) => /delete|remove/.test(name))).toBe(
    false,
  );
});
it("keeps separate historical columns after a quiz moves grade and a student changes grade", () => {
  const children = [{ id: "student", nickname: "Sam", grade_level: 2 }],
    current = {
      id: "same-quiz",
      kind: "quiz",
      title: "New title",
      grade_level: 2,
      quiz_number: 1,
      status: "published",
    };
  const data = {
    materials: [current],
    attempts: [
      {
        id: "old",
        child_id: "student",
        material_id: "same-quiz",
        activity_kind: "quiz",
        material_title: "Old title",
        grade_level: 1,
        quiz_number: 3,
        correct_count: 0,
        total_count: 4,
        completed_at: "2026-01-01",
      },
      {
        id: "new",
        child_id: "student",
        material_id: "same-quiz",
        activity_kind: "quiz",
        material_title: "New title",
        grade_level: 2,
        quiz_number: 1,
        correct_count: 3,
        total_count: 4,
        completed_at: "2026-02-01",
      },
    ],
  };
  const all = gradebookMatrix(data, children);
  expect(all.columns.map((c) => c.title)).toEqual(["Old title", "New title"]);
  expect(all.rows[0].cells.map((c) => c.text)).toEqual(["0/4", "3/4"]);
  const first = gradebookMatrix(data, children, 1);
  expect(first.columns).toHaveLength(1);
  expect(first.rows[0].cells[0].text).toBe("0/4");
});
it("supports two-option quizzes and saves the chosen answer through the checked material workflow", async () => {
  const { rpc } = await mount("quizzes");
  fireEvent.click(screen.getByRole("button", { name: "Create material" }));
  const dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Title" }), {
    target: { value: "Two choices" },
  });
  fireEvent.change(
    within(dialog).getByRole("textbox", { name: "Question 1 prompt" }),
    { target: { value: "Which word means book?" } },
  );
  fireEvent.click(
    within(dialog).getByRole("button", {
      name: "Remove option D from question 1",
    }),
  );
  fireEvent.click(
    within(dialog).getByRole("button", {
      name: "Remove option C from question 1",
    }),
  );
  fireEvent.change(
    within(dialog).getByRole("textbox", { name: "Question 1 option 1" }),
    { target: { value: "aklat" } },
  );
  fireEvent.change(
    within(dialog).getByRole("textbox", { name: "Question 1 option 2" }),
    { target: { value: "puno" } },
  );
  fireEvent.click(
    within(dialog).getByRole("radio", { name: "Correct answer 1 option 1" }),
  );
  fireEvent.submit(
    within(dialog)
      .getByRole("button", { name: "Save material" })
      .closest("form"),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBe(null));
  const saved = rpc.mock.calls.find(
    ([name]) => name === "save_learning_material",
  )[1].p_data;
  expect(saved.body.questions[0].options).toHaveLength(2);
  expect(saved.body.questions[0].correct_option_id).toBe(
    saved.body.questions[0].options[0].id,
  );
});
it("opens the illustrated educator presentation and exits without creating a student attempt", async () => {
  const { repository } = await mount();
  fireEvent.click(screen.getByRole("link", { name: "Present", exact: true }));
  await screen.findByRole("heading", {
    name: "Let's learn something wonderful.",
  });
  expect(
    document.querySelectorAll('.presentation .material-grid svg[role="img"]')
      .length,
  ).toBeGreaterThan(0);
  fireEvent.click(
    screen.getByRole("button", { name: /A little seed, a big discovery/ }),
  );
  await screen.findByText("Educator preview · no student grade");
  expect((await repository.snapshot()).attempts).toHaveLength(0);
});

it("restores an authenticated presentation link and selects the educator's assigned grade", async () => {
  const repository = createPreviewRepository();
  await repository.enterPreview("educator");
  const profile = await repository.profile();
  const snapshot = await repository.snapshot();
  const lesson = snapshot.materials.find((material) => material.kind === "lesson");
  repository.profile = async () => ({ ...profile, grade_levels: [6] });
  repository.snapshot = async () => ({
    ...snapshot,
    materials: [...snapshot.materials, { ...lesson, id: "six", grade_level: 6, title: "Grade 6 classroom lesson" }],
  });
  window.history.replaceState(null, "", "/#/presentation");
  render(<App repository={repository} />);
  expect(await screen.findByRole("button", { name: /Grade 6 classroom lesson/ })).toBeTruthy();
  const grade = screen.getByRole("combobox", { name: "Grade" });
  expect(grade.value).toBe("6");
  fireEvent.change(grade, { target: { value: "2" } });
  expect(screen.getByText("No materials for this grade")).toBeTruthy();
});

it("suspends and reactivates educators through the installed audited RPC with a reason for each change", async () => {
  const { rpc } = await mount("educators", "administrator");
  for (const [label, status, reason] of [
    ["Suspend", "suspended", "Fixture account review"],
    ["Reactivate", "active", "Fixture review completed"],
  ]) {
    fireEvent.click(await screen.findByRole("button", { name: label, exact: true }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("textbox", { name: "Reason" }).required).toBe(true);
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Reason" }), {
      target: { value: reason },
    });
    fireEvent.submit(within(dialog).getByRole("button", { name: "Confirm account status" }).closest("form"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBe(null));
    expect(rpc).toHaveBeenLastCalledWith("admin_update_educator", {
      p_id: "preview-educator", p_status: status, p_reason: reason,
    });
  }
});
