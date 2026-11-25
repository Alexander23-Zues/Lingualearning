"""Audit the frozen public training input and its held-out boundaries."""
import csv
import hashlib
import json
from pathlib import Path

import pytest

from ml.scripts.prepare_dataset import load_rows, assign_splits, normalize
from ml.scripts.prepare_public_dataset import eligible, prepare

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / 'ml/data/public'


def read(path):
    with path.open(encoding='utf-8', newline='') as handle:
        return list(csv.DictReader(handle))


def test_frozen_pilot_preserves_attributed_source_and_training_test_boundary():
    source = PUBLIC / 'tatoeba-v2023-04-12'
    pilot = PUBLIC / 'tatoeba-development-pilot-v1'
    candidates = {row['source_line']: row for row in read(source / 'candidate.csv')}
    manifest = json.loads((pilot / 'manifest.json').read_text())
    assert manifest['classroom_approved'] is False
    assert manifest['human_review_pending'] is True
    assert manifest['upstream_training_overlap'] == 'unknown'
    assert manifest['license'] == 'CC BY 2.0 FR'
    for filename, checksum in manifest['files'].items():
        assert hashlib.sha256((pilot / filename).read_bytes()).hexdigest() == checksum
    rows = load_rows(pilot / 'pilot.csv')
    assert len(rows) == 192
    smoke = {normalize(row[key]) for row in read(ROOT / 'ml/data/classroom_smoke_test.csv')
             for key in ('english', 'filipino')}
    for row in rows:
        original = candidates[row['source_line']]
        for key in ('english', 'filipino', 'source', 'license', 'pair_id'):
            assert row[key] == original[key]
        assert not {normalize(row['english']), normalize(row['filipino'])} & smoke
    # Reproduce the trainer's actual split, not just the exported file labels.
    splits = assign_splits(rows, 42, (.8, .1, .1))
    assert {name: len(values) for name, values in splits.items()} == {'train': 154, 'validation': 19, 'test': 19}
    seen = set()
    for name, values in splits.items():
        assert [r['pair_id'] for r in values] == [r['pair_id'] for r in read(pilot / f'{name}.csv')]
        sides = {normalize(row[key]) for row in values for key in ('english', 'filipino')}
        assert not seen & sides
        seen.update(sides)


def test_public_import_rejects_wrong_release_and_obvious_unsafe_content(tmp_path):
    archive = tmp_path / 'untrusted.zip'
    archive.write_bytes(b'not the pinned public source')
    with pytest.raises(ValueError, match='pinned'):
        prepare(archive, tmp_path / 'output')
    assert not (tmp_path / 'output').exists()
    assert eligible('I read a book.', 'Nagbabasa ako ng libro.')
    assert not eligible('I kill a bird.', 'Pumatay ako ng ibon.')
    assert not eligible('Email the school.', 'Sumulat sa person@example.test')
    assert not eligible('Read this link.', 'https://example.test/school')
