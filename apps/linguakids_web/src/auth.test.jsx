import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "./App";
const user = {
  id: "fixture-user",
  name: "Fixture Administrator",
  email: "fixture@school.edu.ph",
  role: "administrator",
  status: "active",
};
function repository(state = { session: null, recovery: false }) {
  let current = { ...state };
  let listener;
  return {
    config: {},
    subscribe: (fn) => {
      listener = fn;
      return () => {};
    },
    initialize: async () => current,
    profile: async () => (current.session ? user : null),
    preferences: async () => ({
      locale: "en",
      text_scale: 1,
      muted: false,
      reduced_motion: false,
    }),
    snapshot: async () => ({
      materials: [],
      records: [],
      children: [],
      attempts: [],
      educators: [],
      models: [],
    }),
    resetEmail: vi.fn(async () => {}),
    resend: vi.fn(),
    register: vi.fn(),
    updatePassword: vi.fn(async () => {
      current = { session: null, recovery: false };
      listener(current);
    }),
    signIn: vi
      .fn()
      .mockRejectedValueOnce(new Error("Incorrect email or password."))
      .mockResolvedValueOnce(user),
    signOut: vi.fn(),
  };
}
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/#/");
});
it('keeps an active email after a password error without offering removed sections',async()=>{
  window.location.hash='#/login';const repo=repository();render(<App repository={repo}/>);
  const input=await screen.findByRole('textbox',{name:'Email'});
  expect(screen.queryByRole('combobox',{name:'Choose your grade and section'})).toBeNull();
  fireEvent.change(input,{target:{value:'teacher@school.edu.ph'}});
  fireEvent.change(screen.getByLabelText('Password',{exact:true}),{target:{value:'fixture-password'}});
  fireEvent.click(screen.getByRole('button',{name:'Log in'}));
  await screen.findByText('Incorrect email or password.');
  expect(repo.signIn).toHaveBeenCalledExactlyOnceWith('teacher@school.edu.ph','fixture-password','educator');
  expect(input.value).toBe('teacher@school.edu.ph');
});
it('explains that a former section login has been removed',async()=>{
  window.location.hash='#/admin-login';const repo=repository();render(<App repository={repo}/>);
  fireEvent.change(await screen.findByRole('textbox',{name:'Email'}),{target:{value:'mapagmahal@gmail.com'}});
  await screen.findByText(/This section login has been removed/);
  expect(screen.getByRole('button',{name:'Log in'}).disabled).toBe(true);
  expect(repo.signIn).not.toHaveBeenCalled();
});
it("blocks an incomplete educator login and registers a teacher with their own email", async () => {
  window.location.hash = "#/login";
  const repo = repository();
  render(<App repository={repo} />);
  fireEvent.change(await screen.findByRole("textbox", { name: "Email" }), {
    target: { value: "mapagmal" },
  });
  fireEvent.change(screen.getByLabelText("Password", { exact: true }), {
    target: { value: "fixture-password" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Log in" }));
  await screen.findByText("Enter your complete email address.");
  expect(repo.signIn).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("link", { name: "Register as an educator" }));
  await screen.findByRole("heading", { name: "Register as an educator" });
  fireEvent.change(screen.getByLabelText("Full name"), { target: { value: " Demo Teacher " } });
  fireEvent.change(screen.getByLabelText("Email", { exact: true }), { target: { value: "teacher@school.edu.ph" } });
  expect(screen.queryByLabelText("Teacher invitation code")).toBeNull();
  expect(screen.getByText(/No administrator approval is needed/)).toBeTruthy();
  fireEvent.change(screen.getByRole("combobox", { name: "Grade you teach" }), { target: { value: "4" } });
  fireEvent.change(screen.getByLabelText("Password", { exact: true }), { target: { value: "fixture-password" } });
  fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "fixture-password" } });
  fireEvent.click(screen.getByRole("checkbox", { name: /use student profiles responsibly/ }));
  fireEvent.click(screen.getByRole("button", { name: "Create account & verify email" }));
  fireEvent.click(await screen.findByRole("link", { name: "Go to login" }));
  expect(repo.register).toHaveBeenCalledExactlyOnceWith({
    name: "Demo Teacher", email: "teacher@school.edu.ph", password: "fixture-password",
    school_name: "", grade_levels: [4],
  });
  expect((await screen.findByRole("textbox", { name: "Email" })).value).toBe("teacher@school.edu.ph");
});
it("preserves admin login fields after a failure and retries into the admin workspace", async () => {
  window.location.hash = "#/admin-login";
  const repo = repository();
  render(<App repository={repo} />);
  fireEvent.change(await screen.findByRole("textbox", { name: "Email" }), {
    target: { value: "fixture@school.edu.ph" },
  });
  fireEvent.change(screen.getByLabelText("Password", { exact: true }), {
    target: { value: "fixture-password" },
  });
  fireEvent.submit(
    screen.getByRole("button", { name: "Log in" }).closest("form"),
  );
  await screen.findByText("Incorrect email or password.");
  expect(screen.getByRole("textbox", { name: "Email" }).value).toBe(
    "fixture@school.edu.ph",
  );
  expect(screen.getByLabelText("Password", { exact: true }).value).toBe(
    "fixture-password",
  );
  fireEvent.submit(
    screen.getByRole("button", { name: "Log in" }).closest("form"),
  );
  await screen.findByRole("heading", { name: "Overview", level: 1 });
  expect(repo.signIn.mock.calls[1]).toEqual([
    "fixture@school.edu.ph",
    "fixture-password",
    "administrator",
  ]);
});
it("opens a dedicated reset form without sending email until explicit submission and then enforces cooldown", async () => {
  window.location.hash = "#/admin-login";
  const repo = repository();
  render(<App repository={repo} />);
  fireEvent.change(await screen.findByRole("textbox", { name: "Email" }), {
    target: { value: "fixture@school.edu.ph" },
  });
  fireEvent.click(screen.getByRole("link", { name: "Forgot password?" }));
  await screen.findByRole("heading", { name: "Reset your password" });
  expect(repo.resetEmail).not.toHaveBeenCalled();
  expect(screen.getByRole("textbox", { name: "Account email" }).value).toBe(
    "fixture@school.edu.ph",
  );
  fireEvent.submit(
    screen.getByRole("button", { name: "Send reset link" }).closest("form"),
  );
  await screen.findByRole("heading", { name: "Check your email" });
  expect(repo.resetEmail).toHaveBeenCalledWith("fixture@school.edu.ph");
  expect(screen.getByRole("button", { name: /Resend in/ }).disabled).toBe(true);
});
it("does not expose a new-password input without a verified recovery session", async () => {
  window.location.hash = "#/reset-password";
  render(<App repository={repository()} />);
  await screen.findByRole("heading", { name: "Open your recovery email" });
  expect(screen.queryByLabelText("New password")).toBe(null);
});
it("preserves an initial verified recovery callback and returns administrators to their own login after completion", async () => {
  const repo = repository({
    session: { user: { id: user.id } },
    recovery: true,
  });
  render(<App repository={repo} />);
  await screen.findByRole("heading", { name: "Choose your new password" });
  await waitFor(() => expect(window.location.hash).toBe("#/reset-password"));
  fireEvent.change(screen.getByLabelText("New password", { exact: true }), {
    target: { value: "new-fixture-password" },
  });
  fireEvent.change(screen.getByLabelText("Confirm password", { exact: true }), {
    target: { value: "new-fixture-password" },
  });
  fireEvent.submit(
    screen.getByRole("button", { name: "Save new password" }).closest("form"),
  );
  await screen.findByRole("heading", { name: "Administrator login" });
  expect(repo.updatePassword).toHaveBeenCalledWith("new-fixture-password");
  expect(screen.getByText("Your password has been changed. Log in with your new password.")).toBeTruthy();
});
it("keeps a signed-out visitor out of administrator data", async () => {
  window.location.hash = "#/workspace/ai";
  const repo = repository();
  render(<App repository={repo} />);
  await screen.findByRole("heading", { name: "Welcome back, educator" });
  expect(window.location.hash).toBe("#/login");
});
it("opens educator registration from the unlock page without clearing the device lock", async () => {
  localStorage.setItem("linguakids.adult_locked", "true");
  window.location.hash = "#/adult-unlock";
  render(<App repository={repository()} />);
  fireEvent.click(await screen.findByRole("link", { name: "Register as an educator" }));
  await screen.findByRole("textbox", { name: "Full name" });
  fireEvent.click(screen.getByRole("link", { name: "Already registered? Log in" }));
  await screen.findByRole("heading", { name: "Return to educator controls" });
  expect(localStorage.getItem("linguakids.adult_locked")).toBe("true");
});
it("protects an active student session from account changes through registration", async () => {
  localStorage.setItem("linguakids.adult_locked", "true");
  sessionStorage.setItem("linguakids.react.child", JSON.stringify({ token: "child-fixture", owner_id: "teacher-fixture" }));
  window.location.hash = "#/adult-unlock";
  const repo = repository();
  render(<App repository={repo} />);
  fireEvent.click(await screen.findByRole("link", { name: "Register as an educator" }));
  await screen.findByText(/exit the current student session/);
  expect(screen.queryByRole("textbox", { name: "Full name" })).toBeNull();
  expect(repo.register).not.toHaveBeenCalled();
});
it("uses an active email when verifying educator controls", async () => {
  window.location.hash = "#/adult-unlock";
  const repo = repository();
  render(<App repository={repo} />);
  fireEvent.change(await screen.findByRole("textbox", { name: "Educator email" }), {
    target: { value: "teacher@school.edu.ph" },
  });
  fireEvent.change(screen.getByLabelText("Password", { exact: true }), { target: { value: "fixture-password" } });
  fireEvent.click(screen.getByRole("button", { name: "Verify account and exit" }));
  await screen.findByText("Incorrect email or password.");
  expect(repo.signIn).toHaveBeenCalledExactlyOnceWith("teacher@school.edu.ph", "fixture-password");
});

it('offers only one permanent grade and disables already assigned grades',async()=>{
  window.location.hash='#/register';const repo=repository();
  repo.registrationGrades=vi.fn(async()=>[1,2,3,4,5,6].map(grade_level=>({grade_level,occupied:grade_level===1})));
  render(<App repository={repo}/>);
  await screen.findByRole('option',{name:'Grade 1 — Account already registered'});
  expect(screen.getByRole('option',{name:'Grade 1 — Account already registered'}).disabled).toBe(true);
  const picker=screen.getByRole('combobox',{name:'Grade you teach'});
  fireEvent.change(picker,{target:{value:'2'}});fireEvent.change(picker,{target:{value:'4'}});
  expect(picker.value).toBe('4');expect(screen.queryByRole('option',{name:'All grades'})).toBeNull();
});
it('keeps a failed recovery request editable and does not claim an email was sent',async()=>{
  window.location.hash='#/forgot-password';const repo=repository();
  repo.resetEmail.mockRejectedValueOnce(new Error('Email delivery is currently unavailable. Contact your administrator for help.'));
  render(<App repository={repo}/>);
  fireEvent.change(await screen.findByRole('textbox',{name:'Account email'}),{target:{value:'teacher@school.edu.ph'}});
  fireEvent.click(screen.getByRole('button',{name:'Send reset link'}));
  await screen.findByText('Email delivery is currently unavailable. Contact your administrator for help.');
  expect(screen.queryByRole('heading',{name:'Check your email'})).toBeNull();
  expect(screen.getByRole('button',{name:'Send reset link'}).disabled).toBe(false);
});
