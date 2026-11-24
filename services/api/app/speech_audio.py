"""Prepare language-specific speech and reuse bounded audio files across requests."""
import asyncio
from collections import OrderedDict
import hashlib
import json
import logging
import os
from pathlib import Path
import tempfile
import time

import httpx
from fastapi import HTTPException

VOICE_VERSION = 'neural-classroom-v1'
VOICES = {'en': 'en-US-AriaNeural', 'fil': 'fil-PH-BlessicaNeural'}
READING_VOICES = {'en': 'en-US-AriaNeural', 'fil': 'fil-PH-AngeloNeural'}
READING_VOICE_UNAVAILABLE = 'The reading voice is unavailable. Check your internet connection and try Listen again.'
MAX_DISK_BYTES = 128 * 1024 * 1024
MAX_MEMORY_BYTES = 8 * 1024 * 1024
MAX_AUDIO_BYTES = 2 * 1024 * 1024
MAX_AGE = 7 * 24 * 60 * 60
LOCAL_VOICE_MAX_AGE = 60
_memory = OrderedDict()
_pending = {}
_neural_retry_after = {}
logger = logging.getLogger(__name__)


def speech_key(text, language, natural=False):
    version = 'generated-reading-v1' if natural else VOICE_VERSION
    voice = (READING_VOICES if natural else VOICES)[language]
    identity = json.dumps([version, voice, ' '.join(text.split())], ensure_ascii=False, separators=(',', ':'))
    return hashlib.sha256(identity.encode()).hexdigest()


def _remember(key, data, media_type):
    _memory[key] = (data, media_type, time.time())
    _memory.move_to_end(key)
    while len(_memory) > 128 or sum(len(item[0]) for item in _memory.values()) > MAX_MEMORY_BYTES:
        _memory.popitem(last=False)


def _read_file(root, key, max_age=MAX_AGE, *, wav_max_age=None):
    for suffix, media_type in (('.mp3', 'audio/mpeg'), ('.wav', 'audio/wav')):
        path = root / (key + suffix)
        age_limit = wav_max_age if suffix == '.wav' and wav_max_age is not None else max_age
        try:
            if (age_limit is None or time.time() - path.stat().st_mtime < age_limit) and 0 < path.stat().st_size <= MAX_AUDIO_BYTES:
                return path.read_bytes(), media_type
        except FileNotFoundError:
            continue
    return None


def _save_file(root, key, data, media_type):
    root.mkdir(parents=True, exist_ok=True)
    suffix = '.wav' if media_type.startswith('audio/wav') else '.mp3'
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=root, prefix='.audio-', delete=False) as handle:
            temporary = Path(handle.name)
            handle.write(data)
        os.replace(temporary, root / (key + suffix))
        files = sorted((path for path in root.iterdir() if path.suffix in {'.mp3', '.wav'}), key=lambda path: path.stat().st_mtime)
        total = sum(path.stat().st_size for path in files)
        for path in files:
            if total <= MAX_DISK_BYTES and time.time() - path.stat().st_mtime < MAX_AGE:
                break
            size = path.stat().st_size
            path.unlink(missing_ok=True)
            total -= size
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


async def neural_audio(text, language, *, natural=False):
    import edge_tts
    audio = bytearray()
    voice = (READING_VOICES if natural else VOICES)[language]
    rate = '+0%' if natural else '-5%'
    async for chunk in edge_tts.Communicate(text, voice, rate=rate).stream():
        if chunk['type'] == 'audio':
            audio.extend(chunk['data'])
            if len(audio) > MAX_AUDIO_BYTES:
                raise ValueError('Speech response exceeds its audio limit.')
    if not audio:
        raise ValueError('Speech provider returned no audio.')
    return bytes(audio), 'audio/mpeg'


async def _generate(text, language, settings):
    if settings.speech_neural_enabled and time.monotonic() >= _neural_retry_after.get(language, 0):
        try:
            audio = await asyncio.wait_for(neural_audio(text, language), timeout=4)
            _neural_retry_after.pop(language, None)
            return *audio, 'neural'
        except Exception as error:
            # Retain local synthesis when the online voice provider is unavailable.
            _neural_retry_after[language] = time.monotonic() + 60
            logger.warning('Online speech unavailable (%s), using local voice.', type(error).__name__)
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            f'{settings.inference_base_url}/v1/ai/speak',
            headers={'X-Inference-Key': settings.inference_shared_secret},
            json={'text': text, 'language': language},
        )
    response.raise_for_status()
    data, media_type = response.content, response.headers.get('content-type', 'audio/mpeg')
    if not data or len(data) > MAX_AUDIO_BYTES or not media_type.startswith('audio/'):
        raise HTTPException(502, 'The speech service returned invalid audio.')
    return data, media_type, 'local'


async def _prepare(key, text, language, settings, natural):
    if natural:
        try:
            data, media_type = await asyncio.wait_for(neural_audio(text, language, natural=True), timeout=8)
        except Exception as error:
            logger.warning('Reading voice unavailable (%s).', type(error).__name__)
            raise HTTPException(503, READING_VOICE_UNAVAILABLE) from error
        _remember(key, data, media_type)
        return data, media_type, 'generated-reading'

    library = settings.speech_library_path or Path(__file__).resolve().parents[3] / 'apps/linguakids_web/public/voices'
    bundled = await asyncio.to_thread(_read_file, library, key, None)
    if bundled:
        _remember(key, *bundled)
        return *bundled, 'bundled'
    if settings.speech_cache_path:
        try:
            saved = await asyncio.to_thread(
                _read_file, settings.speech_cache_path, key,
                wav_max_age=LOCAL_VOICE_MAX_AGE if settings.speech_neural_enabled else None,
            )
            if saved:
                _remember(key, *saved)
                return *saved, 'saved'
        except OSError:
            logger.warning('Saved speech could not be read. Regenerating audio.')
    data, media_type, source = await _generate(text, language, settings)
    _remember(key, data, media_type)
    if settings.speech_cache_path:
        try:
            await asyncio.to_thread(_save_file, settings.speech_cache_path, key, data, media_type)
        except OSError:
            logger.warning('Speech generated successfully but could not be saved to disk.')
    return data, media_type, source


async def speech_audio(text, language, settings, *, natural=False):
    text = ' '.join(text.split())
    if not text:
        raise HTTPException(422, 'Enter a word or sentence to listen.')
    if natural and not settings.speech_neural_enabled:
        raise HTTPException(503, READING_VOICE_UNAVAILABLE)
    key = speech_key(text, language, natural)
    saved = _memory.get(key)
    if saved:
        is_local_voice = saved[1].startswith('audio/wav')
        age_limit = LOCAL_VOICE_MAX_AGE if is_local_voice and settings.speech_neural_enabled else MAX_AGE
        if time.time() - saved[2] < age_limit:
            _memory.move_to_end(key)
            return saved[0], saved[1], 'memory'
    if key not in _pending:
        if len(_pending) >= 16:
            raise HTTPException(429, 'The speech service is busy. Please try Listen again.')
        task = asyncio.create_task(_prepare(key, text, language, settings, natural))
        _pending[key] = task
        def complete(finished):
            _pending.pop(key, None)
            if not finished.cancelled():
                finished.exception()
        task.add_done_callback(complete)
    return await asyncio.shield(_pending[key])
