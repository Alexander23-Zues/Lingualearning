import { uiText, useUiLanguage } from "./i18n";
import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { errorText } from "./domain";

const paths = {
  home: "M3 10 12 3l9 7v10H3z M9 20v-7h6v7",
  book: "M3 4c4-1 6 0 9 2 3-2 5-3 9-2v15c-4-1-6 0-9 2-3-2-5-3-9-2z M12 6v15",
  users:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M17 4a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.9 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  chart: "M4 3v18h17 M8 16v-5 M13 16V7 M18 16V4",
  calendar: "M3 5h18v16H3z M7 3v4 M17 3v4 M3 10h18",
  letters:
    "M3 18 8 4l5 14 M5 13h6 M15 7h6 M18 4v3 M15 11l6 7 M21 7c0 5-2 8-6 11",
  translate:
    "M3 5h12 M9 3v2 M5 8c1 4 4 6 7 7 M13 5c-1 6-5 9-10 11 M13 21l4-11 4 11 M14 18h6",
  mic: "M9 4a3 3 0 0 1 6 0v8a3 3 0 0 1-6 0z M5 10v2a7 7 0 0 0 14 0v-2 M12 19v3 M8 22h8",
  game: "M7 8h10c3 0 4 4 4 9s-3 4-5 0H8c-2 4-5 5-5 0s1-9 4-9 M7 11v5 M4.5 13.5h5 M16 12h.1 M18 15h.1",
  check: "M4 3h16v18H4z M8 12l3 3 6-7",
  folder: "M3 6h7l2 3h9v12H3z",
  download: "M12 3v12 M7 10l5 5 5-5 M4 17v4h16v-4",
  settings:
    "M9 3h6l1 4 4 2v6l-4 2-1 4H9l-1-4-4-2V9l4-2z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  spark: "m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3z",
  layers: "m12 3 10 5-10 5L2 8z M2 13l10 5 10-5 M2 18l10 5 10-5",
  bell: "M5 17h14l-2-4V8a5 5 0 0 0-10 0v5z M10 21h4",
  shield: "m12 2 9 4v6c0 5-5 8-9 10-4-2-9-5-9-10V6z M8 12l3 3 5-6",
  table: "M3 3h18v18H3z M3 9h18 M9 3v18 M3 15h18",
  search: "M20 20l-5-5 M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0",
  arrow: "M5 12h14 M13 6l6 6-6 6",
  plus: "M12 4v16 M4 12h16",
  edit: "m15 5 4 4 M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15z",
  close: "m6 6 12 12 M6 18 18 6",
  menu: "M3 6h18 M3 12h18 M3 18h18",
  back: "M19 12H5 M11 6l-6 6 6 6",
  logout: "M9 4H3v16h6 M10 12h11 M17 8l4 4-4 4",
  refresh: "M20 8a8 8 0 1 0 0 8 M20 3v5h-5",
  volume: "M3 9h4l5-4v14l-5-4H3z M16 8a6 6 0 0 1 0 8 M19 5a10 10 0 0 1 0 14",
  star: "m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z",
};
export function Icon({ name = "spark", size = 20, ...props }) {
  useUiLanguage();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={paths[name] || paths.spark} />
    </svg>
  );
}
export function Brand() {
  useUiLanguage();
  return (
    <span className="brand">
      <span className="brand-icon">
        <Icon name="book" size={25} />
      </span>{uiText("Lingua")}<span>{uiText("Kids")}</span>
    </span>
  );
}
export function Notice({ children, error = false }) {
  useUiLanguage();
  return (
    <div
      className={`notice ${error ? "error" : ""}`}
      role={error ? "alert" : "status"}
    >
      {children}
    </div>
  );
}
export function Loading({ text = "Opening your workspace…" }) {
  useUiLanguage();
  return (
    <div className="loading" role="status">
      <span className="spinner" />
      {uiText(text)}
    </div>
  );
}
export function Empty({ title = "A fresh start", children, action }) {
  useUiLanguage();
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon name="book" size={32} />
      </span>
      <h3>{uiText(title)}</h3>
      <p>{children || uiText("Your items will appear here.")}</p>
      {action}
    </div>
  );
}
export function Badge({ children }) {
  useUiLanguage();
  return (
    <span
      className={`badge ${String(Array.isArray(children) ? children.join("") : children).replaceAll(" ", "-")}`}
    >
      {children}
    </span>
  );
}
export function Button({
  children,
  icon,
  variant = "",
  className = "",
  ...props
}) {
  useUiLanguage();
  return (
    <button className={`button ${variant} ${className}`} {...props}>
      {icon && <Icon name={icon} />} {children}
    </button>
  );
}
// Controls stay in the DOM so collapsing filters never resets their values.
export function Toolbar({ children, activeCount = 0 }) {
  useUiLanguage();
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const items = Children.toArray(children);
  const search = items.filter((item) => isValidElement(item) && item.type === Search);
  const filters = items.filter((item) => !search.includes(item));
  return (
    <div className="toolbar responsive-toolbar">
      <div className="toolbar-search">
        {search}
        <button type="button" className="filter-toggle" aria-expanded={expanded}
          aria-controls={id} onClick={() => setExpanded(!expanded)}>
          <Icon name="settings" size={18} />{uiText(" Filters")}{activeCount > 0 && <span className="filter-count">{activeCount}</span>}
          <span aria-hidden="true">{expanded ? "−" : "+"}</span>
        </button>
      </div>
      <div id={id} className="filter-fields" data-expanded={expanded}>{filters}</div>
    </div>
  );
}
export function MoreActions({ children }) {
  useUiLanguage();
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  return (
    <div className="secondary-actions">
      <button type="button" className="more-toggle" aria-expanded={expanded}
        aria-controls={id} onClick={() => setExpanded(!expanded)}>{uiText("More actions ")}<span aria-hidden="true">{expanded ? "−" : "+"}</span>
      </button>
      <div id={id} className="text-actions" data-expanded={expanded}>{children}</div>
    </div>
  );
}
export function Field({ label, children, hint, ...props }) {
  useUiLanguage();
  const automaticId = useId();
  const id = props.id || automaticId;
  const control =
    isValidElement(children) &&
    ["input", "textarea", "select"].includes(children.type)
      ? cloneElement(children, { id: children.props.id || id })
      : children;
  return (
    <label className="field" htmlFor={id}>
      <span>{uiText(label)}</span>
      {control || <input id={id} {...props} placeholder={uiText(props.placeholder)} />} {hint && <small>{uiText(hint)}</small>}
    </label>
  );
}
export function Password({ label = "Password", ...props }) {
  useUiLanguage();
  const [show, setShow] = useState(false);
  return (
    <Field label={label}>
      <span className="password">
        <input
          aria-label={label}
          type={show ? "text" : "password"}
          {...props}
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          aria-label={show ? uiText("Hide password") : uiText("Show password")}
        >
          {show ? uiText("Hide") : uiText("Show")}
        </button>
      </span>
    </Field>
  );
}
export function Select({ label, values, ...props }) {
  useUiLanguage();
  return (
    <Field label={label}>
      <select aria-label={uiText(label)} {...props}>
        {values.map((v) => (
          <option
            key={Array.isArray(v) ? v[0] : v}
            value={Array.isArray(v) ? v[0] : v}
          >
            {uiText(Array.isArray(v) ? v[1] : v)}
          </option>
        ))}
      </select>
    </Field>
  );
}
export function Modal({ title, children, onClose, wide = false }) {
  useUiLanguage();
  const ref = useRef();
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    d.showModal();
    return () => d.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={wide ? "wide" : ""}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-head">
        <h2 id={titleId}>{title}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label={uiText("Close")}
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function useAction() {
  const running = useRef(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return {
    busy,
    error,
    setError,
    run: async (task) => {
      if (running.current) return;
      running.current = true;
      setBusy(true);
      setError("");
      try {
        return await task();
      } catch (e) {
        setError(errorText(e));
      } finally {
        running.current = false;
        setBusy(false);
      }
    },
  };
}
export function Search({ value, onChange, placeholder = "Search…", label = "Search" }) {
  useUiLanguage();
  return (
    <label className="search">
      <Icon name="search" />
      <input
        type="search"
        aria-label={uiText(label)}
        value={value}
        placeholder={uiText(placeholder)}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
export function Stats({ items }) {
  useUiLanguage();
  return (
    <div className="stats">
      {items.map(([label, value, icon]) => (
        <div className="stat" key={label}>
          <span className="stat-icon">
            <Icon name={icon} />
          </span>
          <div>
            <small>{uiText(label)}</small>
            <strong>{value ?? "—"}</strong>
          </div>
        </div>
      ))}
    </div>
  );
}
export { speak } from './speech';
