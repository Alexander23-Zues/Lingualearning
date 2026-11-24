"""Check the selected source against English and Tagalog text."""
import json
import re
from functools import lru_cache
from pathlib import Path


@lru_cache(maxsize=1)
def language_tools():
    from lingua import Language, LanguageDetectorBuilder
    vocabulary = json.loads(Path(__file__).with_name("translation_vocabulary.json").read_text(encoding="utf-8"))
    detector = LanguageDetectorBuilder.from_languages(Language.ENGLISH, Language.TAGALOG).build()
    return detector, {language: set(words) for language, words in vocabulary.items()}


def assert_source_language(text: str, source: str):
    detector, vocabulary = language_tools()
    key = " ".join(text.casefold().split()).strip(".!?")
    words = re.findall(r"[^\W\d_]+", key)
    if not words:
        raise ValueError("Type an English or Tagalog word or sentence.")
    known = [language for language in ("en", "fil") if key in vocabulary[language]]
    detected = known[0] if len(known) == 1 else None
    if not known:
        values = detector.compute_language_confidence_values(text)
        best = values[0]
        # Short names and shared words provide little evidence of a language.
        threshold = 0.65 if len(words) >= 3 else 0.8 if len(words) == 2 else 0.98
        if best.value >= threshold:
            detected = "en" if best.language.iso_code_639_1.name == "EN" else "fil"
    if detected and detected != source:
        language, direction, expected = ("Tagalog", "Tagalog → English", "English") if detected == "fil" else ("English", "English → Tagalog", "Tagalog")
        raise ValueError(f"This text appears to be {language}. Switch to {direction} or enter {expected} text.")
