"""Create dataset record and training job for 10K additional dataset"""
import os as _os
from pathlib import Path as _EnvironmentPath
from dotenv import load_dotenv as _load_environment
_load_environment(_EnvironmentPath(__file__).resolve().parents[2] / '.env', override=False)

import json
import pandas as pd
import requests
import uuid
from datetime import datetime
from pathlib import Path

# Configuration
SUPABASE_URL = "https://jdtgakguokulcuirnzkw.supabase.co"
SUPABASE_SECRET = _os.environ["SUPABASE_SECRET_KEY"]
DATASET_PATH = "c:/Users/jomar/Desktop/Lingualearning/ml/data/school_en_fil_10k_additional.csv"

# Load dataset
print("Loading dataset...")
df = pd.read_csv(DATASET_PATH)
print(f"Loaded {len(df)} pairs")

# Prepare dataset for upload
dataset_pairs = []
for _, row in df.iterrows():
    dataset_pairs.append({
        "english": row["english"],
        "filipino": row["filipino"],
        "source": row["source"],
        "license": row["license"],
        "category": row["category"],
        "reviewer_notes": row["reviewer_notes"]
    })

# Create dataset record in Supabase
print("Creating dataset record...")
headers = {
    "apikey": SUPABASE_SECRET,
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

dataset_data = {
    "owner_id": "dfeda6dd-3b77-404b-bcd2-88f173560b9a",
    "kind": "dataset",
    "title": "Educational English-Filipino 10K (Additional)",
    "status": "published",
    "data": {
        "total_pairs": len(dataset_pairs),
        "source_file": "school_en_fil_10k_additional.csv",
        "range": "rows 5001-15000 from full dataset",
        "description": "Additional 10K translation pairs (different from first 5K)",
        "sample_pairs": dataset_pairs[:10]  # Only include first 10 as sample
    }
}

response = requests.post(
    f"{SUPABASE_URL}/rest/v1/workspace_records",
    headers=headers,
    json=dataset_data
)

print(f"Response status: {response.status_code}")
print(f"Response text: {response.text[:500]}")

if response.status_code in [200, 201]:
    try:
        dataset_record = response.json()
    except Exception as e:
        print(f"JSON decode error: {e}")
        print(f"Full response: {response.text}")
        exit(1)
    if isinstance(dataset_record, list):
        dataset_record = dataset_record[0]
    dataset_id = dataset_record["id"]
    print(f"Dataset record created: {dataset_id}")
else:
    print(f"Error creating dataset: {response.status_code}")
    print(response.text)
    exit(1)

# Create training job
print("Creating training job...")
job_id = str(uuid.uuid4())
job_dir = Path(f"c:/Users/jomar/Desktop/Lingualearning/ml/outputs/jobs/{job_id}")
job_dir.mkdir(parents=True, exist_ok=True)

# Training configuration
config = {
    "profile": "standard",
    "epochs": 1,
    "batch_size": 4,
    "gradient_accumulation_steps": 4,
    "learning_rate": 5e-5,
    "warmup_steps": 100
}

# Create dataset manifest
manifest = {
    "dataset_id": dataset_id,
    "source_file": str(DATASET_PATH),
    "total_pairs": len(df),
    "range": "rows 5001-15000",
    "created_at": datetime.now().isoformat()
}

with open(job_dir / "dataset-manifest.json", "w") as f:
    json.dump(manifest, f, indent=2)

# Create job config
job_config = {
    "job_id": job_id,
    "dataset_id": dataset_id,
    "dataset_size": len(df),
    "config": config,
    "created_at": datetime.now().isoformat(),
    "status": "pending"
}

with open(job_dir / "job-config.json", "w") as f:
    json.dump(job_config, f, indent=2)

# Create job record in database (skip for now - use local files only)
print(f"Training job created locally: {job_id}")
print(f"Job directory: {job_dir}")
print(f"\nConfiguration:")
print(f"  - Dataset size: {len(df)} pairs")
print(f"  - Epochs: {config['epochs']}")
print(f"  - Batch size: {config['batch_size']}")
print(f"  - Estimated time: 30-45 minutes")

print(f"\nJob ID: {job_id}")
