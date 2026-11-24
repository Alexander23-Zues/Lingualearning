import { uiText, useUiLanguage } from "./i18n";
import { createRoot } from "react-dom/client";
import { OfflineLibrary } from "./offline-library";
import "./styles.css";
import "./original-design.css";
import "./mobile.css";
import "./lesson-art.css";
import "./offline-library.css";
import "./reading-garden.css";

createRoot(document.getElementById("root")).render(<OfflineLibrary />);
