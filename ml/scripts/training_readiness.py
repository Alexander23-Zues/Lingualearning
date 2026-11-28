"""Read-only training checks. Never claim a job, start training or print secrets."""
import argparse
import csv
import json
import re
from pathlib import Path

from services.inference.app.translation_runtime import verified_manifest, file_sha256
from ml.scripts.prepare_dataset import assign_related_group_keys, assign_splits, normalize

MODELS = {'en_to_fil': 'Helsinki-NLP/opus-mt-en-tl', 'fil_to_en': 'Helsinki-NLP/opus-mt-tl-en'}


def local_foundation(path):
    path = Path(path).resolve()
    manifest = verified_manifest(path)
    if manifest.get('architecture') != 'marian-pair' or manifest.get('foundation_models') != MODELS:
        raise ValueError('Select a verified English-Filipino Marian model pair.')
    revisions = manifest.get('upstream_revisions', {})
    if any(not re.fullmatch(r'[a-f0-9]{40}', str(revisions.get(name, ''))) for name in MODELS.values()):
        raise ValueError('Pinned upstream revisions are required.')
    if any(not (path / direction).is_dir() for direction in MODELS):
        raise ValueError('Both local model directions are required.')
    return manifest


def dataset_summary(path):
    with path.open(encoding='utf-8-sig', newline='') as handle:
        reader = csv.DictReader(handle)
        if not {'english', 'filipino'}.issubset(reader.fieldnames or []):
            raise ValueError('CSV requires english and filipino columns.')
        return pairs_summary(list(reader))


def checked_dataset_manifest(dataset, manifest_path):
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    if manifest.get('files', {}).get(dataset.name) != file_sha256(dataset):
        raise ValueError('Frozen dataset does not match its provenance manifest.')
    if not manifest.get('source_url') or not manifest.get('license'):
        raise ValueError('Dataset source and usage rights are required.')
    return manifest


def pairs_summary(rows, max_pairs=50000):
    """Validate and summarize translation pairs.
    
    Args:
        rows: List of translation pair dictionaries
        max_pairs: Maximum dataset size (default 50000; training resources still need review)
    """
    if not 20 <= len(rows) <= max_pairs:
        raise ValueError(f'Use 20-{max_pairs:,} reviewed bilingual pairs; the smoke-test CSV is not a training corpus.')
    
    # Memory usage estimates for different dataset sizes
    dataset_size = len(rows)
    if dataset_size < 1000:
        memory_estimate = "~2-4 GB RAM"
    elif dataset_size < 5000:
        memory_estimate = "~4-6 GB RAM"
    elif dataset_size < 15000:
        memory_estimate = "~6-10 GB RAM"
    else:
        memory_estimate = "~10-16 GB RAM"
    seen, translations = set(), {}
    cleaned = []
    for row in rows:
        english, filipino = str(row.get('english') or '').strip(), str(row.get('filipino') or '').strip()
        if not english or not filipino or max(len(english), len(filipino)) > 2000:
            raise ValueError('Resolve empty or oversized bilingual pairs.')
        key = normalize(english), normalize(filipino)
        if key in seen or key[0] in translations and translations[key[0]] != key[1]:
            raise ValueError('Resolve duplicate or conflicting translation pairs.')
        seen.add(key)
        translations[key[0]] = key[1]
        cleaned.append({'english': english, 'filipino': filipino})
    assign_related_group_keys(cleaned)
    rows = cleaned
    splits = assign_splits(rows, 42, (.8, .1, .1))
    counts = {name: len(values) for name, values in splits.items()}
    if any(count == 0 for count in counts.values()):
        raise ValueError('Related pairs leave an empty train, validation or test split.')
    return {'unique_pairs': len(rows), 'splits': counts, 'estimated_memory': memory_estimate}


def check(settings, dataset=None):
    import httpx
    from services.api.app.config import supabase_headers
    report = {'ready': False, 'checks': {}, 'blockers': [], 'notes': []}
    try:
        import torch
        from datasets import Dataset
        from transformers import Seq2SeqTrainer
        import sacrebleu
        report['checks']['training_libraries'] = 'available'
        report['checks']['device'] = 'CUDA' if torch.cuda.is_available() else 'CPU'
        if not torch.cuda.is_available():
            report['notes'].append('CPU training is supported but can take hours. No paid GPU is provisioned.')
    except (ImportError, AttributeError, RuntimeError) as error:
        report['blockers'].append(f'Training libraries are incompatible ({type(error).__name__}). Use the project training environment.')
    try:
        manifest = local_foundation(settings.training_base_package_path)
        report['checks']['foundation_version'] = manifest['model_version']
        report['checks']['foundation_artifacts'] = 'checksums verified; both directions available offline'
    except (ValueError, OSError, KeyError) as error:
        report['blockers'].append(f'Local foundation package: {error}')
    if not settings.supabase_url or not settings.supabase_secret_key:
        report['checks']['approved_dataset_candidates'] = 'not checked without worker credential'
        report['blockers'].append('Configure SUPABASE_URL and backend-only SUPABASE_SECRET_KEY in the ignored .env. Never put the secret in Flutter or chat.')
    elif settings.supabase_secret_key.startswith('sb_publishable_'):
        report['blockers'].append('A publishable key cannot run the worker. Use a backend-only secret key.')
    else:
        try:
            with httpx.Client(base_url=settings.supabase_url.rstrip('/') + '/rest/v1/', timeout=20,
                headers=supabase_headers(settings.supabase_secret_key)) as client:
                # This reads the queue schema without claiming or modifying a job.
                queue = client.get('ai_training_jobs', params={'select': 'id', 'limit': '0'})
                queue.raise_for_status()
                response = client.get('workspace_records', params={'kind': 'eq.dataset', 'status': 'eq.published', 'select': 'id,data'})
                response.raise_for_status()
                approved = response.json()
            valid = []
            for row in approved:
                data = row.get('data', {})
                pairs = data.get('pairs', [])
                if not data.get('source_url') or not data.get('license') or not isinstance(pairs, list):
                    continue
                try:
                    pairs_summary([{'english': p.get('en'), 'filipino': p.get('fil')} for p in pairs])
                    valid.append(row['id'])
                except (ValueError, AttributeError):
                    continue
            report['checks']['approved_dataset_candidates'] = len(valid)
            if not valid:
                report['blockers'].append('Upload and approve a licensed English-Filipino CSV in Translation Datasets before queuing a job.')
        except httpx.HTTPError:
            report['blockers'].append('The worker could not read the queue/datasets. Check its backend credential, network and applied migration.')
    if dataset:
        try:
            report['checks']['local_dataset'] = dataset_summary(dataset)
            report['notes'].append('A local CSV check does not publish or approve that dataset in the administrator workspace.')
        except (ValueError, OSError) as error:
            report['blockers'].append(f'Local dataset: {error}')
    report['ready'] = not report['blockers']
    return report


def main():
    from services.api.app.config import Settings
    parser = argparse.ArgumentParser()
    parser.add_argument('--dataset', type=Path, help='Optional candidate CSV to check without uploading it.')
    args = parser.parse_args()
    report = check(Settings(), args.dataset)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    raise SystemExit(0 if report['ready'] else 2)


if __name__ == '__main__':
    main()
