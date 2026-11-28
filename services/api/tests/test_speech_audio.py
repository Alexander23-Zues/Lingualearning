import asyncio
import os
import time

import httpx
import pytest

from app.config import Settings
from app import speech_audio as speech


@pytest.fixture(autouse=True)
def clear_speech(monkeypatch):
    speech._memory.clear()
    speech._pending.clear()
    monkeypatch.setattr(speech, '_neural_retry_after', {})
    yield
    speech._memory.clear()
    speech._pending.clear()


def test_duplicate_listens_share_generation_and_saved_audio_survives_memory_reset(monkeypatch, tmp_path):
    calls = []

    async def generate(text, language):
        calls.append((text, language))
        await asyncio.sleep(0)
        return b'neural-mp3', 'audio/mpeg'

    monkeypatch.setattr(speech, 'neural_audio', generate)
    settings = Settings(speech_neural_enabled=True, speech_cache_path=tmp_path, speech_library_path=tmp_path / 'bundled')

    async def scenario():
        first, second = await asyncio.gather(
            speech.speech_audio('aklat', 'fil', settings), speech.speech_audio('aklat', 'fil', settings),
        )
        assert first[:2] == second[:2] == (b'neural-mp3', 'audio/mpeg')
        assert calls == [('aklat', 'fil')]
        assert (await speech.speech_audio('aklat', 'fil', settings))[2] == 'memory'
        speech._memory.clear()
        assert (await speech.speech_audio('aklat', 'fil', settings))[2] == 'saved'
        assert calls == [('aklat', 'fil')]

    asyncio.run(scenario())
    assert all('aklat' not in path.name for path in tmp_path.iterdir())


def test_online_voice_failure_uses_authenticated_local_voice(monkeypatch, tmp_path):
    async def unavailable(*args):
        raise RuntimeError('fixture outage')

    def local_voice(request):
        assert request.headers['X-Inference-Key'] == 'fixture-private-key'
        assert b'"language":"fil"' in request.content
        return httpx.Response(200, content=b'RIFF-fixture', headers={'content-type': 'audio/wav'})

    original_client = httpx.AsyncClient
    monkeypatch.setattr(speech, 'neural_audio', unavailable)
    monkeypatch.setattr(httpx, 'AsyncClient', lambda **kwargs:
                        original_client(transport=httpx.MockTransport(local_voice), **kwargs))
    settings = Settings(speech_neural_enabled=True, inference_shared_secret='fixture-private-key', speech_library_path=tmp_path)
    result = asyncio.run(speech.speech_audio('araw', 'fil', settings))
    assert result == (b'RIFF-fixture', 'audio/wav', 'local')


def test_neural_voice_uses_the_selected_language_and_clear_reading_rate(monkeypatch):
    import edge_tts
    calls = []

    class Communicate:
        def __init__(self, text, voice, rate):
            calls.append((text, voice, rate))

        async def stream(self):
            yield {'type': 'audio', 'data': b'mp3-fixture'}

    monkeypatch.setattr(edge_tts, 'Communicate', Communicate)

    async def scenario():
        await speech.neural_audio('book', 'en')
        await speech.neural_audio('aklat', 'fil')

    asyncio.run(scenario())
    assert calls == [('book', 'en-US-AriaNeural', '-5%'), ('aklat', 'fil-PH-BlessicaNeural', '-5%')]


def test_memory_cache_evicts_audio_above_its_limit():
    speech._remember('first', b'a' * 5_000_000, 'audio/mpeg')
    speech._remember('second', b'b' * 5_000_000, 'audio/mpeg')
    assert list(speech._memory) == ['second']


def test_bundled_recording_works_without_a_provider_and_does_not_expire(monkeypatch, tmp_path):
    async def unavailable(*args):
        raise AssertionError('A bundled recording must not request synthesis.')

    monkeypatch.setattr(speech, 'neural_audio', unavailable)
    key = speech.speech_key('araw', 'fil')
    assert key == 'd7023c2fa527cf67f7f7c4e7165fc389027bbbf320f5db4a395e9066c1d62c6b'
    path = tmp_path / (key + '.mp3')
    path.write_bytes(b'prepared-public-voice')
    old = time.time() - 30 * 24 * 60 * 60
    os.utime(path, (old, old))
    settings = Settings(speech_neural_enabled=True, speech_library_path=tmp_path)
    result = asyncio.run(speech.speech_audio('araw', 'fil', settings))
    assert result == (b'prepared-public-voice', 'audio/mpeg', 'bundled')


def test_outage_for_english_does_not_disable_neural_filipino(monkeypatch, tmp_path):
    calls = []

    async def generate(text, language):
        calls.append(language)
        if language == 'en':
            raise TimeoutError()
        return b'neural-filipino', 'audio/mpeg'

    original_client = httpx.AsyncClient
    monkeypatch.setattr(speech, 'neural_audio', generate)
    monkeypatch.setattr(httpx, 'AsyncClient', lambda **kwargs: original_client(
        transport=httpx.MockTransport(lambda request: httpx.Response(
            200, content=b'local-english', headers={'content-type': 'audio/wav'},
        )), **kwargs))
    settings = Settings(speech_neural_enabled=True, speech_library_path=tmp_path)

    async def scenario():
        assert (await speech.speech_audio('Read a word', 'en', settings))[2] == 'local'
        assert (await speech.speech_audio('Basahin ang salita', 'fil', settings))[2] == 'neural'
        assert (await speech.speech_audio('Listen to another word', 'en', settings))[2] == 'local'

    asyncio.run(scenario())
    assert calls == ['en', 'fil']


def test_old_local_clip_is_regenerated_when_online_voice_is_available(monkeypatch, tmp_path):
    text = 'Maniwala ka sa sarili mo, dahil kaya mo ito.'
    key = speech.speech_key(text, 'fil')
    past = time.time() - speech.LOCAL_VOICE_MAX_AGE - 1
    clip = tmp_path / (key + '.wav')
    clip.write_bytes(b'old-local-audio')
    os.utime(clip, (past, past))
    speech._memory[key] = (b'old-local-audio', 'audio/wav', past)

    async def generate(sentence, language):
        assert (sentence, language) == (text, 'fil')
        return b'new-neural-filipino', 'audio/mpeg'

    monkeypatch.setattr(speech, 'neural_audio', generate)
    settings = Settings(speech_neural_enabled=True, speech_cache_path=tmp_path,
                        speech_library_path=tmp_path / 'bundled')
    assert asyncio.run(speech.speech_audio(text, 'fil', settings)) == (
        b'new-neural-filipino', 'audio/mpeg', 'neural',
    )


def test_reading_voice_generates_from_text_even_when_other_audio_exists(monkeypatch, tmp_path):
    text = 'Maniwala ka sa sarili mo, dahil kaya mo ito.'
    key = speech.speech_key(text, 'fil')
    (tmp_path / (key + '.mp3')).write_bytes(b'other-voice')
    speech._remember(key, b'old-fallback', 'audio/wav')

    async def generate(sentence, language, *, natural):
        assert (sentence, language, natural) == (text, 'fil', True)
        return b'generated-from-text', 'audio/mpeg'

    monkeypatch.setattr(speech, 'neural_audio', generate)
    settings = Settings(speech_neural_enabled=True, speech_library_path=tmp_path)
    assert asyncio.run(speech.speech_audio(text, 'fil', settings, natural=True)) == (
        b'generated-from-text', 'audio/mpeg', 'generated-reading',
    )


def test_reading_voice_failure_never_enters_the_local_voice_path(monkeypatch, tmp_path):
    from fastapi import HTTPException

    async def unavailable(*args, **kwargs):
        raise TimeoutError

    async def unexpected(*args, **kwargs):
        pytest.fail('Reading Practice must not play another voice when generation fails.')

    monkeypatch.setattr(speech, 'neural_audio', unavailable)
    monkeypatch.setattr(speech, '_generate', unexpected)
    settings = Settings(speech_neural_enabled=True, speech_library_path=tmp_path)
    with pytest.raises(HTTPException) as info:
        asyncio.run(speech.speech_audio('Mabuting kaibigan', 'fil', settings, natural=True))
    assert info.value.status_code == 503
    assert 'try Listen again' in info.value.detail
