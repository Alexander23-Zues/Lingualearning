"""Resume a private saved backup after a teacher resolves reading evidence."""
import hashlib
import re
import tempfile
from typing import Annotated
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, UploadFile

from . import offline_transfer as transfer
from .config import Settings, get_settings, supabase_headers
from .models import CurrentUser
from .security import educator, get_gateway

router = APIRouter(prefix='/v1/offline', tags=['offline'])


@router.post('/archives/{archive_id}/retry')
async def retry_archive(
    archive_id: UUID,
    user: Annotated[CurrentUser, Depends(educator)],
    gateway=Depends(get_gateway),
    settings: Settings = Depends(get_settings),
):
    if transfer.transfer_lock.locked():
        raise HTTPException(429, 'Another backup is being checked. Try again shortly.')
    rows = await gateway._request('GET', 'offline_collection_archives', params={
        'id': 'eq.' + str(archive_id), 'owner_id': 'eq.' + str(user.id),
        'select': 'id,object_path,checksum',
    })
    if not rows:
        raise HTTPException(404, 'Backup not found in this educator account.')
    archive = rows[0]
    checksum, path = archive.get('checksum', ''), archive.get('object_path', '')
    if not re.fullmatch(r'[a-f0-9]{64}', checksum) or not re.fullmatch(
        re.escape(str(user.id)) + r'/[a-f0-9-]{36}/' + checksum + r'\.zip', path
    ):
        raise HTTPException(409, 'Backup identity could not be verified. Keep the original ZIP.')
    try:
        UUID(path.split('/')[1])
    except ValueError as error:
        raise HTTPException(409, 'Backup identity could not be verified.') from error

    backend = transfer.service(settings)
    try:
        # Large backups spill to a temporary file instead of occupying model RAM.
        with tempfile.SpooledTemporaryFile(max_size=8 * 1024 * 1024, mode='w+b') as saved:
            digest, size = hashlib.sha256(), 0
            async with backend.client.stream(
                'GET', settings.supabase_url + '/storage/v1/object/offline-collections/' + path,
                headers=supabase_headers(settings.supabase_secret_key), timeout=120,
            ) as response:
                response.raise_for_status()
                async for chunk in response.aiter_bytes(chunk_size=1024 * 1024):
                    size += len(chunk)
                    if size > transfer.MAX_ARCHIVE:
                        raise HTTPException(413, 'Backup is too large. Keep the original ZIP.')
                    digest.update(chunk)
                    saved.write(chunk)
            if digest.hexdigest() != checksum:
                raise HTTPException(422, 'Backup checksum failed. Keep the original ZIP.')
            saved.seek(0)
            # Reuse exactly the original ownership, grade, sequence, answer and
            # idempotency checks. Neither exported scores nor AI flags grant credit.
            return await transfer.import_backup(
                user, UploadFile(file=saved, filename='private-backup.zip', size=size),
                gateway, settings,
            )
    except httpx.HTTPError as error:
        raise HTTPException(503, 'The saved backup could not be checked. Keep the original ZIP and retry.') from error
    finally:
        await backend.client.aclose()
