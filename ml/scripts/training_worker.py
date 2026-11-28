"""Separate, single-job CPU/GPU worker. Never run inside a web request."""
import argparse
import csv
import hashlib
import json
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
import httpx
from services.api.app.config import Settings, supabase_headers
from ml.scripts.training_readiness import local_foundation, pairs_summary

ROOT = Path(__file__).resolve().parents[2]

# Training configuration profiles
TRAINING_PROFILES = {
    'quick': {
        'epochs': 1,
        'batch_size': 4,
        'description': 'Fast training for testing (1 epoch, larger batches)',
        'recommended_for': 'development and validation'
    },
    'standard': {
        'epochs': 3,
        'batch_size': 2,
        'description': 'Balanced training quality and time (3 epochs)',
        'recommended_for': 'general use with 500-2000 pairs'
    },
    'quality': {
        'epochs': 5,
        'batch_size': 2,
        'description': 'Higher quality training (5 epochs, more iterations)',
        'recommended_for': 'production models with 1000+ pairs'
    },
    'quick-large': {
        'epochs': 1,
        'batch_size': 2,
        'description': 'Fast training for large datasets (1 epoch, optimized for 10k+ pairs)',
        'recommended_for': '10k+ pairs, estimated 1-2 hours on CPU'
    },
    'standard-large': {
        'epochs': 3,
        'batch_size': 2,
        'description': 'Balanced training for large datasets (3 epochs, optimized for 10k-25k pairs)',
        'recommended_for': '10k-25k pairs, estimated 4-8 hours on CPU'
    },
    'quality-large': {
        'epochs': 5,
        'batch_size': 1,
        'description': 'High quality training for very large datasets (5 epochs, 25k+ pairs)',
        'recommended_for': '25k+ pairs, estimated 12-20 hours on CPU'
    }
}


def verified_pairs(snapshot):
    pairs = snapshot['pairs']
    if not isinstance(pairs, list) or not 20 <= len(pairs) <= 50000:
        raise ValueError('Dataset must contain 20–50,000 reviewed pairs.')
    checksum = hashlib.sha256(json.dumps(pairs, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
    if checksum != snapshot.get('checksum'):
        raise ValueError('Frozen dataset checksum mismatch.')
    if not snapshot.get('source') or not snapshot.get('license'):
        raise ValueError('Frozen dataset provenance is missing.')
    pairs_summary(pairs, max_pairs=50000)
    return pairs


class Worker:
    def __init__(self, settings, output):
        if not settings.supabase_url or not settings.supabase_secret_key:
            raise ValueError('Worker needs backend-only Supabase URL and secret key.')
        self.base_package = Path(settings.training_base_package_path).resolve()
        local_foundation(self.base_package)
        self.client = httpx.Client(base_url=settings.supabase_url + '/rest/v1/', timeout=30,
            headers=supabase_headers(settings.supabase_secret_key))
        self.output = output.resolve()
        self.output.mkdir(parents=True, exist_ok=True)

    def update(self, job_id, **fields):
        fields['lease_expires_at'] = (datetime.now(timezone.utc) + timedelta(minutes=2)).isoformat()
        self.client.patch('ai_training_jobs', params={'id': f'eq.{job_id}', 'status': 'eq.running'}, json=fields).raise_for_status()

    def process(self, job):
        from uuid import UUID
        identifier = str(UUID(job['id']))
        directory = self.output / identifier
        
        # Create or reuse job directory
        directory.mkdir(exist_ok=True)
        dataset = directory / 'approved.csv'
        config = job['configuration']
        
        # Support training profiles or custom configuration
        profile = config.get('profile')
        if profile and profile in TRAINING_PROFILES:
            profile_config = TRAINING_PROFILES[profile]
            epochs, batch = profile_config['epochs'], profile_config['batch_size']
            print(f"Using {profile} profile: {profile_config['description']}")
        else:
            epochs, batch = int(config.get('epochs', 3)), int(config.get('batch_size', 2))
        
        if not 1 <= epochs <= 20 or not 1 <= batch <= 16:
            raise ValueError('Unsupported configuration.')
        
        # Only create dataset and manifest if they don't exist
        if not dataset.exists():
            pairs = verified_pairs(job['dataset_snapshot'])
            
            # Adjust gradient accumulation for large datasets
            gradient_accumulation = 4
            if len(pairs) >= 15000:
                gradient_accumulation = 8
                print(f"Large dataset detected ({len(pairs)} pairs). Doubling gradient accumulation to {gradient_accumulation} for memory efficiency.")
            
            with dataset.open('w', encoding='utf-8', newline='') as handle:
                writer = csv.DictWriter(handle, fieldnames=['english','filipino'])
                writer.writeheader()
                writer.writerows({k: str(r[k]) for k in writer.fieldnames} for r in pairs)
            dataset_manifest = directory / 'dataset-manifest.json'
            provenance = job['dataset_snapshot']
            from services.inference.app.translation_runtime import file_sha256
            dataset_manifest.write_text(json.dumps({
                'source_url': provenance['source'], 'license': provenance['license'],
                'review_required': True, 'dataset_record_id': job['dataset_record_id'],
                'metadata': provenance.get('metadata', {}),
                'files': {dataset.name: file_sha256(dataset)},
            }, indent=2), encoding='utf-8')
        else:
            # Dataset exists, read size to determine gradient_accumulation
            with open(dataset, 'r', encoding='utf-8') as f:
                import csv as csv_module
                reader = csv_module.DictReader(f)
                pairs_count = sum(1 for _ in reader)
            gradient_accumulation = 8 if pairs_count >= 15000 else 4
            dataset_manifest = directory / 'dataset-manifest.json'
        commands = [
            [sys.executable, '-m', 'ml.scripts.train_pair', '--dataset', str(dataset), '--dataset-manifest', str(dataset_manifest), '--output', str(directory / 'run'), '--epochs', str(epochs), '--batch-size', str(batch), '--base-package', str(self.base_package), '--gradient-accumulation', str(gradient_accumulation)],
            [sys.executable, '-m', 'ml.scripts.evaluate_package', '--package', str(directory / 'run/package'), '--test-csv', str(directory / 'run/held_out.csv'), '--output', str(directory / 'evaluation.json')],
        ]
        with (directory / 'worker.log').open('w', encoding='utf-8') as log:
            for phase, command in zip(['training','evaluation'], commands):
                self.update(identifier, progress={'phase': phase})
                process = subprocess.Popen(command, cwd=ROOT, stdout=log, stderr=subprocess.STDOUT, shell=False)
                started = time.monotonic()
                try:
                    while process.poll() is None:
                        progress_file = directory / 'run/progress.json'
                        progress = json.loads(progress_file.read_text()) if phase == 'training' and progress_file.exists() else {'phase': phase}
                        self.update(identifier, progress=progress)
                        if time.monotonic() - started > 24 * 3600:
                            raise TimeoutError('Training exceeded the 24-hour worker limit.')
                        time.sleep(5)
                    if process.returncode:
                        raise RuntimeError(f'{phase} exited with code {process.returncode}. Inspect the private worker log for details.')
                finally:
                    if process.poll() is None:
                        process.terminate()
                        try:
                            process.wait(timeout=20)
                        except subprocess.TimeoutExpired:
                            process.kill()
                            process.wait()
        manifest = directory / 'run/package/manifest.json'
        self.update(identifier, status='completed', completed_at=datetime.now(timezone.utc).isoformat(),
            progress={'phase': 'completed'}, metrics=json.loads((directory / 'evaluation.json').read_text()),
            artifact={'package_manifest': json.loads(manifest.read_text()), 'checksum': file_sha256(manifest),
                      'worker_relative_directory': identifier, 'review_required': True})

    def once(self):
        response = self.client.post('rpc/claim_ai_training_job', json={})
        response.raise_for_status()
        job = response.json()
        if job:
            try:
                self.process(job)
            except Exception as error:
                self.update(job['id'], status='failed', completed_at=datetime.now(timezone.utc).isoformat(),
                    error=f'{type(error).__name__}: {str(error)[:800]}')
        return job is not None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, default=ROOT / 'ml/outputs/jobs')
    parser.add_argument('--once', action='store_true')
    args = parser.parse_args()
    worker = Worker(Settings(), args.output)
    try:
        while True:
            worker.once()
            if args.once:
                break
            time.sleep(10)
    finally:
        worker.client.close()


if __name__ == '__main__':
    main()
