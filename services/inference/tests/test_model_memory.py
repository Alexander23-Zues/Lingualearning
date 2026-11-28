from types import SimpleNamespace

import pytest

from app import main


def test_switching_ai_tools_releases_other_models_before_running(monkeypatch):
    calls = []
    monkeypatch.setattr(main.settings, "tts_model_root", "fixture")
    for name in ("runtime", "reading_runtime", "speech_runtime"):
        monkeypatch.setattr(main, name, SimpleNamespace(
            release_model=lambda name=name: calls.append(name),
        ))
    monkeypatch.setattr(main, "trim_memory", lambda: calls.append("trim"))

    def synthesize():
        calls.append("speak")
        return b"audio"

    assert main.run_model("speech", synthesize) == b"audio"
    assert calls == ["runtime", "reading_runtime", "trim", "speak", "trim"]


def test_failed_ai_request_still_releases_temporary_memory(monkeypatch):
    calls = []
    monkeypatch.setattr(main.settings, "tts_model_root", "fixture")
    for name in ("runtime", "reading_runtime", "speech_runtime"):
        monkeypatch.setattr(main, name, None)
    monkeypatch.setattr(main, "trim_memory", lambda: calls.append("trim"))

    def fail():
        raise ValueError("fixture failure")

    with pytest.raises(ValueError, match="fixture failure"):
        main.run_model("speech", fail)
    assert calls == ["trim", "trim"]
