import argparse
import hashlib
import json
import shutil
from pathlib import Path


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--dataset-version", required=True)
    parser.add_argument("--model-version", required=True)
    args = parser.parse_args()

    if args.output_dir.exists():
        raise FileExistsError("Output package already exists; model packages are immutable.")
    shutil.copytree(args.model_dir, args.output_dir / "model")
    files = {
        str(path.relative_to(args.output_dir)): sha256(path)
        for path in sorted(args.output_dir.rglob("*"))
        if path.is_file()
    }
    manifest = {
        "foundation_model": "google/mt5-small",
        "foundation_license": "Apache-2.0",
        "model_version": args.model_version,
        "dataset_version": args.dataset_version,
        "directions": ["en_to_fil", "fil_to_en"],
        "files": files,
    }
    manifest_path = args.output_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(sha256(manifest_path))


if __name__ == "__main__":
    main()
