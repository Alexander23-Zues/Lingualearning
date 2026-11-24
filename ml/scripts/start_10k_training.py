"""Prepare dataset and start training for 10K dataset"""
import json
import pandas as pd
from pathlib import Path
from sklearn.model_selection import train_test_split
import subprocess
import sys

# Configuration
JOB_ID = "9721268c-a241-4da8-a700-0a8653f670fa"
DATASET_PATH = "c:/Users/jomar/Desktop/Lingualearning/ml/data/school_en_fil_10k_additional.csv"
JOB_DIR = Path(f"c:/Users/jomar/Desktop/Lingualearning/ml/outputs/jobs/{JOB_ID}")
DATASET_DIR = JOB_DIR / "dataset"
OUTPUT_DIR = JOB_DIR / "run"

print("="*60)
print("10K TRAINING JOB")
print("="*60)
print(f"Job ID: {JOB_ID}")
print(f"Dataset: {DATASET_PATH}")
print(f"Output: {OUTPUT_DIR}")
print("="*60)

# Create directories
DATASET_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Load dataset
print("\nLoading dataset...")
df = pd.read_csv(DATASET_PATH)
print(f"Loaded {len(df)} pairs")

# Create bidirectional pairs (en->fil and fil->en)
print("Creating bidirectional dataset...")
all_pairs = []
for _, row in df.iterrows():
    # English to Filipino
    all_pairs.append({
        "input": row["english"],
        "target": row["filipino"],
        "direction": "en_to_fil",
        "category": row["category"]
    })
    # Filipino to English
    all_pairs.append({
        "input": row["filipino"],
        "target": row["english"],
        "direction": "fil_to_en",
        "category": row["category"]
    })

print(f"Total pairs (bidirectional): {len(all_pairs)}")

# Split: 80% train, 10% validation, 10% test
print("Splitting dataset...")
train_data, temp_data = train_test_split(all_pairs, test_size=0.2, random_state=42)
val_data, test_data = train_test_split(temp_data, test_size=0.5, random_state=42)

print(f"Train: {len(train_data)} pairs")
print(f"Validation: {len(val_data)} pairs")
print(f"Test: {len(test_data)} pairs")

# Save as JSONL files
print("\nSaving JSONL files...")
for split_name, split_data in [("train", train_data), ("validation", val_data), ("test", test_data)]:
    output_file = DATASET_DIR / f"{split_name}.jsonl"
    with open(output_file, "w", encoding="utf-8") as f:
        for item in split_data:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")
    print(f"  {split_name}.jsonl: {len(split_data)} pairs")

# Save configuration
config = {
    "job_id": JOB_ID,
    "dataset_size": len(df),
    "bidirectional_pairs": len(all_pairs),
    "splits": {
        "train": len(train_data),
        "validation": len(val_data),
        "test": len(test_data)
    },
    "training_config": {
        "epochs": 1,
        "batch_size": 4,
        "gradient_accumulation": 4,
        "learning_rate": 5e-5
    }
}

with open(JOB_DIR / "training-config.json", "w") as f:
    json.dump(config, f, indent=2)

print("\n" + "="*60)
print("DATASET PREPARATION COMPLETE")
print("="*60)
print(f"\nDataset directory: {DATASET_DIR}")
print(f"Output directory: {OUTPUT_DIR}")
print("\nStarting training...")
print("="*60)

# Start training
train_script = Path("c:/Users/jomar/Desktop/Lingualearning/ml/scripts/train.py")
cmd = [
    sys.executable,
    str(train_script),
    "--dataset-dir", str(DATASET_DIR),
    "--output-dir", str(OUTPUT_DIR),
    "--base-model", "google/mt5-small",
    "--epochs", "1",
    "--batch-size", "4",
    "--gradient-accumulation", "4",
    "--learning-rate", "5e-5",
]

print(f"Command: {' '.join(cmd)}")
print("\n" + "="*60)
print("TRAINING STARTED")
print("="*60)
print("\nTraining will take approximately 30-45 minutes...")
print("Monitor progress in the output logs.")
print("\nThis window will show training progress.\n")

# Run training
subprocess.run(cmd)
