"""Release-package recovery and deployment-contract checks; no network or cloud writes."""
import importlib.util
import json
from pathlib import Path
import sys

import pytest


REPOSITORY = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("release_packager", REPOSITORY / "deploy/prepare_upload.py")
packager = importlib.util.module_from_spec(spec)
spec.loader.exec_module(packager)
LEGACY = b'{"build":{"builder":"DOCKERFILE"},"deploy":{"healthcheckPath":"/ready"}}\n'


@pytest.fixture
def source(tmp_path):
    root = tmp_path / "source"
    root.mkdir()
    for name in packager.ROOT_FILES:
        (root / name).write_text("fixture\n", encoding="utf-8")
    (root / "Dockerfile").write_text("FROM fixture\nARG INCLUDE_SCHOOL_VOICES=false\n", encoding="utf-8")
    for name in packager.DIRECTORIES:
        (root / name).mkdir(parents=True, exist_ok=True)
        (root / name / "source.txt").write_text("public fixture\n", encoding="utf-8")
    for name in packager.EXTRA_FILES:
        file = root / name
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text("public fixture\n", encoding="utf-8")
    (root / "deploy/release.gitignore").write_text("**/.env\n", encoding="utf-8")
    (root / "deploy/legacy").mkdir()
    (root / "deploy/legacy/railway.json.disabled").write_bytes(LEGACY)
    (root / "apps/linguakids_web/public").mkdir()
    (root / "apps/linguakids_web/public/config.json").write_text("private local fixture\n", encoding="utf-8")
    (root / "apps/linguakids_web/.env").write_text("PRIVATE_FIXTURE=do-not-copy\n", encoding="utf-8")
    (root / "apps/linguakids_web/node_modules").mkdir()
    (root / "apps/linguakids_web/node_modules/local.txt").write_text("runtime cache\n", encoding="utf-8")
    return root


def run_package(monkeypatch, source, target, *flags):
    monkeypatch.setattr(packager, "ROOT", source)
    monkeypatch.setattr(sys, "argv", ["prepare_upload", "--output", str(target), *flags])
    packager.main()


def test_retired_legacy_file_never_becomes_active_and_local_settings_stay_private(monkeypatch, source, tmp_path):
    target = tmp_path / "release"
    docker_before = (source / "Dockerfile").read_bytes()
    run_package(monkeypatch, source, target, "--include-school-voices")
    assert not (target / "railway.json").exists()
    assert (target / "deploy/legacy/railway.json.disabled").read_bytes() == LEGACY
    assert "ARG INCLUDE_SCHOOL_VOICES=true" in (target / "Dockerfile").read_text(encoding="utf-8")
    assert (source / "Dockerfile").read_bytes() == docker_before
    assert not (target / "apps/linguakids_web/public/config.json").exists()
    assert not (target / "apps/linguakids_web/.env").exists()
    assert not (target / "apps/linguakids_web/node_modules").exists()
    assert (target / ".railway/railway.ts").is_file()


def test_school_voice_option_preserves_an_already_enabled_release(monkeypatch, source, tmp_path):
    original = b"FROM fixture\nARG INCLUDE_SCHOOL_VOICES=true\n"
    (source / "Dockerfile").write_bytes(original)
    target = tmp_path / "release"
    run_package(monkeypatch, source, target, "--include-school-voices")
    assert (target / "Dockerfile").read_bytes() == original


def test_ordinary_release_retains_its_voice_default(monkeypatch, source, tmp_path):
    original = (source / "Dockerfile").read_bytes()
    target = tmp_path / "release"
    run_package(monkeypatch, source, target)
    assert (target / "Dockerfile").read_bytes() == original


@pytest.mark.parametrize("flags,active_legacy", [((), True), (("--after-iac-cutover",), False)])
def test_older_checkout_requires_explicit_cutover_to_omit_its_active_file(monkeypatch, source, tmp_path, flags, active_legacy):
    (source / "railway.json").write_bytes(LEGACY)
    target = tmp_path / "release"
    run_package(monkeypatch, source, target, *flags)
    assert (target / "railway.json").exists() is active_legacy


@pytest.mark.parametrize("arguments", ["", "ARG INCLUDE_SCHOOL_VOICES=unknown\n",
    "ARG INCLUDE_SCHOOL_VOICES=false\nARG INCLUDE_SCHOOL_VOICES=true\n"])
def test_ambiguous_school_voice_configuration_fails_instead_of_silently_omitting_models(monkeypatch, source, tmp_path, arguments):
    (source / "Dockerfile").write_text("FROM fixture\n" + arguments, encoding="utf-8")
    with pytest.raises(RuntimeError, match="school voice build argument"):
        run_package(monkeypatch, source, tmp_path / "release", "--include-school-voices")


def test_preparation_never_replaces_an_existing_output(monkeypatch, source, tmp_path):
    target = tmp_path / "existing"
    target.mkdir()
    sentinel = target / "important.txt"
    sentinel.write_bytes(b"retain existing files")
    with pytest.raises(SystemExit):
        run_package(monkeypatch, source, target)
    assert sentinel.read_bytes() == b"retain existing files"


def test_preparation_refuses_output_inside_its_source(monkeypatch, source):
    with pytest.raises(SystemExit):
        run_package(monkeypatch, source, source / "release")
    assert not (source / "release").exists()


def test_repository_has_no_active_legacy_railway_file():
    assert not (REPOSITORY / "railway.json").exists()
    assert not (REPOSITORY / "railway.toml").exists()
    archived = json.loads((REPOSITORY / "deploy/legacy/railway.json.disabled").read_text(encoding="utf-8"))
    assert archived["build"]["builder"] == "DOCKERFILE"
    assert archived["deploy"]["healthcheckPath"] == "/ready"

