import { expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { resolve } from "node:path";
it("retires only the old Flutter caches and reloads existing app tabs", async () => {
  const handlers = {},
    remove = vi.fn(async () => true),
    navigate = vi.fn(async () => {}),
    unregister = vi.fn(async () => true);
  const self = {
    addEventListener: (event, handler) => (handlers[event] = handler),
    skipWaiting: vi.fn(),
    registration: { unregister },
    clients: {
      matchAll: async () => [
        { url: "http://localhost:3000/#/admin-login", navigate },
      ],
    },
  };
  runInNewContext(
    readFileSync(
      resolve(process.cwd(), "public/flutter_service_worker.js"),
      "utf8",
    ),
    { self, caches: { delete: remove } },
  );
  let completed;
  handlers.activate({ waitUntil: (promise) => (completed = promise) });
  await completed;
  expect(remove.mock.calls.map(([key]) => key)).toEqual([
    "flutter-app-cache",
    "flutter-temp-cache",
    "flutter-app-manifest",
  ]);
  expect(unregister).toHaveBeenCalledOnce();
  expect(navigate).toHaveBeenCalledWith("http://localhost:3000/#/admin-login");
});
