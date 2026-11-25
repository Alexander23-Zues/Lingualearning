import hashlib
import json
import pytest
from ml.scripts.training_readiness import MODELS, local_foundation, pairs_summary, dataset_summary, checked_dataset_manifest


def test_readiness_requires_three_nonoverlapping_usable_splits():
    pairs = [{'english': f'source {i}', 'filipino': f'target {i}'} for i in range(20)]
    summary = pairs_summary(pairs)
    assert summary['unique_pairs'] == 20
    assert summary['splits'] == {'train': 16, 'validation': 2, 'test': 2}
    assert summary['estimated_memory'] == '~2-4 GB RAM'
    # Every target is shared: grouping must keep them in one split, not leak it.
    for row in pairs:
        row['filipino'] = 'one shared target'
    with pytest.raises(ValueError, match='empty'):
        pairs_summary(pairs)


def test_readiness_rejects_smoke_data_duplicates_and_conflicts():
    pairs = [{'english': f'source {i}', 'filipino': f'target {i}'} for i in range(20)]
    with pytest.raises(ValueError, match='20-50,000'):
        pairs_summary(pairs[:15])
    with pytest.raises(ValueError, match='duplicate'):
        pairs_summary(pairs + [pairs[0]])
    with pytest.raises(ValueError, match='conflicting'):
        pairs_summary(pairs + [{'english': 'source 0', 'filipino': 'another target'}])


def test_local_foundation_cannot_silently_use_unverified_or_wrong_models(tmp_path):
    files = {}
    for direction in MODELS:
        path = tmp_path / direction / 'config.json'
        path.parent.mkdir()
        path.write_bytes(b'fixture')
        files[path.relative_to(tmp_path).as_posix()] = hashlib.sha256(b'fixture').hexdigest()
    manifest = {'model_version': 'test-base', 'architecture': 'marian-pair', 'foundation_models': MODELS,
                'upstream_revisions': {name: 'a' * 40 for name in MODELS.values()}, 'files': files}
    target = tmp_path / 'manifest.json'
    target.write_text(json.dumps(manifest))
    assert local_foundation(tmp_path)['model_version'] == 'test-base'
    manifest['upstream_revisions'] = {}
    target.write_text(json.dumps(manifest))
    with pytest.raises(ValueError, match='Pinned'):
        local_foundation(tmp_path)
    manifest['architecture'] = 'different-model'
    target.write_text(json.dumps(manifest))
    with pytest.raises(ValueError, match='Marian'):
        local_foundation(tmp_path)


def test_csv_check_rejects_wrong_columns(tmp_path):
    path = tmp_path / 'candidate.csv'
    path.write_text('en,fil\nbook,aklat\n')
    with pytest.raises(ValueError, match='english and filipino'):
        dataset_summary(path)


def test_training_preserves_only_checksum_matched_dataset_provenance(tmp_path):
    dataset = tmp_path / 'pilot.csv'
    dataset.write_text('english,filipino\nHello,Kumusta\n')
    manifest = tmp_path / 'manifest.json'
    manifest.write_text(json.dumps({'source_url': 'https://example.test/source', 'license': 'CC BY 2.0 FR',
        'files': {'pilot.csv': hashlib.sha256(dataset.read_bytes()).hexdigest()}, 'classroom_approved': False}))
    assert checked_dataset_manifest(dataset, manifest)['classroom_approved'] is False
    dataset.write_text('edited after source review')
    with pytest.raises(ValueError, match='provenance'):
        checked_dataset_manifest(dataset, manifest)
