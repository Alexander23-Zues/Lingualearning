"""Create and start a quick 5K training job"""
import csv
import hashlib
import json
import httpx
import os
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv

# Load environment
load_dotenv()

# Configuration
SUPABASE_URL = os.getenv('SUPABASE_URL', 'https://jdtgakguokulcuirnzkw.supabase.co')
SUPABASE_SECRET = os.getenv('SUPABASE_SECRET_KEY', '')

if not SUPABASE_SECRET:
    raise ValueError("SUPABASE_SECRET_KEY not found in .env file")

ROOT = Path(__file__).resolve().parents[2]
CSV_PATH = ROOT / "ml/data/school_en_fil_5k_clean.csv"

def create_dataset_and_job():
    # Read the 5K dataset
    print(f"Reading dataset from {CSV_PATH}...")
    pairs = []
    with open(CSV_PATH, 'r', encoding='utf-8', newline='') as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Strip any BOM or whitespace from keys
            clean_row = {k.strip('\ufeff').strip(): v for k, v in row.items()}
            pairs.append({
                'english': clean_row.get('english', ''),
                'filipino': clean_row.get('filipino', ''),
                'source': clean_row.get('source', ''),
                'license': clean_row.get('license', ''),
                'category': clean_row.get('category', ''),
                'reviewer_notes': clean_row.get('reviewer_notes', '')
            })
    
    print(f"Loaded {len(pairs)} translation pairs")
    
    # Create checksum
    checksum = hashlib.sha256(
        json.dumps(pairs, ensure_ascii=False, sort_keys=True).encode()
    ).hexdigest()
    print(f"Dataset checksum: {checksum[:16]}...")
    
    # Create HTTP client with proper authentication
    # Use both apikey and Authorization headers with the service key
    headers = {
        'apikey': SUPABASE_SECRET,
        'Authorization': f'Bearer {SUPABASE_SECRET}',
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
    }
    
    client = httpx.Client(base_url=f"{SUPABASE_URL}/rest/v1/", headers=headers, timeout=120)
    
    try:
        # Create dataset record
        print("\nCreating dataset record in Supabase...")
        dataset_payload = {
            'owner_id': 'dfeda6dd-3b77-404b-bcd2-88f173560b9a',  # System/admin user
            'title': 'School English-Filipino 5K Quick Training CLEAN',
            'kind': 'dataset',
            'status': 'published',
            'data': {
                'pairs': pairs,
                'checksum': checksum,
                'source': 'Educational corpus compilation (CC BY-SA 4.0)',
                'license': 'CC BY-SA 4.0',
                'metadata': {
                    'name': 'School English-Filipino 5K Quick Training Dataset',
                    'description': 'First 5,000 pairs from school_en_fil_25k_deduped.csv for quick training',
                    'pair_count': len(pairs),
                    'categories': ['Basic Communication', 'Classroom', 'Vocabulary'],
                    'created_for': 'fast-track training under 1 hour'
                }
            }
        }
        
        response = client.post('workspace_records', json=dataset_payload)
        print(f"Response status: {response.status_code}")
        if response.status_code >= 400:
            print(f"Error response: {response.text[:500]}")
        response.raise_for_status()
        print("Response received, parsing JSON...")
        dataset_record = response.json()[0]
        dataset_id = dataset_record['id']
        print(f"[OK] Dataset record created: {dataset_id}")
        
        # Create training job with quick-large profile
        print("\nCreating training job with quick-large profile...")
        job_payload = {
            'created_by': 'dfeda6dd-3b77-404b-bcd2-88f173560b9a',
            'dataset_record_id': dataset_id,
            'dataset_snapshot': dataset_record['data'],
            'configuration': {
                'profile': 'quick-large',
                'description': '5K pairs, 1 epoch, optimized for speed'
            },
            'status': 'queued'
        }
        
        response = client.post('ai_training_jobs', json=job_payload)
        print(f"Response status: {response.status_code}")
        if response.status_code >= 400:
            print(f"Error response: {response.text[:500]}")
        response.raise_for_status()
        job = response.json()[0]
        job_id = job['id']
        
        print(f"[OK] Training job created: {job_id}")
        print(f"\nJob Configuration:")
        print(f"  - Profile: quick-large")
        print(f"  - Dataset: {len(pairs)} pairs")
        print(f"  - Expected time: 30-60 minutes")
        print(f"  - Estimated steps: ~312 (5000 pairs ÷ 4 batch ÷ 4 accumulation)")
        print(f"\nJob is pending and ready for worker to pick up!")
        
        return {
            'dataset_id': dataset_id,
            'job_id': job_id,
            'pair_count': len(pairs)
        }
        
    finally:
        client.close()

if __name__ == '__main__':
    result = create_dataset_and_job()
    print(f"\n{'='*60}")
    print(f"SUCCESS: Training job ready!")
    print(f"Dataset ID: {result['dataset_id']}")
    print(f"Job ID: {result['job_id']}")
    print(f"Pairs: {result['pair_count']}")
    print(f"{'='*60}")
