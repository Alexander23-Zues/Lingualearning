import base64
import json

import httpx
import pytest
from dotenv import dotenv_values

from scripts.setup_training_worker import (DATASET_ID, DATASET_SHA256, PROJECT, PROJECT_URL,
    SetupError, ensure_job, inspect_access, normalize_key, save_key)
from services.api.app.config import supabase_headers

KEY = 'sb_secret_' + 'f' * 32


def jwt(role, project=PROJECT):
    claims = base64.urlsafe_b64encode(json.dumps({'role': role, 'ref': project}).encode()).decode().rstrip('=')
    return f'e30.{claims}.fixture'


def record():
    return {'id': DATASET_ID, 'owner_id': '00000000-0000-0000-0000-000000000001', 'status': 'published',
        'data': {'dataset_version': DATASET_SHA256, 'training_scope': 'development only', 'classroom_approved': False,
            'source_url': 'https://example.test/original-fixture', 'license': 'Original fixture',
            'attribution': 'Fixture author', 'pairs': [{'en': f'word {i}', 'fil': f'salita {i}'} for i in range(20)]}}


def test_setup_accepts_only_private_worker_key_types_without_echoing_inputs():
    assert normalize_key('SUPABASE_SECRET_KEY="' + KEY + '"') == KEY
    assert normalize_key(jwt('service_role')) == jwt('service_role')
    for value in ['sb_publishable_' + 'f'*32, jwt('anon'), jwt('authenticated'), jwt('service_role', 'another-project'),
                  'some-password', KEY + '\nANOTHER_SETTING=injected']:
        with pytest.raises(SetupError) as error:
            normalize_key(value)
        assert value not in str(error.value)


def test_saving_key_preserves_other_env_values_and_removes_duplicate_definitions(tmp_path):
    path = tmp_path / '.env'
    path.write_bytes(b'# retained\r\nSUPABASE_URL=https://example.test\r\nexport SUPABASE_SECRET_KEY=old\r\nSUPABASE_SECRET_KEY=duplicate\r\nOTHER="value#with spaces"\r\n')
    save_key(path, KEY)
    values = dotenv_values(path)
    assert values['SUPABASE_SECRET_KEY'] == KEY
    assert values['SUPABASE_URL'] == 'https://example.test'
    assert values['OTHER'] == 'value#with spaces'
    assert path.read_bytes().count(b'SUPABASE_SECRET_KEY=') == 1
    assert b'# retained\r\n' in path.read_bytes()
    assert list(tmp_path.iterdir()) == [path]
    before = path.read_bytes()
    with pytest.raises(SetupError):
        save_key(path, 'not-a-worker-key')
    assert path.read_bytes() == before


def test_live_validation_is_read_only_and_sanitizes_upstream_error_details():
    calls = []
    def rejected(request):
        calls.append((request.method, request.url.path))
        return httpx.Response(401, json={'message': 'sensitive upstream response ' + KEY})
    with httpx.Client(base_url=PROJECT_URL + '/rest/v1/', headers=supabase_headers(KEY),
                      transport=httpx.MockTransport(rejected)) as client:
        with pytest.raises(SetupError) as error:
            inspect_access(client)
    assert KEY not in str(error.value)
    assert calls == [('GET', '/rest/v1/ai_training_jobs')]


def test_setup_freezes_attributed_data_and_reuses_an_existing_job():
    calls = []
    def handler(request):
        calls.append(request)
        if request.url.path.endswith('/workspace_records'):
            return httpx.Response(200, json=[record()])
        if request.url.path.endswith('/profiles'):
            return httpx.Response(200, json=[{'id': record()['owner_id']}])
        if request.url.params.get('limit') == '0':
            return httpx.Response(200, json=[])
        return httpx.Response(200, json=[{'id': 'existing-job', 'status': 'running'}])
    with httpx.Client(base_url=PROJECT_URL + '/rest/v1/', headers=supabase_headers(KEY),
                      transport=httpx.MockTransport(handler)) as client:
        payload = inspect_access(client)
        result = ensure_job(client, payload)
    assert result == {'id': 'existing-job', 'status': 'running', 'reused': True}
    assert payload['dataset_snapshot']['metadata']['attribution'] == 'Fixture author'
    assert payload['dataset_snapshot']['metadata']['classroom_approved'] is False
    assert payload['configuration']['epochs'] == 1
    assert len(payload['dataset_snapshot']['pairs']) == 20
    assert all(request.method == 'GET' for request in calls)
    assert all(request.headers['apikey'] == KEY and 'authorization' not in request.headers for request in calls)


def test_new_job_is_only_reported_queued_after_real_server_acceptance():
    calls = []
    def handler(request):
        calls.append(request)
        if request.method == 'GET':
            return httpx.Response(200, json=[])
        payload = json.loads(request.content)
        assert payload['status'] == 'queued'
        assert 'metrics' not in payload
        return httpx.Response(201, json=[{'id': 'new-job', 'status': 'queued'}])
    with httpx.Client(base_url=PROJECT_URL + '/rest/v1/', transport=httpx.MockTransport(handler)) as client:
        result = ensure_job(client, {'status': 'queued'})
    assert result == {'id': 'new-job', 'status': 'queued', 'reused': False}
    assert [request.method for request in calls] == ['GET', 'POST']


def test_setup_returns_when_background_worker_retains_starter_output_handles(tmp_path, monkeypatch):
    """A persistent child must not keep setup waiting for pipe EOF."""
    import subprocess
    import sys
    from scripts import setup_training_worker as setup
    (tmp_path / '.env').write_text(f'SUPABASE_URL={PROJECT_URL}\n')
    monkeypatch.setattr(setup, 'ROOT', tmp_path)
    monkeypatch.setattr(setup, 'save_key', lambda path, key: None)
    monkeypatch.setattr(setup, 'inspect_access', lambda client: {'status': 'queued'})
    monkeypatch.setattr(setup.shutil, 'which', lambda name: sys.executable)
    real_run = subprocess.run
    # The starter exits, while its background child retains inherited handles.
    starter = 'import subprocess,sys; subprocess.Popen([sys.executable,"-c","import time; time.sleep(2)"]); print("starter exited")'
    def launch_fixture(args, **options):
        options['timeout'] = 1.5
        return real_run([sys.executable, '-c', starter], **options)
    monkeypatch.setattr(setup.subprocess, 'run', launch_fixture)
    updates = []
    setup.configure(KEY, False, lambda phase, message, **values: updates.append((phase, values)))
    assert updates[-1] == ('ready', {'key_saved': True, 'worker_started': True})
