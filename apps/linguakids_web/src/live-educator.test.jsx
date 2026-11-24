// Uses a read-only snapshot obtained from the database under the affected
// educator's authenticated role. This checks rendering/data contracts, not
// password login, browser layout, or access through an administrator session.
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import App from "./App";
import { navigationGroups } from "./WorkspaceNavigation";
import { educatorNav } from "./domain";

it.skipIf(process.env.LINGUAKIDS_EDUCATOR_CHECK !== "1")(
  "renders all educator pages with the affected account's live role-scoped data",
  async () => {
    localStorage.clear();
    sessionStorage.clear();
    const fixture = JSON.parse(await readFile(resolve(process.cwd(), "../../.preview/educator-live-fixture.json"), "utf8"));
    expect(fixture.user.role).toBe("educator");
    expect(fixture.snapshot.materials.length).toBeGreaterThan(0);
    expect(fixture.snapshot.educators).toEqual([]);
    expect(fixture.snapshot.models).toEqual([]);
    const repository = {
      config: {},
      subscribe: () => () => {},
      initialize: async () => ({ session: { user: { id: fixture.user.id } } }),
      profile: async () => fixture.user,
      snapshot: async () => fixture.snapshot,
      preferences: async () => fixture.preferences || {},
      loadTable: async (name) => {
        if (name !== "dictionary_entries") throw new Error("Unexpected educator table read");
        return fixture.dictionary || [];
      },
      health: async () => true,
    };
    window.history.replaceState(null, "", "/#/workspace/home");
    render(<App repository={repository} />);
    await screen.findByRole("heading", { name: "Kumusta, Kaibigan!" });
    for (const [slug, label] of educatorNav) {
      const navigation = screen.getByRole("navigation", { name: "Workspace navigation" });
      const group = navigationGroups(educatorNav, "educator").find(group => group.items.some(([, name]) => name === label));
        const toggle = within(navigation).getByRole("button", { name: group.label, exact: true });
        if (toggle.getAttribute("aria-expanded") !== "true") fireEvent.click(toggle);
        fireEvent.click(within(navigation).getByRole("link", { name: label, exact: true }));
      await screen.findByRole("heading", { name: label, level: 1 });
      await waitFor(() => expect(document.querySelector(".workspace-main .loading")).toBe(null));
      expect(document.querySelector(".workspace-main > [role=alert]"), label).toBe(null);
      expect(document.querySelector(".workspace-main").textContent.length > label.length).toBe(true);
      if (["lessons", "activities", "stories", "quizzes", "dictionary"].includes(slug))
        expect(document.querySelectorAll(".workspace-main .material-card").length, label).toBeGreaterThan(0);
    }
  },
  30000,
);
