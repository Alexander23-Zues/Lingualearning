"""
Simple Helsinki-NLP model downloader - downloads one direction at a time.
"""
import sys
from pathlib import Path
from transformers import MarianMTModel, MarianTokenizer


def download_model(model_id: str, output_dir: Path, direction: str):
    """Download a Helsinki-NLP model and save it locally."""
    print(f"Downloading {model_id}...")
    print(f"Output: {output_dir / direction}")
    
    output_dir.mkdir(parents=True, exist_ok=True)
    model_dir = output_dir / direction
    model_dir.mkdir(parents=True, exist_ok=True)
    
    # Check if already exists
    if (model_dir / "config.json").exists():
        print(f"Model already exists at {model_dir}, skipping download.")
        return model_dir
    
    # Download tokenizer and model from HuggingFace
    tokenizer = MarianTokenizer.from_pretrained(model_id)
    model = MarianMTModel.from_pretrained(model_id)
    
    # Save to local directory
    tokenizer.save_pretrained(model_dir)
    model.save_pretrained(model_dir)
    
    print(f"✓ Successfully saved to {model_dir}")
    return model_dir


if __name__ == "__main__":
    script_dir = Path(__file__).parent
    ml_dir = script_dir.parent
    models_dir = ml_dir / "models" / "helsinki-opus-mt"
    
    if len(sys.argv) > 1:
        direction = sys.argv[1]
    else:
        direction = "both"
    
    print("=" * 60)
    print("Helsinki-NLP OPUS-MT Model Download")
    print("=" * 60)
    
    if direction in ["en_to_fil", "both"]:
        print("\n[1/2] English → Tagalog")
        download_model("Helsinki-NLP/opus-mt-en-tl", models_dir, "en_to_fil")
    
    if direction in ["fil_to_en", "both"]:
        print("\n[2/2] Tagalog → English")
        download_model("Helsinki-NLP/opus-mt-tl-en", models_dir, "fil_to_en")
    
    print("\n" + "=" * 60)
    print("Download Complete!")
    print("=" * 60)
