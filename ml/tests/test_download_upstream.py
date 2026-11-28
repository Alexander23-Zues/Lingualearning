import hashlib
import io
import json
import pytest
from ml.scripts.download_upstream import download_ranges, download


def fake_ranges(monkeypatch, payload):
    requests = []
    def response(request, **kwargs):
        requested = request.headers['Range']
        start, end = map(int, requested.removeprefix('bytes=').split('-'))
        requests.append(start)
        body = io.BytesIO(payload[start:end + 1])
        body.status = 206
        body.headers = {'Content-Range': f'bytes {start}-{end}/{len(payload)}'}
        return body
    monkeypatch.setattr('urllib.request.urlopen', response)
    return requests


def test_interrupted_transfer_resumes_but_requires_full_upstream_checksum(tmp_path, monkeypatch):
    payload = b'a' * 16 + b'b' * 16 + b'c' * 8
    path = tmp_path / 'model.bin'
    path.with_suffix('.bin.partial').write_bytes(payload[:16] + bytes(24))
    requests = fake_ranges(monkeypatch, payload)
    download_ranges('https://example.test/model', path, len(payload), hashlib.sha256(payload).hexdigest(), chunk=16)
    assert sorted(requests) == [16, 32]
    assert path.read_bytes() == payload


def test_corrupt_resumed_bytes_are_never_promoted(tmp_path, monkeypatch):
    payload = b'a' * 16 + b'b' * 16
    path = tmp_path / 'model.bin'
    partial = path.with_suffix('.bin.partial')
    partial.write_bytes(b'corrupt artifact' + bytes(16))
    fake_ranges(monkeypatch, payload)
    with pytest.raises(ValueError, match='checksum'):
        download_ranges('https://example.test/model', path, len(payload), hashlib.sha256(payload).hexdigest(), chunk=16)
    assert not path.exists()
    assert not partial.exists()


def test_speech_checkpoint_includes_required_plain_text_vocabulary(tmp_path, monkeypatch):
    metadata = {'sha': 'a' * 40, 'siblings': [{'rfilename': 'vocabulary.txt', 'size': 4}]}
    def response(url, **kwargs):
        return io.BytesIO(json.dumps(metadata).encode() if '/api/models/' in url else b'word')
    monkeypatch.setattr('urllib.request.urlopen', response)
    assert download('Systran/faster-whisper-tiny', tmp_path) == 'a' * 40
    assert (tmp_path / 'vocabulary.txt').read_text() == 'word'
