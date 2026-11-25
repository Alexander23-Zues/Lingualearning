import hashlib
import json
import sys

import pytest

from ml.scripts.package_model import main


def test_package_manifest_is_portable_and_verifies_each_file(tmp_path, monkeypatch, capsys):
    model = tmp_path / 'model'
    model.mkdir()
    (model / 'config.json').write_text('{"model_type":"fixture"}', encoding='utf-8')
    (model / 'model.safetensors').write_bytes(b'fixture-only')
    package = tmp_path / 'package'
    monkeypatch.setattr(sys, 'argv', [
        'package_model.py', '--model-dir', str(model), '--output-dir', str(package),
        '--dataset-version', 'fixture-data', '--model-version', 'fixture-v1',
    ])
    main()
    manifest_file = package / 'manifest.json'
    manifest = json.loads(manifest_file.read_text(encoding='utf-8'))
    assert set(manifest['files']) == {'model/config.json', 'model/model.safetensors'}
    for name, checksum in manifest['files'].items():
        assert hashlib.sha256((package / name).read_bytes()).hexdigest() == checksum
    assert capsys.readouterr().out.strip() == hashlib.sha256(manifest_file.read_bytes()).hexdigest()
    with pytest.raises(FileExistsError):
        main()
