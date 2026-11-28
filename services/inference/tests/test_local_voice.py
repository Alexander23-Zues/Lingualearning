import pytest

from app.local_speech import MAX_VOICE_CHUNK, voice_chunks


def test_long_story_keeps_every_word_in_bounded_audio_segments():
    text = "Tumingin si Lina sa silid-aralan. May pulang aklat sa ibabaw ng mesa. " * 4
    chunks = list(voice_chunks(text))
    assert len(chunks) > 1
    assert all(0 < len(chunk) <= MAX_VOICE_CHUNK for chunk in chunks)
    assert " ".join(chunks) == text.strip()


def test_overlong_unbroken_text_cannot_reach_voice_model():
    with pytest.raises(ValueError, match="Add spaces"):
        list(voice_chunks("a" * (MAX_VOICE_CHUNK + 1)))


def test_local_voice_keeps_each_clause_of_the_filipino_example_together():
    text = "Maniwala ka sa sarili mo, dahil walang imposible sa taong hindi sumusuko sa kanyang mga pangarap."
    assert list(voice_chunks(text)) == [
        "Maniwala ka sa sarili mo,",
        "dahil walang imposible sa taong hindi sumusuko sa kanyang mga pangarap.",
    ]
