import { useEffect, useRef, useState } from "react";
import { uiText } from "./i18n";
import { Icon } from "./ui";
import { prepareSpeech, speak, usePreparedSpeech } from "./speech";

export function ListenButton({ text, language = "en", slow = false, reading = false, children, className = "button ghost", disabled = false, onPlay, ...props }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(!globalThis.IntersectionObserver);
  useEffect(() => {
    if (!globalThis.IntersectionObserver) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: "100px" });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  const audio = usePreparedSpeech(text, language, visible && !disabled && !reading, reading);
  return (
    <button
      ref={ref}
      type="button"
      className={className}
      {...props}
      disabled={disabled || !text}
      aria-busy={audio.preparing}
      title={audio.preparing ? uiText("Preparing audio…") : props.title}
      onFocus={() => { if (!reading) void prepareSpeech(text, language).catch(() => {}); }}
      onPointerEnter={() => { if (!reading) void prepareSpeech(text, language).catch(() => {}); }}
      onClick={() => {
        if (onPlay) return onPlay();
        return reading ? speak(text, language, slow, true) : speak(text, language, slow);
      }}
    >
      <Icon name="volume" />
      {children || uiText("Listen")}
      {audio.preparing && <span className="spinner listen-spinner" aria-hidden="true" />}
    </button>
  );
}
