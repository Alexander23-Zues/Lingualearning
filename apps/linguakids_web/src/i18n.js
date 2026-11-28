import { useSyncExternalStore } from "react";
import filipino from "./locales/fil.json";
import teacherFilipino from './locales/teacher-fil.json';

let language = "en";
const listeners = new Set();

export function setUiLanguage(value) {
  const next = value === "fil" ? "fil" : "en";
  document.documentElement.lang = next;
  if (language === next) return;
  language = next;
  listeners.forEach(listener => listener());
}

export function useUiLanguage() {
  return useSyncExternalStore(
    listener => { listeners.add(listener); return () => listeners.delete(listener); },
    () => language,
    () => "en",
  );
}

export function uiText(text, parameters = []) {
  if (typeof text !== "string") return text;
  const key = text.trim();
  const translated = language === "fil" ? teacherFilipino[key] || filipino[key] || key : key;
  const leading = text.match(/^\s*/)[0];
  const trailing = text.match(/\s*$/)[0];
  return leading + translated.replace(/\{(\d+)\}/g, (match, index) =>
    index < parameters.length ? String(parameters[index]) : match) + trailing;
}
