"""Authenticated AI workflows. Heavy inference/training stays outside this API."""
import hashlib
import io
import json
import re
import wave
from typing import Annotated, Literal
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field, ConfigDict

from .config import Settings, get_settings
from .gateway import SupabaseGateway
from .models import CurrentUser
from .speech_audio import speech_audio
from .security import current_user, administrator, get_gateway, student_learning_state

router = APIRouter(prefix='/v1/ai', tags=['ai'])


class TrainingRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    dataset_record_id: UUID
    epochs: int = Field(default=3, ge=1, le=20)
    batch_size: int = Field(default=2, ge=1, le=16)


@router.get('/history')
async def history(user: Annotated[CurrentUser, Depends(current_user)],
                  gateway=Depends(get_gateway)):
    return await gateway._request('GET', 'ai_translation_history', params={
        'created_by': f'eq.{user.id}', 'order': 'created_at.desc', 'limit': '50',
        'select': 'id,source_text,translation,source_language,target_language,model_version,created_at'})


@router.get('/jobs')
async def jobs(user: Annotated[CurrentUser, Depends(administrator)], gateway=Depends(get_gateway)):
    return await gateway._request('GET', 'ai_training_jobs', params={
        'select': 'id,status,created_at,started_at,completed_at,progress,metrics,error,artifact,configuration',
        'order': 'created_at.desc', 'limit': '50'})


@router.post('/jobs', status_code=202)
async def queue_job(payload: TrainingRequest, user: Annotated[CurrentUser, Depends(administrator)],
                    gateway=Depends(get_gateway)):
    rows = await gateway._request('GET', 'workspace_records', params={
        'id': f'eq.{payload.dataset_record_id}', 'kind': 'eq.dataset', 'status': 'eq.published'})
    if not rows:
        raise HTTPException(422, 'Select a reviewed dataset approved for training.')
    data = rows[0]['data']
    pairs = data.get('pairs', [])
    source_url = data.get('source_url') or data.get('source')
    if not isinstance(source_url, str) or not source_url.strip() or not data.get('license'):
        raise HTTPException(422, 'Add the dataset source and license in AI Tools → Datasets.')
    if not isinstance(pairs, list) or len(pairs) > 50000:
        raise HTTPException(422, 'Use a dataset with a list of at most 50,000 input pairs.')
    targets = {}
    frozen = []
    for row, pair in enumerate(pairs, start=1):
        en = pair.get('en', pair.get('english')) if isinstance(pair, dict) else None
        fil = pair.get('fil', pair.get('filipino')) if isinstance(pair, dict) else None
        en = en.strip() if isinstance(en, str) else ''
        fil = fil.strip() if isinstance(fil, str) else ''
        if not en or not fil or max(len(en), len(fil)) > 2000:
            raise HTTPException(422, f'Dataset pair {row} needs English and Filipino text of 1–2,000 characters each.')
        source, target = (' '.join(text.casefold().split()) for text in (en, fil))
        if source in targets:
            previous_target, previous_row = targets[source]
            if previous_target != target:
                raise HTTPException(
                    422,
                    f'Dataset pairs {previous_row} and {row} have different Filipino translations for '
                    f'“{en[:120]}”. Review both in AI Tools → Datasets, then try again.',
                )
            continue
        targets[source] = target, row
        frozen.append({'english': en, 'filipino': fil})
    if not 20 <= len(frozen) <= 50000:
        raise HTTPException(422, f'Training needs 20–50,000 unique reviewed pairs. This dataset has {len(frozen):,}.')
    checksum = hashlib.sha256(json.dumps(frozen, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
    return (await gateway._request('POST', 'ai_training_jobs', headers={'Prefer': 'return=representation'}, json={
        'created_by': str(user.id), 'dataset_record_id': str(payload.dataset_record_id),
        'dataset_snapshot': {'pairs': frozen, 'source': source_url, 'license': data['license'], 'checksum': checksum,
            'metadata': {key: data[key] for key in ('attribution', 'license_url', 'modifications', 'review_notes', 'classroom_approved', 'source_archive_sha256', 'dataset_version', 'purpose') if key in data}},
        'configuration': {'epochs': payload.epochs, 'batch_size': payload.batch_size}, 'status': 'queued'}))[0]


async def recognize_audio(audio: UploadFile, expected_text: str, language: str, settings: Settings):
    if language not in {'en', 'fil'} or not 1 <= len(expected_text.strip()) <= 300 or not re.search(r'\w', expected_text):
        raise HTTPException(422, 'Choose English or Filipino and 1–300 characters to read.')
    if not settings.inference_shared_secret:
        raise HTTPException(503, 'Reading recognition is not configured yet.')
    try:
        data = await audio.read(1_500_001)
        if not data or len(data) > 1_500_000:
            raise HTTPException(413, 'Record at most 45 seconds (1.5 MB).')
        try:
            with wave.open(io.BytesIO(data), 'rb') as clip:
                if clip.getnchannels() != 1 or clip.getsampwidth() != 2 or clip.getframerate() != 16000 or not 0 < clip.getnframes() <= 720000:
                    raise ValueError()
        except (wave.Error, EOFError, ValueError):
            raise HTTPException(422, 'Use mono 16-bit, 16 kHz WAV audio.')
        async with httpx.AsyncClient(timeout=65) as client:
            response = await client.post(f'{settings.inference_base_url}/recognize',
                headers={'X-Inference-Key': settings.inference_shared_secret},
                data={'expected_text': expected_text, 'language': language},
                files={'audio': ('reading.wav', data, 'audio/wav')})
        if response.status_code in {422, 429, 503, 504}:
            raise HTTPException(response.status_code, 'Reading recognition is unavailable or busy. Please try again later.')
        response.raise_for_status()
        return response.json()
    except httpx.RequestError as error:
        raise HTTPException(503, 'Reading recognition is temporarily unavailable.') from error
    except httpx.HTTPStatusError as error:
        raise HTTPException(502, 'Reading service could not process the recording.') from error
    finally:
        await audio.close()


@router.post('/reading')
async def reading(user: Annotated[CurrentUser, Depends(current_user)], audio: UploadFile = File(...),
                  expected_text: str = Form(...), language: str = Form(...),
                  save_attempt: bool = Form(False), gateway=Depends(get_gateway), settings=Depends(get_settings)):
    result = await recognize_audio(audio, expected_text, language, settings)
    if (save_attempt and result.get('recognition_status') not in {'no_speech', 'unclear'}
            and result.get('transcript', '').strip()):
        await gateway._request('POST', 'ai_reading_attempts', json={
            'created_by': str(user.id), 'language': language,
            'expected_word_count': result['expected_word_count'],
            'matched_word_count': len(result['matched_words']), 'missing_word_count': len(result['missing_words'])})
    return result


@router.post('/student-reading')
async def student_reading(audio: UploadFile = File(...), expected_text: str = Form(...),
                          language: str = Form(...), student_token: str = Form(...),
                          adventure_step_id: str | None = Form(None), page_index: int = Form(0),
                          part_index: int = Form(0), settings=Depends(get_settings)):
    # Never forward an adult JWT. Reading evidence stores counts, not recordings/transcripts.
    await student_learning_state(student_token, settings)
    if adventure_step_id is None:
        return await recognize_audio(audio, expected_text, language, settings)
    if not 1 <= len(adventure_step_id) <= 120 or page_index < 0 or part_index < 0:
        raise HTTPException(422, 'Choose the current story reading part.')
    gateway = SupabaseGateway(settings)
    context = {'p_token': student_token, 'p_step_id': adventure_step_id,
               'p_page': page_index, 'p_part': part_index}
    try:
        canonical = await gateway._request('POST', 'rpc/adventure_reading_context', json=context)
        if language != 'en' or expected_text.strip() != canonical['text']:
            raise HTTPException(422, 'Read the English story part shown in your current adventure.')
        result = await recognize_audio(audio, canonical['text'], 'en', settings)
        progress = await gateway._request('POST', 'rpc/adventure_record_reading',
                                         json={**context, 'p_result': result})
        return {**result, 'adventure_evidence': progress}
    except httpx.HTTPStatusError as error:
        if error.response.status_code < 500:
            raise HTTPException(409, 'This story part is locked or changed. Reopen your adventure map.') from error
        raise HTTPException(503, 'Could not save the reading check. Keep your recording and retry.') from error
    except httpx.RequestError as error:
        raise HTTPException(503, 'Could not save the reading check. Keep your recording and retry.') from error
    finally:
        await gateway.client.aclose()


class SpeakRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    text: str = Field(min_length=1, max_length=300)
    language: Literal['en', 'fil']
    natural: bool = False


class StudentSpeakRequest(SpeakRequest):
    student_token: str = Field(min_length=64, max_length=64)


@router.post('/student-speak')
async def student_speak(payload: StudentSpeakRequest, settings=Depends(get_settings)):
    await student_learning_state(payload.student_token, settings)
    return await speak(SpeakRequest(text=payload.text, language=payload.language, natural=payload.natural), None, settings)


@router.post('/speak')
async def speak(payload: SpeakRequest, user: Annotated[CurrentUser, Depends(current_user)],
                settings=Depends(get_settings)):
    """Proxy TTS requests to inference service with authentication."""
    if not payload.natural and not settings.inference_shared_secret:
        raise HTTPException(503, 'Text-to-speech service is not configured.')
    try:
        data, media_type, source = await speech_audio(payload.text, payload.language, settings, natural=payload.natural)
        from fastapi.responses import Response
        return Response(content=data, media_type=media_type, headers={
            'X-Speech-Source': source, 'Cache-Control': 'private, no-store',
        })
    except httpx.RequestError as error:
        raise HTTPException(503, 'Text-to-speech service is temporarily unavailable.') from error
    except httpx.HTTPStatusError as error:
        if error.response.status_code == 422:
            raise HTTPException(422, error.response.json().get('detail', 'Check the text before listening.')) from error
        if error.response.status_code in {429, 503, 504}:
            raise HTTPException(503, 'The speech service is busy. Wait a moment and try Listen again.') from error
        raise HTTPException(502, 'Text-to-speech service rejected the request.') from error
