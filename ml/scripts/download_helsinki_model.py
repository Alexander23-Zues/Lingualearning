"""
Download Helsinki-NLP OPUS-MT pre-trained models for better general translation.

These models are trained on much more diverse data than the school-specific 10K dataset,
making them suitable for translating ANY sentence, not just school-related content.
"""
import hashlib
import json
from pathlib import Path
from transformers import MarianMTModel, MarianTokenizer


def file_sha256(path: Path) -> str:
    """Calculate SHA256 checksum of a file."""
    digest = hashlib.sha256()
    with path.open('rb') as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def download_model(model_id: str, output_dir: Path, direction: str):
    """Download a Helsinki-NLP model and save it locally."""
    print(f"Downloading {model_id} to {output_dir}...")
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Download tokenizer and model from HuggingFace
    tokenizer = MarianTokenizer.from_pretrained(model_id)
    model = MarianMTModel.from_pretrained(model_id)
    
    # Save to local directory
    model_dir = output_dir / direction
    model_dir.mkdir(parents=True, exist_ok=True)
    
    tokenizer.save_pretrained(model_dir)
    model.save_pretrained(model_dir)
    
    print(f"Successfully saved {direction} model to {model_dir}")
    return model_dir


def generate_manifest(base_dir: Path, en_tl_revision: str, tl_en_revision: str) -> dict:
    """Generate manifest.json with checksums for all model files."""
    print("Generating manifest with checksums...")
    
    files = {}
    for direction in ['en_to_fil', 'fil_to_en']:
        model_dir = base_dir / direction
        if not model_dir.exists():
            raise ValueError(f"Model directory {model_dir} does not exist")
        
        # Calculate checksums for all files in the model directory
        for file_path in model_dir.rglob('*'):
            if file_path.is_file():
                relative_path = file_path.relative_to(base_dir).as_posix()
                checksum = file_sha256(file_path)
                files[relative_path] = checksum
                print(f"  {relative_path}: {checksum[:16]}...")
    
    manifest = {
        "architecture": "marian-pair",
        "provenance": "pretrained",
        "upstream_revisions": {
            "Helsinki-NLP/opus-mt-en-tl": en_tl_revision,
            "Helsinki-NLP/opus-mt-tl-en": tl_en_revision
        },
        "model_version": "helsinki-opus-mt-pretrained",
        "foundation_models": {
            "en_to_fil": "Helsinki-NLP/opus-mt-en-tl",
            "fil_to_en": "Helsinki-NLP/opus-mt-tl-en"
        },
        "foundation_license": "Apache-2.0",
        "review_required": False,
        "directions": [
            "en_to_fil",
            "fil_to_en"
        ],
        "files": files
    }
    
    return manifest


def main():
    """Download Helsinki-NLP OPUS-MT models and generate manifest."""
    # Setup paths
    script_dir = Path(__file__).parent
    ml_dir = script_dir.parent
    models_dir = ml_dir / "models" / "helsinki-opus-mt"
    
    print("=" * 60)
    print("Helsinki-NLP OPUS-MT Model Download")
    print("=" * 60)
    print(f"Output directory: {models_dir}")
    print()
    
    # Model IDs and their revisions (these are stable models)
    en_tl_model = "Helsinki-NLP/opus-mt-en-tl"
    tl_en_model = "Helsinki-NLP/opus-mt-tl-en"
    
    # Download both directions
    en_tl_dir = download_model(en_tl_model, models_dir, "en_to_fil")
    print()
    tl_en_dir = download_model(tl_en_model, models_dir, "fil_to_en")
    print()
    
    # Get model revisions from config
    en_tl_config = json.loads((en_tl_dir / "config.json").read_text(encoding='utf-8'))
    tl_en_config = json.loads((tl_en_dir / "config.json").read_text(encoding='utf-8'))
    
    # Use model architecture version as revision identifier
    en_tl_revision = en_tl_config.get("_commit_hash", "main")
    tl_en_revision = tl_en_config.get("_commit_hash", "main")
    
    # Generate manifest with checksums
    manifest = generate_manifest(models_dir, en_tl_revision, tl_en_revision)
    
    # Save manifest
    manifest_path = models_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding='utf-8')
    
    print("=" * 60)
    print("Download Complete!")
    print("=" * 60)
    print(f"Models saved to: {models_dir}")
    print(f"Manifest saved to: {manifest_path}")
    print()
    print("Model details:")
    print(f"  - English → Tagalog: {en_tl_model}")
    print(f"  - Tagalog → English: {tl_en_model}")
    print(f"  - Total files: {len(manifest['files'])}")
    print()
    print("To use these models, update the .env file:")
    print(f"  MODEL_PACKAGE_PATH={models_dir}")
    print()


if __name__ == "__main__":
    main()
