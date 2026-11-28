import { beforeEach, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import App from "./App";
import { createPreviewRepository } from "./preview";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/#/workspace/lessons");
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});

it("opens the mission editor from a library material without starting or skipping a student task", async () => {
  const repository = createPreviewRepository();
  await repository.enterPreview("educator");
  render(<App repository={repository} />);
  fireEvent.click(await screen.findByRole('link',{name:'Place in missions',exact:true}));
  await screen.findByRole('heading',{name:'Missions',level:1});
  expect(window.location.hash).toBe('#/workspace/journey?view=levels&grade=1&material=preview-lesson');
  expect(sessionStorage.getItem('linguakids.react.child')).toBeNull();
  expect(localStorage.getItem('linguakids.adult_locked')).not.toBe('true');
  expect(screen.queryByRole('button',{name:'Assign',exact:true})).toBeNull();
});
