"""Create training job using existing 5K dataset"""
import os as _os
from pathlib import Path as _EnvironmentPath
from dotenv import load_dotenv as _load_environment
_load_environment(_EnvironmentPath(__file__).resolve().parents[2] / '.env', override=False)

import httpx
import sys

SUPABASE_URL = "https://jdtgakguokulcuirnzkw.supabase.co"
SUPABASE_SECRET = _os.environ["SUPABASE_SECRET_KEY"]
DATASET_ID = "3eec2642-8f4e-4bae-85e1-af16c00261d9"

headers = {
    'apikey': SUPABASE_SECRET,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
}

client = httpx.Client(base_url=f"{SUPABASE_URL}/rest/v1/", headers=headers, timeout=120)

try:
    # Get dataset record
    print(f"Fetching dataset {DATASET_ID}...")
    response = client.get(f'workspace_records?select=*&id=eq.{DATASET_ID}')
    response.raise_for_status()
    dataset_record = response.json()[0]
    print(f"Dataset loaded: {dataset_record['title']}")
    print(f"Pairs: {len(dataset_record['data']['pairs'])}")
    
    # Create training job
    print("\nCreating training job with quick-large profile...")
    job_payload = {
        'created_by': 'dfeda6dd-3b77-404b-bcd2-88f173560b9a',
        'dataset_record_id': DATASET_ID,
        'dataset_snapshot': dataset_record['data'],
        'configuration': {
            'profile': 'quick-large'
        },
        'status': 'queued'
    }
    
    response = client.post('ai_training_jobs', json=job_payload)
    if response.status_code >= 400:
        print(f"Error: {response.status_code}")
        print(response.text[:500])
        sys.exit(1)
    
    response.raise_for_status()
    job = response.json()[0]
    job_id = job['id']
    
    print(f"[OK] Training job created: {job_id}")
    print(f"\nJob Configuration:")
    print(f"  - Profile: quick-large")
    print(f"  - Dataset: {len(dataset_record['data']['pairs'])} pairs")
    print(f"  - Expected time: 30-60 minutes")
    print(f"  - Status: {job['status']}")
    print(f"\n{'='*60}")
    print(f"SUCCESS! Training job ready to start!")
    print(f"Job ID: {job_id}")
    print(f"{'='*60}")
    
finally:
    client.close()
