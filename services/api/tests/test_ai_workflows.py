import io
import wave
import pytest
import httpx
from app.models import AccountRole
from app.config import Settings, get_settings
from app.security import get_gateway
from test_api import client_for, FakeGateway


class AiGateway(FakeGateway):
    def __init__(self, pairs=None):
        super().__init__()
        self.calls = []
        self.pairs = pairs

    async def _request(self, method, path, **kwargs):
        self.calls.append((method, path, kwargs))
        if path == 'workspace_records':
            return [{'data': {'pairs': self.pairs, 'license': 'Original test fixture', 'source_url': 'Original fixture'}}] if self.pairs is not None else []
        if path == 'ai_training_jobs' and method == 'POST':
            return [{'id': 'queued-test-job', **kwargs['json']}]
        return []


def test_educator_cannot_start_or_read_training_jobs():
    client, _ = client_for(AccountRole.educator)
    assert client.get('/v1/ai/jobs').status_code == 403
    assert client.post('/v1/ai/jobs', json={'dataset_record_id': '00000000-0000-0000-0000-000000000001'}).status_code == 403


def test_admin_queues_frozen_dataset_without_starting_a_process():
    client, _ = client_for(AccountRole.administrator)
    gateway = AiGateway([{'en': f'word {i}', 'fil': f'salita {i}'} for i in range(20)])
    client.app.dependency_overrides[get_gateway] = lambda: gateway
    result = client.post('/v1/ai/jobs', json={'dataset_record_id': '00000000-0000-0000-0000-000000000001'})
    assert result.status_code == 202
    assert result.json()['status'] == 'queued'
    assert len(result.json()['dataset_snapshot']['pairs']) == 20
    assert 'metrics' not in result.json()
    assert result.json()['configuration'] == {'epochs': 3, 'batch_size': 2}


def test_queued_snapshot_preserves_dataset_license_attribution_and_review_scope():
    client, _ = client_for(AccountRole.administrator)
    class ProvenanceGateway(AiGateway):
        async def _request(self, method, path, **kwargs):
            response = await super()._request(method, path, **kwargs)
            if path == 'workspace_records':
                response[0]['data'].update({'attribution': 'Original fixture author',
                    'classroom_approved': False, 'purpose': 'development only',
                    'review_notes': 'Text screening complete; educator approval pending.'})
            return response
    gateway = ProvenanceGateway([{'en': f'word {i}', 'fil': f'salita {i}'} for i in range(20)])
    client.app.dependency_overrides[get_gateway] = lambda: gateway
    result = client.post('/v1/ai/jobs', json={'dataset_record_id': '00000000-0000-0000-0000-000000000001'})
    assert result.status_code == 202
    metadata = result.json()['dataset_snapshot']['metadata']
    assert metadata['attribution'] == 'Original fixture author'
    assert metadata['classroom_approved'] is False
    assert metadata['purpose'] == 'development only'


@pytest.mark.parametrize('pairs', [[], [{'en':'book','fil':'aklat'}]*20])
def test_training_rejects_small_or_duplicate_dataset(pairs):
    client, _ = client_for(AccountRole.administrator)
    client.app.dependency_overrides[get_gateway] = lambda: AiGateway(pairs)
    assert client.post('/v1/ai/jobs', json={'dataset_record_id': '00000000-0000-0000-0000-000000000001'}).status_code == 422


@pytest.mark.parametrize('source_key,target_key', [('en', 'fil'), ('english', 'filipino')])
def test_training_skips_duplicate_rows_without_changing_the_saved_dataset(source_key, target_key):
    client, _ = client_for(AccountRole.administrator)
    pairs = [{source_key: f'word {i}', target_key: f'salita {i}'} for i in range(20)]
    pairs.append({source_key: '  WORD  0  ', target_key: ' SALITA 0 '})
    class LegacyGateway(AiGateway):
        async def _request(self, method, path, **kwargs):
            response = await super()._request(method, path, **kwargs)
            if path == 'workspace_records' and source_key == 'english':
                data = response[0]['data']
                data['source'] = data.pop('source_url')
            return response
    gateway = LegacyGateway(pairs)
    client.app.dependency_overrides[get_gateway] = lambda: gateway
    result = client.post('/v1/ai/jobs', json={'dataset_record_id': '00000000-0000-0000-0000-000000000001'})
    assert result.status_code == 202
    assert len(pairs) == 21
    assert result.json()['dataset_snapshot']['pairs'] == [
        {'english': pair[source_key], 'filipino': pair[target_key]} for pair in pairs[:20]
    ]


def test_training_conflict_names_both_pairs_and_does_not_queue():
    client, _ = client_for(AccountRole.administrator)
    gateway = AiGateway([{'en': 'read a book', 'fil': 'magbasa ng libro'},
                         {'en': 'Read  a book', 'fil': 'magbasa ng liham'}])
    client.app.dependency_overrides[get_gateway] = lambda: gateway
    result = client.post('/v1/ai/jobs', json={'dataset_record_id': '00000000-0000-0000-0000-000000000001'})
    assert result.status_code == 422
    assert 'pairs 1 and 2' in result.json()['detail']
    assert 'AI Tools → Datasets' in result.json()['detail']
    assert [method for method, _, _ in gateway.calls] == ['GET']


def test_history_query_is_scoped_to_the_authenticated_adult():
    client, _ = client_for(AccountRole.educator)
    gateway = AiGateway()
    client.app.dependency_overrides[get_gateway] = lambda: gateway
    assert client.get('/v1/ai/history').status_code == 200
    assert gateway.calls[-1][2]['params']['created_by'].startswith('eq.')


def test_reading_refuses_audio_when_service_unconfigured():
    client, _ = client_for(AccountRole.educator)
    client.app.dependency_overrides[get_settings] = lambda: Settings(inference_shared_secret='')
    result = client.post('/v1/ai/reading', data={'language':'en', 'expected_text':'Read a book'}, files={'audio': ('test.wav', b'no-audio', 'audio/wav')})
    assert result.status_code == 503


def test_invalid_audio_never_reaches_the_inference_service():
    client, _ = client_for(AccountRole.educator)
    client.app.dependency_overrides[get_settings] = lambda: Settings(inference_shared_secret='fixture')
    result = client.post('/v1/ai/reading', data={'language':'en', 'expected_text':'Read a book'}, files={'audio': ('test.wav', b'not wav', 'audio/wav')})
    assert result.status_code == 422


def test_ai_worker_disconnect_returns_retryable_error(monkeypatch):
    original_client = httpx.AsyncClient

    def disconnect(request):
        raise httpx.RemoteProtocolError('worker disconnected', request=request)

    monkeypatch.setattr(httpx, 'AsyncClient', lambda **kwargs:
        original_client(transport=httpx.MockTransport(disconnect), **kwargs))
    client, _ = client_for(AccountRole.educator)
    client.app.dependency_overrides[get_settings] = lambda: Settings(inference_shared_secret='fixture')
    audio = io.BytesIO()
    with wave.open(audio, 'wb') as sample:
        sample.setparams((1, 2, 16000, 0, 'NONE', 'not compressed'))
        sample.writeframes(b'\x00\x00' * 1600)
    reading = client.post('/v1/ai/reading', data={'language': 'en', 'expected_text': 'Hello'},
                          files={'audio': ('test.wav', audio.getvalue(), 'audio/wav')})
    speech = client.post('/v1/ai/speak', json={'language': 'en', 'text': 'Hello'})
    for reply in (reading, speech):
        assert reply.status_code == 503
        assert 'temporarily unavailable' in reply.json()['detail']


def test_chunk_size_limit_applies_before_multipart_processing():
    client, _ = client_for(AccountRole.educator)
    result = client.post('/v1/ai/reading', content=b'x'*1_600_001, headers={'content-type':'application/octet-stream'})
    assert result.status_code == 413


def test_child_reading_requires_a_scoped_session():
    client, _ = client_for(AccountRole.educator)
    result = client.post('/v1/ai/student-reading', data={'student_token': 'invalid', 'language':'en', 'expected_text':'Hello'}, files={'audio': ('test.wav', b'no-audio')})
    assert result.status_code == 403


@pytest.mark.parametrize('service_status, expected_status, message', [
    (403, 403, 'reopen your learning profile'),
    (500, 503, 'temporarily unavailable'),
    (429, 503, 'temporarily unavailable'),
    (None, 503, 'temporarily unavailable'),
])
def test_student_ai_reports_expired_sessions_and_outages_separately(
    monkeypatch, service_status, expected_status, message,
):
    original_client = httpx.AsyncClient

    def handle(request):
        assert request.url.path == '/rest/v1/rpc/student_learning_state'
        assert request.headers['apikey'] == 'sb_publishable_fixture'
        assert 'authorization' not in request.headers
        if service_status is None:
            raise httpx.ReadTimeout('fixture connection failure', request=request)
        return httpx.Response(service_status, json={})

    monkeypatch.setattr(httpx, 'AsyncClient', lambda **kwargs:
        original_client(transport=httpx.MockTransport(handle), **kwargs))
    client, _ = client_for(AccountRole.educator)
    client.app.dependency_overrides[get_settings] = lambda: Settings(
        supabase_url='https://login.example.invalid', supabase_publishable_key='sb_publishable_fixture',
    )
    token = 'a' * 64
    for response in (
        client.post('/v1/student-translation', json={'text': 'Hello', 'source_language': 'en',
                    'target_language': 'fil', 'student_token': token}),
        client.post('/v1/ai/student-speak', json={'text': 'Hello', 'language': 'en', 'student_token': token}),
        client.post('/v1/ai/student-reading', data={'expected_text': 'Hello', 'language': 'en',
                    'student_token': token}, files={'audio': ('sample.wav', b'fixture')}),
    ):
        assert response.status_code == expected_status
        assert message in response.json()['detail']


@pytest.mark.parametrize('save', [False, True])
def test_reading_retains_only_opt_in_counts(monkeypatch, save):
    from app import ai_routes
    async def recognized(*args):
        return {'transcript': 'private spoken words', 'expected_word_count': 3,
                'matched_words': ['private', 'words'], 'missing_words': ['spoken'],
                'assessment_type': 'reading_recognition', 'pronunciation_assessment_available': False}
    monkeypatch.setattr(ai_routes, 'recognize_audio', recognized)
    client, _ = client_for(AccountRole.educator)
    gateway = AiGateway()
    client.app.dependency_overrides[get_gateway] = lambda: gateway
    result = client.post('/v1/ai/reading', data={'language': 'en', 'expected_text': 'private spoken words',
        'save_attempt': str(save).lower()}, files={'audio': ('clip.wav', b'fixture')})
    assert result.status_code == 200
    assert result.json()['pronunciation_assessment_available'] is False
    writes = [call for call in gateway.calls if call[0] == 'POST']
    assert len(writes) == int(save)
    if save:
        assert set(writes[0][2]['json']) == {'created_by', 'language', 'expected_word_count',
                                           'matched_word_count', 'missing_word_count'}


@pytest.mark.parametrize('status', ['no_speech', 'unclear'])
def test_unscored_recording_never_saves_an_attempt(monkeypatch, status):
    from app import ai_routes

    async def unscored(*args):
        return {'transcript': 'uncertain words' if status == 'unclear' else '',
                'recognition_status': status, 'speech_detected': status == 'unclear'}

    monkeypatch.setattr(ai_routes, 'recognize_audio', unscored)
    client, _ = client_for(AccountRole.educator)
    gateway = AiGateway()
    client.app.dependency_overrides[get_gateway] = lambda: gateway
    response = client.post('/v1/ai/reading', data={'language': 'fil', 'expected_text': 'Magandang umaga.',
        'save_attempt': 'true'}, files={'audio': ('clip.wav', b'fixture')})
    assert response.status_code == 200
    assert response.json()['recognition_status'] == status
    assert not any(call[0] == 'POST' for call in gateway.calls)
