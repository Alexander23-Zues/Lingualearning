// Retire the previous Flutter offline shell on this origin during migration.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      for (const name of [
        "flutter-app-cache",
        "flutter-temp-cache",
        "flutter-app-manifest",
      ])
        await caches.delete(name);
      await self.registration.unregister();
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of windows) await client.navigate(client.url);
    })(),
  ),
);
