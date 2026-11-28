"""Generate manifest.json for Helsinki-NLP models."""
import hashlib
import json
from pathlib import Path


def file_sha256(path: Path) -> str:
    """Calculate SHA256 checksum of a file."""
    digest = hashlib.sha256()
    with path.open('rb') as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def generate_manifest(base_dir: Path) -> dict:
    """Generate manifest.json with checksums for all model files."""
    print("Generating manifest with checksums...")
    print(f"Base directory: {base_dir}")
    
    files = {}
    for direction in ['en_to_fil', 'fil_to_en']:
        model_dir = base_dir / direction
        if not model_dir.exists():
            raise ValueError(f"Model directory {model_dir} does not exist")
        
        print(f"\nProcessing {direction}...")
        # Calculate checksums for all files in the model directory
        for file_path in sorted(model_dir.rglob('*')):
            if file_path.is_file():
                relative_path = file_path.relative_to(base_dir).as_posix()
                print(f"  Hashing {relative_path}...", end='', flush=True)
                checksum = file_sha256(file_path)
                files[relative_path] = checksum
                print(f" {checksum[:16]}...")
    
    # Get commit hashes from config if available
    en_to_fil_config = json.loads((base_dir / "en_to_fil" / "config.json").read_text(encoding='utf-8'))
    fil_to_en_config = json.loads((base_dir / "fil_to_en" / "config.json").read_text(encoding='utf-8'))
    
    en_tl_revision = en_to_fil_config.get("_commit_hash", "main")
    tl_en_revision = fil_to_en_config.get("_commit_hash", "main")
    
    manifest = {
        "architecture": "marian-pair",
        "provenance": "pretrained",
        "upstream_revisions": {
            "Helsinki-NLP/opus-mt-en-tl": en_tl_revision,
            "Helsinki-NLP/opus-mt-tl-en": tl_en_revision
        },
        "model_version": "helsinki-opus-mt-pretrained-v1",
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


if __name__ == "__main__":
    script_dir = Path(__file__).parent
    ml_dir = script_dir.parent
    models_dir = ml_dir / "models" / "helsinki-opus-mt"
    
    print("=" * 60)
    print("Generate Manifest for Helsinki-NLP OPUS-MT")
    print("=" * 60)
    
    manifest = generate_manifest(models_dir)
    
    # Save manifest
    manifest_path = models_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding='utf-8')
    
    print("\n" + "=" * 60)
    print("Manifest Generated Successfully!")
    print("=" * 60)
    print(f"Saved to: {manifest_path}")
    print(f"Total files: {len(manifest['files'])}")
    print("\nModel details:")
    print(f"  Architecture: {manifest['architecture']}")
    print(f"  Version: {manifest['model_version']}")
    print(f"  Directions: {', '.join(manifest['directions'])}")
