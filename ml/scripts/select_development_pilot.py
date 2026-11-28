"""Freeze explicitly screened source rows for local development, never publication."""
import argparse
import csv
import hashlib
import json
from pathlib import Path
from ml.scripts.prepare_dataset import load_rows, assign_splits
from ml.scripts.prepare_public_dataset import FIELDS
from ml.scripts.training_readiness import pairs_summary


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--selection', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    manifest = json.loads((args.source / 'manifest.json').read_text())
    candidate = args.source / 'candidate.csv'
    if hashlib.sha256(candidate.read_bytes()).hexdigest() != manifest['files']['candidate.csv']:
        raise ValueError('Source candidate checksum mismatch.')
    selection = json.loads(args.selection.read_text())
    lines = selection['source_lines']
    if len(set(lines)) != len(lines):
        raise ValueError('Duplicate selection IDs.')
    rows = [row for row in csv.DictReader(candidate.open(encoding='utf-8')) if int(row['source_line']) in lines]
    if len(rows) != len(lines):
        raise ValueError('Some selected source rows are missing.')
    summary = pairs_summary(rows)
    if args.output.exists():
        raise FileExistsError('Choose a new immutable development dataset directory.')
    args.output.mkdir(parents=True)
    for row in rows:
        row['reviewer_notes'] = 'Codex text-screened development pilot; qualified educator curriculum approval pending.'
    target = args.output / 'pilot.csv'
    def write(path, values):
        with path.open('w', encoding='utf-8', newline='') as handle:
            writer = csv.DictWriter(handle, fieldnames=FIELDS, extrasaction='ignore')
            writer.writeheader()
            writer.writerows(values)
    write(target, rows)
    splits = assign_splits(load_rows(target), 42, (.8, .1, .1))
    for name, values in splits.items():
        write(args.output / f'{name}.csv', values)
    report = {**manifest, 'dataset': 'LinguaKids Tatoeba development pilot', 'source_candidate_sha256': manifest['files']['candidate.csv'],
        'review': selection, 'summary': summary, 'purpose': 'local engineering and preliminary adaptation only',
        'files': {path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in args.output.glob('*.csv')}}
    (args.output / 'manifest.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'summary': summary, 'classroom_approved': False, 'output': str(target)}, indent=2))


if __name__ == '__main__':
    main()
