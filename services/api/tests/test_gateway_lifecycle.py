from types import SimpleNamespace
from unittest.mock import AsyncMock
import asyncio

from fastapi import Depends, FastAPI, HTTPException
from fastapi.testclient import TestClient

from app import security
from app.config import Settings, get_settings
from app.gateway import SupabaseGateway


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


def test_registered_grade_teacher_needs_no_manual_approval_but_retired_accounts_stay_blocked():
    async def scenario():
        gateway = SupabaseGateway(Settings(), user_token='synthetic-user-token')
        profile = {'id': '00000000-0000-0000-0000-000000000022', 'email': 'teacher@fixture.invalid',
                   'name': 'Synthetic teacher', 'role': 'educator', 'status': 'active',
                   'account_kind': 'teacher', 'registered_grade': 2, 'grade_levels': [2],
                   'teacher_approved_at': None, 'retired_at': None}
        try:
            gateway._request = AsyncMock(return_value=[profile])
            assert (await gateway.profile(profile['id'])).grade_levels == [2]
            gateway._request = AsyncMock(return_value=[{**profile, 'registered_grade': None}])
            assert await gateway.profile(profile['id']) is None
            gateway._request = AsyncMock(return_value=[{**profile, 'retired_at': '2026-11-25T00:00:00Z'}])
            assert await gateway.profile(profile['id']) is None
        finally:
            await gateway.client.aclose()
    asyncio.run(scenario())
