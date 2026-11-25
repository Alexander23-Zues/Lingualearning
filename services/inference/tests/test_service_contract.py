import asyncio
import io
import time
import threading
import pytest
from fastapi import HTTPException
import wave
from fastapi.testclient import TestClient
from app import main


def test_private_inference_requires_shared_secret(monkeypatch):
    monkeypatch.setattr(main.settings, 'inference_shared_secret', 'server-only-fixture')
    client = TestClient(main.app)
    response = client.post('/translate', json={'text':'Hello','source_language':'en','target_language':'fil','model_version':'test'})
    assert response.status_code == 401
    response = client.post('/recognize', data={'expected_text':'Hello','language':'en'}, files={'audio': ('clip.wav', b'fixture')})
    assert response.status_code == 401


def test_uninstalled_reading_model_returns_unavailable(monkeypatch):
    monkeypatch.setattr(main.settings, 'inference_shared_secret', 'server-only-fixture')
    monkeypatch.setattr(main, 'reading_runtime', None)
    response = TestClient(main.app).post('/recognize', headers={'X-Inference-Key':'server-only-fixture'},
        data={'expected_text':'Hello','language':'en'}, files={'audio': ('clip.wav', b'fixture')})
    assert response.status_code == 503


def test_missing_activated_manifest_returns_unavailable(monkeypatch, tmp_path):
    monkeypatch.setattr(main.settings, 'inference_shared_secret', 'server-only-fixture')
    monkeypatch.setattr(main.settings, 'model_package_root', tmp_path)
    monkeypatch.setattr(main, 'runtime', None)
    (tmp_path / 'missing-manifest').mkdir()
    response = TestClient(main.app).post('/translate', headers={'X-Inference-Key': 'server-only-fixture'},
        json={'text': 'Hello', 'source_language': 'en', 'target_language': 'fil',
              'model_version': 'missing-manifest', 'model_checksum': '0' * 64})
    assert response.status_code == 503


def test_timeout_does_not_release_cpu_capacity_while_task_is_still_running(monkeypatch):
    async def scenario():
        monkeypatch.setattr(main, 'semaphore', asyncio.Semaphore(1))
        release = threading.Event()
        try:
            with pytest.raises(HTTPException) as error:
                await main.run_bounded(release.wait, 5, timeout=.01)
            assert error.value.status_code == 504
            assert main.semaphore.locked()
        finally:
            release.set()
        # Await the actual completion callback rather than assuming CPU scheduling.
        await asyncio.wait_for(main.semaphore.acquire(), timeout=5)
        main.semaphore.release()
    asyncio.run(scenario())
