import importlib.util
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('react_build', ROOT / 'scripts/build_react.py')
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)


def test_browser_config_retains_only_public_fields():
    config = build.public_config({'SUPABASE_URL': 'https://fixture.supabase.co',
        'SUPABASE_PUBLISHABLE_KEY': 'sb_publishable_fixture', 'SUPABASE_SECRET_KEY': 'private-do-not-ship',
        'INFERENCE_SHARED_SECRET': 'private-model', 'DATABASE_PASSWORD': 'private-db'})
    assert set(config) == {'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'API_BASE_URL', 'AUTH_REDIRECT_URL', 'ADMIN_SETUP_EMAIL'}
    assert 'private-' not in str(config)


def test_local_browser_config_accepts_only_loopback_http():
    values = {'SUPABASE_URL': 'https://fixture.supabase.co', 'SUPABASE_PUBLISHABLE_KEY': 'sb_publishable_fixture',
              'API_BASE_URL': 'http://127.0.0.1:8010', 'AUTH_REDIRECT_URL': 'http://localhost:3000'}
    assert build.public_config(values, hosted=False)['AUTH_REDIRECT_URL'] == 'http://localhost:3000'
    with pytest.raises(ValueError):
        build.public_config(values, hosted=True)
    with pytest.raises(ValueError):
        build.public_config({**values, 'API_BASE_URL': 'http://public.example'}, hosted=False)


@pytest.mark.parametrize('key', ['sb_secret_fixture', 'service-role-jwt', ''])
def test_client_build_rejects_private_or_unknown_key_types(key):
    with pytest.raises(ValueError):
        build.public_config({'SUPABASE_URL': 'https://fixture.supabase.co', 'SUPABASE_PUBLISHABLE_KEY': key})


def test_old_preview_http_address_redirects_to_connected_app_preserving_callback_query(tmp_path):
    import functools
    from http.server import ThreadingHTTPServer
    import threading
    from urllib.error import HTTPError
    from urllib.request import HTTPRedirectHandler, build_opener
    module_spec=importlib.util.spec_from_file_location('entry_server',ROOT/'scripts/serve_preview.py')
    module=importlib.util.module_from_spec(module_spec)
    module_spec.loader.exec_module(module)
    server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(module.PreviewHandler,directory=str(tmp_path)))
    server.app_name='linguakids-connected-entry'
    class NoRedirect(HTTPRedirectHandler):
        def redirect_request(self,*args,**kwargs):return None
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    try:
        opener=build_opener(NoRedirect())
        with pytest.raises(HTTPError) as result:
            opener.open(f'http://127.0.0.1:{server.server_port}/?code=fixture-recovery',timeout=5)
        assert result.value.code==307
        assert result.value.headers['Location']=='http://localhost:3000/?code=fixture-recovery'
        # Location has no fragment, so the browser retains its existing hash route.
        assert '#' not in result.value.headers['Location']
    finally:
        server.shutdown();server.server_close();thread.join(timeout=2)
