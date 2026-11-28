import { uiText, useUiLanguage } from "./i18n";
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { createRepository } from "./repository";
import "./styles.css";
import "./original-design.css";
import "./mobile.css";
import "./workspace-layout.css";
import "./lesson-art.css";
import "./admin.css";
import "./workspace-calm.css";
import "./materials-usability.css";
import "./public-refresh.css";
import "./reading-garden.css";
import './teacher-workspace.css';
import './teacher-enhancements.css';

async function main() {
  // Flutter's old offline shell must not continue serving the replaced app.
  if ("serviceWorker" in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        registrations
          .filter(
            (r) =>
              r.active &&
              new URL(r.active.scriptURL).pathname.endsWith(
                "/flutter_service_worker.js",
              ),
          )
          .map((r) => r.unregister()),
      );
    } catch {
      // Optional cleanup must not prevent startup in restricted browser modes.
    }
  }
  const response = await fetch("/config.json", { cache: "no-store" });
  if (!response.ok)
    throw new Error(
      "Public connection settings are missing. Start LinguaKids with Open LinguaKids App.cmd.",
    );
  const config = await response.json();
  const repository = config.LOCAL_COLLECTION
    ? (await import("./collection-repository")).createCollectionRepository(config)
    : config.PREVIEW
    ? (await import("./preview")).createPreviewRepository()
    : createRepository(config);
  createRoot(document.getElementById("root")).render(
    <App repository={repository} />,
  );
}
main().catch((error) => {
  const root = document.getElementById("root");
  root.textContent = "";
  const card = document.createElement("main");
  card.className = "startup-error";
  const title = document.createElement("h1");
  title.textContent = "LinguaKids could not open";
  const message = document.createElement("p");
  message.textContent = error.message;
  const retry = document.createElement("button");
  retry.className = "button";
  retry.textContent = "Try again";
  retry.onclick = () => window.location.reload();
  const library = document.createElement("a");
  library.className = "button secondary";
  library.href = "/offline.html";
  library.textContent = "Offline Library";
  card.append(title, message, retry, library);
  root.append(card);
});

