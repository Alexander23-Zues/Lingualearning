#!/usr/bin/env python3
"""
Force start training by directly updating job status to running
and triggering the worker to process it
"""
import os as _os
from pathlib import Path as _EnvironmentPath
from dotenv import load_dotenv as _load_environment
_load_environment(_EnvironmentPath(__file__).resolve().parents[2] / '.env', override=False)


import httpx
import json
import sys
from datetime import datetime, timedelta, timezone

SUPABASE_URL = "https://jdtgakguokulcuirnzkw.supabase.co"
SUPABASE_SECRET_KEY = _os.environ["SUPABASE_SECRET_KEY"]
JOB_ID = "adc815f9-fc25-4e6b-abda-dc250285cf7f"

headers = {
    'apikey': SUPABASE_SECRET_KEY,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
}

def update_job_to_running():
    """Update job status to running with lease"""
    print(f"Updating job {JOB_ID} to running status...")
    
    lease_expires = (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat()
    
    update_data = {
        'status': 'running',
        'lease_expires_at': lease_expires,
        'progress': {'phase': 'initializing'}
    }
    
    url = f"{SUPABASE_URL}/rest/v1/ai_training_jobs?id=eq.{JOB_ID}"
    response = httpx.patch(url, headers=headers, json=update_data, timeout=30.0)
    response.raise_for_status()
    
    print(f"Job status updated to 'running'")
    return response.json()

def verify_status():
    """Verify job is running"""
    url = f"{SUPABASE_URL}/rest/v1/ai_training_jobs?select=id,status,progress&id=eq.{JOB_ID}"
    response = httpx.get(url, headers=headers, timeout=30.0)
    response.raise_for_status()
    
    job = response.json()[0]
    print(f"Current status: {job['status']}")
    print(f"Progress: {json.dumps(job.get('progress', {}), indent=2)}")
    return job

def main():
    try:
        print("="*60)
        print("Force Starting Training Job")
        print("="*60)
        
        # Update to running
        update_job_to_running()
        
        # Verify
        verify_status()
        
        print("="*60)
        print("Job is now marked as running")
        print("Now manually processing the job...")
        print("="*60)
        
        # Now process it
        from ml.scripts.training_worker import Worker
        from services.api.app.config import Settings
        from pathlib import Path
        
        worker = Worker(Settings(), Path('ml/outputs/jobs'))
        
        # Get the job
        url = f"{SUPABASE_URL}/rest/v1/ai_training_jobs?select=*&id=eq.{JOB_ID}"
        response = httpx.get(url, headers=headers, timeout=30.0)
        response.raise_for_status()
        job = response.json()[0]
        
        print("Starting training process...")
        worker.process(job)
        
        print("="*60)
        print("Training started successfully!")
        print("="*60)
        
    except Exception as e:
        print(f"ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
