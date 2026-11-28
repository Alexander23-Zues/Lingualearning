#!/usr/bin/env python3
"""
Automated training setup script for LinguaKids 25K dataset
Handles dataset record creation and training job submission
"""
import os as _os
from pathlib import Path as _EnvironmentPath
from dotenv import load_dotenv as _load_environment
_load_environment(_EnvironmentPath(__file__).resolve().parents[2] / '.env', override=False)


import httpx
import json
import hashlib
import csv
import sys
from pathlib import Path
from datetime import datetime

# Configuration
SUPABASE_URL = "https://jdtgakguokulcuirnzkw.supabase.co"
SUPABASE_SECRET_KEY = _os.environ["SUPABASE_SECRET_KEY"]
DATASET_PATH = Path(__file__).parent.parent / "data" / "school_en_fil_25k.csv"

headers = {
    'apikey': SUPABASE_SECRET_KEY,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
}

def log(message):
    """Print timestamped log message"""
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {message}")

def load_csv_data(csv_path):
    """Load CSV and convert to pairs format"""
    log(f"Loading dataset from {csv_path}")
    pairs = []
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            pairs.append({
                'en': row['english'],
                'fil': row['filipino']
            })
    log(f"Loaded {len(pairs)} translation pairs")
    return pairs

def calculate_checksum(pairs):
    """Calculate checksum for dataset integrity"""
    data_str = json.dumps(pairs, sort_keys=True)
    return hashlib.sha256(data_str.encode()).hexdigest()

def get_admin_user_id():
    """Get administrator user ID from profiles table"""
    log("Fetching administrator user ID...")
    url = f"{SUPABASE_URL}/rest/v1/profiles?select=id&role=eq.administrator"
    
    response = httpx.get(url, headers=headers, timeout=30.0)
    response.raise_for_status()
    
    profiles = response.json()
    if not profiles:
        raise Exception("No administrator user found in profiles table")
    
    user_id = profiles[0]['id']
    log(f"Found administrator user: {user_id}")
    return user_id

def check_existing_dataset():
    """Check if dataset already exists"""
    log("Checking for existing dataset record...")
    url = f"{SUPABASE_URL}/rest/v1/workspace_records?select=*&kind=eq.dataset&title=eq.Educational English-Filipino 25K"
    
    response = httpx.get(url, headers=headers, timeout=30.0)
    response.raise_for_status()
    
    records = response.json()
    if records:
        record = records[0]
        if record.get('data') and isinstance(record['data'], dict):
            pairs = record['data'].get('pairs', [])
            if len(pairs) >= 25000:
                log(f"Found existing dataset record: {record['id']} with {len(pairs)} pairs")
                return record['id']
    
    log("No suitable existing dataset found")
    return None

def create_dataset_record(user_id, pairs):
    """Create dataset record in workspace_records table"""
    log("Creating dataset record in database...")
    
    dataset_data = {
        "pairs": pairs,
        "source_url": "https://github.com/LinguaKids/educational-dataset",
        "license": "CC BY-SA 4.0",
        "license_url": "https://creativecommons.org/licenses/by-sa/4.0/",
        "attribution": "LinguaKids Educational Dataset",
        "classroom_approved": False,
        "pair_count": len(pairs),
        "created_at": datetime.utcnow().isoformat()
    }
    
    record_payload = {
        "kind": "dataset",
        "title": "Educational English-Filipino 25K",
        "status": "published",
        "data": dataset_data,
        "owner_id": user_id
    }
    
    url = f"{SUPABASE_URL}/rest/v1/workspace_records"
    response = httpx.post(url, headers=headers, json=record_payload, timeout=30.0)
    response.raise_for_status()
    
    result = response.json()
    if isinstance(result, list) and len(result) > 0:
        record_id = result[0]['id']
    else:
        record_id = result['id']
    
    log(f"Dataset record created: {record_id}")
    return record_id

def create_training_job(user_id, dataset_record_id, pairs):
    """Create training job in ai_training_jobs table"""
    log("Creating training job...")
    
    checksum = calculate_checksum(pairs)
    
    dataset_snapshot = {
        "pairs": pairs,
        "source_url": "https://github.com/LinguaKids/educational-dataset",
        "license": "CC BY-SA 4.0",
        "license_url": "https://creativecommons.org/licenses/by-sa/4.0/",
        "attribution": "LinguaKids Educational Dataset",
        "checksum": checksum,
        "pair_count": len(pairs)
    }
    
    configuration = {
        "profile": "standard-large",
        "epochs": 3,
        "batch_size": 2
    }
    
    job_payload = {
        "created_by": user_id,
        "dataset_record_id": dataset_record_id,
        "dataset_snapshot": dataset_snapshot,
        "configuration": configuration,
        "status": "queued"
    }
    
    url = f"{SUPABASE_URL}/rest/v1/ai_training_jobs"
    response = httpx.post(url, headers=headers, json=job_payload, timeout=30.0)
    response.raise_for_status()
    
    result = response.json()
    if isinstance(result, list) and len(result) > 0:
        job_id = result[0]['id']
    else:
        job_id = result['id']
    
    log(f"Training job created: {job_id}")
    return job_id

def verify_job_status(job_id):
    """Check training job status"""
    log(f"Verifying job {job_id} status...")
    url = f"{SUPABASE_URL}/rest/v1/ai_training_jobs?select=*&id=eq.{job_id}"
    
    response = httpx.get(url, headers=headers, timeout=30.0)
    response.raise_for_status()
    
    jobs = response.json()
    if jobs:
        status = jobs[0]['status']
        log(f"Job status: {status}")
        return status
    
    return None

def main():
    """Main execution flow"""
    try:
        log("=" * 60)
        log("LinguaKids Automated Training Setup")
        log("=" * 60)
        
        # Step 1: Load dataset
        if not DATASET_PATH.exists():
            log(f"ERROR: Dataset file not found: {DATASET_PATH}")
            sys.exit(1)
        
        pairs = load_csv_data(DATASET_PATH)
        
        # Step 2: Get admin user
        user_id = get_admin_user_id()
        
        # Step 3: Check for existing dataset
        dataset_record_id = check_existing_dataset()
        
        # Step 4: Create dataset record if needed
        if not dataset_record_id:
            dataset_record_id = create_dataset_record(user_id, pairs)
        
        # Step 5: Create training job
        job_id = create_training_job(user_id, dataset_record_id, pairs)
        
        # Step 6: Verify job created
        status = verify_job_status(job_id)
        
        log("=" * 60)
        log("SETUP COMPLETE")
        log("=" * 60)
        log(f"Dataset Record ID: {dataset_record_id}")
        log(f"Training Job ID: {job_id}")
        log(f"Initial Status: {status}")
        log(f"Configuration: standard-large profile, 3 epochs, batch size 2")
        log(f"Dataset Size: {len(pairs)} translation pairs")
        log("=" * 60)
        log("Training worker should pick up this job automatically")
        log("Monitor progress in: .preview/training-worker.log")
        
        return job_id
        
    except Exception as e:
        log(f"ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
