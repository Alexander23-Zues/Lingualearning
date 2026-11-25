from types import SimpleNamespace

from fastapi import Depends, FastAPI, HTTPException
from fastapi.testclient import TestClient

from app import security
from app.config import Settings, get_settings


def test_request_clients_close_after_success_and_handler_error(monkeypatch):
    clients = []

    class Gateway:
        def __init__(self, settings, user_token=None):
            self.token = user_token
            self.closed = 0
            self.client = SimpleNamespace(aclose=self.close)
            clients.append(self)

        async def close(self):
            self.closed += 1

    monkeypatch.setattr(security, 'SupabaseGateway', Gateway)
    app = FastAPI()
    app.dependency_overrides[get_settings] = lambda: Settings(supabase_url='https://example.test')

    @app.get('/fixture/{fails}')
    async def endpoint(fails: bool, gateway=Depends(security.get_gateway)):
        if fails:
            raise HTTPException(409, 'Synthetic request failure')
        return {'ok': True}

    with TestClient(app) as client:
        assert client.get('/fixture/false', headers={'Authorization': 'Bearer scoped-fixture'}).status_code == 200
        assert client.get('/fixture/true', headers={'Authorization': 'Bearer scoped-fixture'}).status_code == 409
    assert len(clients) == 2
    assert all(value.token == 'scoped-fixture' and value.closed == 1 for value in clients)
