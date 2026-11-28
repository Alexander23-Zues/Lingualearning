import { expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import App from "./App";
import { createPreviewRepository } from "./preview";

it("saves Filipino for the educator workspace and switches the page back to English", async () => {
  localStorage.clear();
  sessionStorage.clear();
  const repository = createPreviewRepository();
  await repository.enterPreview("educator");
  window.history.replaceState(null, "", "/#/workspace/settings");
  render(<App repository={repository} />);
  const preference = await screen.findByRole("combobox", { name: "Preferred language" });
  fireEvent.change(preference, { target: { value: "fil" } });
  fireEvent.click(screen.getByRole("button", { name: "Save preferences" }));
  await screen.findByRole("heading", { name: "Mga setting", level: 1 });
  expect(screen.getByRole("link", { name: "Mga setting" })).toBeTruthy();
  expect(document.documentElement.lang).toBe("fil");
  fireEvent.change(screen.getByRole("combobox", { name: "Gustong wika" }), { target: { value: "en" } });
  fireEvent.click(screen.getByRole("button", { name: "I-save ang mga kagustuhan" }));
  await screen.findByRole("heading", { name: "Settings", level: 1 });
  expect(document.documentElement.lang).toBe("en");
});
