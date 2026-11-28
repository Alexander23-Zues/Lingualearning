import { expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import App from "./App";
import { createPreviewRepository } from "./preview";

it("imports lesson text into an editable draft and saves only on submission", async () => {
  localStorage.clear();
  sessionStorage.clear();
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  const repository = createPreviewRepository();
  await repository.enterPreview("educator");
  repository.api = vi.fn(async () => ({ text: "Basahin ang kuwento." }));
  const rpc = vi.spyOn(repository, "rpc");
  window.history.replaceState(null, "", "/#/workspace/lessons");
  render(<App repository={repository} />);
  fireEvent.click(await screen.findByRole("button", { name: "Create material", exact: true }));
  const dialog = screen.getByRole("dialog");
  const form = within(dialog);
  fireEvent.change(form.getByRole("textbox", { name: "English", exact: true }), {
    target: { value: "Read the story." },
  });
  fireEvent.change(form.getByRole("combobox", { name: "File language" }), {
    target: { value: "filipino" },
  });
  const input = dialog.querySelector('input[type="file"]');
  const openPicker = vi.spyOn(input, "click");
  fireEvent.click(form.getByRole("button", { name: "Upload lesson file" }));
  expect(openPicker).toHaveBeenCalledOnce();
  fireEvent.change(input, { target: { files: [new File(["fixture"], "Reading.txt")] } });
  await form.findByText(/Imported Reading.txt/);
  expect(form.getByRole("textbox", { name: "Title", exact: true }).value).toBe("Reading");
  const filipino = form.getByRole("textbox", { name: "Filipino", exact: true });
  expect(filipino.value).toBe("Basahin ang kuwento.");
  expect(rpc.mock.calls.some(([name]) => name === "save_learning_material")).toBe(false);
  fireEvent.change(filipino, { target: { value: "Basahin ang maikling kuwento." } });
  fireEvent.submit(dialog.querySelector("form"));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBe(null));
  const saved = (await repository.snapshot()).materials.find((material) => material.title === "Reading");
  expect(saved.body).toMatchObject({ english: "Read the story.", filipino: "Basahin ang maikling kuwento." });
});
