import importlib.util
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from index import app

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('vercel_build', ROOT / 'scripts' / 'build_vercel.py')
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)


def test_deployed_entrypoint_keeps_api_and_auth_guards():
    with TestClient(app) as client:
        assert client.get('/health').json() == {'status': 'ok'}
        assert client.get('/v1/me').status_code == 401
        assert client.post('/v1/admin/datasets/validate').status_code == 401


def test_root_preserves_pkce_callback_on_the_way_to_the_cdn_page():
    with TestClient(app) as client:
        response = client.get('/?code=one-time-test-code', follow_redirects=False)
        assert response.status_code == 307
        assert response.headers['location'] == '/index.html?code=one-time-test-code'


def test_client_config_is_an_allowlist_and_defaults_to_same_origin():
    config = build.public_config({
        'SUPABASE_URL': 'https://example.supabase.co',
        'SUPABASE_PUBLISHABLE_KEY': 'sb_publishable_test',
        'SUPABASE_SECRET_KEY': 'private-server-only-value',
        'INFERENCE_SHARED_SECRET': 'private-model-only-value',
        'DATABASE_PASSWORD': 'private-database-only-value',
    })
    assert config['API_BASE_URL'] == ''
    assert config['AUTH_REDIRECT_URL'] == ''
    assert not any('private-' in value for value in config.values())
    assert set(config) == {'SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','API_BASE_URL','AUTH_REDIRECT_URL','ADMIN_SETUP_EMAIL'}


@pytest.mark.parametrize('override', [
    {'SUPABASE_PUBLISHABLE_KEY': 'sb_secret_do_not_ship'},
    {'SUPABASE_URL': 'http://127.0.0.1:54321'},
    {'API_BASE_URL': 'http://127.0.0.1:8000'},
    {'AUTH_REDIRECT_URL': 'https://owner:password@example.com'},
])
def test_hosted_build_rejects_secrets_and_local_endpoint_overrides(override):
    with pytest.raises(ValueError):
        build.public_config({'SUPABASE_URL':'https://example.supabase.co','SUPABASE_PUBLISHABLE_KEY':'sb_publishable_test',**override})
