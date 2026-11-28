import asyncio
import hashlib
from types import SimpleNamespace
from uuid import UUID

import httpx
import pytest
from fastapi import HTTPException
from app import offline_retry as retry

OWNER = '00000000-0000-0000-0000-000000000001'
ARCHIVE = UUID('00000000-0000-0000-0000-000000000002')
USER = SimpleNamespace(id=UUID(OWNER))
SETTINGS = SimpleNamespace(supabase_url='https://example.test', supabase_secret_key='synthetic-key')


def run(task):
    return asyncio.run(task)


class Gateway:
    def __init__(self, row):
        self.row = row

    async def _request(self, method, path, **kwargs):
        assert method == 'GET' and path == 'offline_collection_archives'
        assert kwargs['params']['owner_id'] == 'eq.' + OWNER
        return [self.row] if self.row else []


def metadata(data):
    digest = hashlib.sha256(data).hexdigest()
    return {'id': str(ARCHIVE), 'checksum': digest, 'object_path': f'{OWNER}/{ARCHIVE}/{digest}.zip'}


def test_another_owners_archive_is_rejected_before_storage_access(monkeypatch):
    monkeypatch.setattr(retry.transfer, 'service', lambda _: pytest.fail('Storage was accessed before ownership validation'))
    with pytest.raises(HTTPException) as error:
        run(retry.retry_archive(ARCHIVE, USER, Gateway(None), SETTINGS))
    assert error.value.status_code == 404


def test_archive_path_cannot_escape_the_owner(monkeypatch):
    row = metadata(b'synthetic')
    row['object_path'] = row['object_path'].replace(OWNER, str(ARCHIVE), 1)
    monkeypatch.setattr(retry.transfer, 'service', lambda _: pytest.fail('Tampered path reached storage'))
    with pytest.raises(HTTPException) as error:
        run(retry.retry_archive(ARCHIVE, USER, Gateway(row), SETTINGS))
    assert error.value.status_code == 409


@pytest.mark.parametrize('corrupt,oversized', [(False, False), (True, False), (False, True)])
def test_streamed_backup_is_checked_and_reuses_the_normal_importer(monkeypatch, corrupt, oversized):
    expected = b'original synthetic backup'
    data = b'changed' if corrupt else expected
    row = metadata(expected)
    client = httpx.AsyncClient(transport=httpx.MockTransport(lambda request: httpx.Response(200, content=data)))
    monkeypatch.setattr(retry.transfer, 'service', lambda _: SimpleNamespace(client=client))
    if oversized:
        monkeypatch.setattr(retry.transfer, 'MAX_ARCHIVE', len(data) - 1)
    uploads = []

    async def importer(user, upload, gateway, settings):
        assert user is USER and settings is SETTINGS
        assert await upload.read() == expected
        uploads.append(upload)
        return {'activities_added_this_transfer': 0, 'items_needing_review': 1}

    monkeypatch.setattr(retry.transfer, 'import_backup', importer)
    if corrupt or oversized:
        with pytest.raises(HTTPException) as error:
            run(retry.retry_archive(ARCHIVE, USER, Gateway(row), SETTINGS))
        assert error.value.status_code == (413 if oversized else 422)
        assert not uploads
    else:
        result = run(retry.retry_archive(ARCHIVE, USER, Gateway(row), SETTINGS))
        assert result['items_needing_review'] == 1
        assert uploads[0].file.closed
    assert client.is_closed
