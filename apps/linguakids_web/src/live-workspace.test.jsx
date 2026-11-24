// Explicitly opt in to this read-only integration check on the owner's computer.
// Credentials are read from the ignored local file, never included in the app.
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import App from "./App";
import { navigationGroups } from "./WorkspaceNavigation";
import { createRepository } from "./repository";
import { adminNav } from "./domain";

it.skipIf(process.env.LINGUAKIDS_LIVE_CHECK !== "1")(
  "renders every administrator page with actual saved account data and protected backend reads",
  async () => {
    localStorage.clear();
    sessionStorage.clear();
    const config = JSON.parse(await readFile(resolve(process.cwd(), "../../.preview/react-live/config.json"), "utf8"));
    const credentials = JSON.parse(await readFile(resolve(process.cwd(), "../../.preview/requested-admin-credentials.json"), "utf8"));
    const repository = createRepository(config);
    const errors = [];
    const onError = event => errors.push(event.error?.name || "render error");
    window.addEventListener("error", onError);
    try {
      const user = await repository.signIn(credentials.email, credentials.password, "administrator");
      expect(user.status).toBe("active");
      expect(await repository.health()).toBe(true);
      window.history.replaceState(null, "", "/#/workspace/overview");
      render(<App repository={repository} />);
      await screen.findByRole("heading", { name: "Overview", level: 1 }, { timeout: 20000 });
      for (const [, label] of adminNav) {
        const navigation = await screen.findByRole("navigation", { name: "Workspace navigation" });
        const group = navigationGroups(adminNav, "administrator").find(group => group.items.some(([, name]) => name === label));
        const toggle = within(navigation).getByRole("button", { name: group.label, exact: true });
        if (toggle.getAttribute("aria-expanded") !== "true") fireEvent.click(toggle);
        fireEvent.click(within(navigation).getByRole("link", { name: label, exact: true }));
        await screen.findByRole("heading", { name: label, level: 1 }, { timeout: 15000 });
        await waitFor(() => expect(document.querySelector(".workspace-main .loading")).toBe(null), { timeout: 20000 });
        expect(document.querySelector(".workspace-main").textContent.length > label.length).toBe(true);
        // Historical failed training runs remain visible inside their cards.
        // Page-level load failures must not be confused with that saved history.
        expect(document.querySelector(".workspace-main > [role=alert]"), label).toBe(null);
      }
      expect(errors).toEqual([]);
    } finally {
      cleanup();
      window.removeEventListener("error", onError);
      await repository.client.auth.signOut({ scope: "local" });
      repository.client.auth.stopAutoRefresh();
    }
  },
  120000,
);
