import io
import struct
import wave
from types import SimpleNamespace

import numpy as np

from app.reading import ReadingRuntime, reduce_steady_noise


def test_reading_passes_validated_pcm_directly_to_whisper():
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav:
        wav.setparams((1, 2, 16000, 0, "NONE", "not compressed"))
        wav.writeframes(struct.pack("<hhh", -32768, 0, 16384))

    def transcribe(samples, **options):
        assert samples.dtype == np.float32
        np.testing.assert_array_equal(samples, [-1, 0, 0.5])
        assert options["language"] == "tl"
        return [SimpleNamespace(text=" Magandang umaga. ", avg_logprob=-0.3)], None

    runtime = ReadingRuntime.__new__(ReadingRuntime)
    runtime.model = SimpleNamespace(transcribe=transcribe)
    assert runtime.recognize(buffer.getvalue(), "fil") == "Magandang umaga."


def test_digital_silence_skips_recognition_and_has_no_word_results():
    from app.reading import compare_reading

    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav:
        wav.setparams((1, 2, 16000, 0, "NONE", "not compressed"))
        wav.writeframes(bytes(64000))
    runtime = ReadingRuntime.__new__(ReadingRuntime)
    result = compare_reading("Magandang umaga.", runtime.recognize(buffer.getvalue(), "fil"))
    assert result['speech_detected'] is False
    assert result['word_results'] == result['missing_words'] == []


def test_wav_duration_allows_forty_five_seconds_but_rejects_longer_audio():
    import pytest
    from app.reading import validate_wav

    def clip(frames):
        buffer = io.BytesIO()
        with wave.open(buffer, "wb") as wav:
            wav.setparams((1, 2, 16000, 0, "NONE", "not compressed"))
            wav.writeframes(bytes(frames * 2))
        return buffer.getvalue()

    assert validate_wav(clip(720000)) == 45
    with pytest.raises(ValueError, match='45 seconds'):
        validate_wav(clip(720001))


def test_steady_noise_is_reduced_without_cutting_quiet_speech_or_pauses():
    time = np.arange(24000) / 16000
    fan = (0.02 * np.sin(2 * np.pi * 125 * time)).astype(np.float32)
    voice = np.zeros_like(fan)
    voice[6000:16000] = 0.05 * np.sin(2 * np.pi * 440 * time[6000:16000])
    filtered = reduce_steady_noise(fan + voice)
    assert filtered.shape == voice.shape
    assert np.std(filtered[:5500]) < 0.65 * np.std(fan[:5500])
    assert np.dot(filtered, voice) / np.dot(voice, voice) > 0.9
    np.testing.assert_array_equal(reduce_steady_noise(voice), voice)


def test_unclear_words_do_not_produce_results_even_when_the_transcript_matches():
    from app.reading import compare_reading

    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav:
        wav.setparams((1, 2, 16000, 0, "NONE", "not compressed"))
        wav.writeframes(struct.pack("<hhh", -32768, 0, 16384))
    runtime = ReadingRuntime.__new__(ReadingRuntime)
    runtime.model = SimpleNamespace(transcribe=lambda *args, **kwargs: (
        [SimpleNamespace(text="A dog", avg_logprob=-1.4)], None))
    recognition = runtime.recognize_with_details(buffer.getvalue(), "en")
    result = compare_reading("A dog", recognition.transcript, unclear=recognition.unclear)
    assert result['recognition_status'] == 'unclear'
    assert result['transcript'] == ''
    assert result['word_results'] == result['missing_words'] == []
