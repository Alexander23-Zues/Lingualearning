import { afterEach, beforeEach } from "vitest";
import { cleanup, configure } from "@testing-library/react";
import { setUiLanguage } from "./i18n";
configure({asyncUtilTimeout:5000});
beforeEach(() => setUiLanguage("en"));
afterEach(() => cleanup());
