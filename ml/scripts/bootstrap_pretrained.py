"""Download pinned upstream checkpoints; no training or quality claim is made."""
import argparse
import gc
import json
from pathlib import Path
from huggingface_hub import HfApi, snapshot_download
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM
from services.inference.app.translation_runtime import file_sha256

from ml.scripts.training_readiness import MODELS


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--cache-dir', type=Path, default=Path('ml/outputs/cache'))
    parser.add_argument('--reading-output', type=Path)
    parser.add_argument('--direct-download', action='store_true')
    args = parser.parse_args()
    if (args.output / 'manifest.json').exists():
        raise FileExistsError('Choose a new immutable package directory.')
    args.output.mkdir(parents=True, exist_ok=True)
    revisions = {}
    for direction, name in MODELS.items():
        if args.direct_download:
            from ml.scripts.download_upstream import download
            local = args.cache_dir / direction
            revision = download(name, local)
            source = local
        else:
            revision = HfApi().model_info(name).sha
            source = name
        revisions[name] = revision
        tokenizer = AutoTokenizer.from_pretrained(source, revision=revision if not args.direct_download else None, cache_dir=args.cache_dir, trust_remote_code=False)
        model = AutoModelForSeq2SeqLM.from_pretrained(source, revision=revision if not args.direct_download else None, cache_dir=args.cache_dir, trust_remote_code=False, use_safetensors=False)
        model.save_pretrained(args.output / direction, safe_serialization=True)
        tokenizer.save_pretrained(args.output / direction)
        del model, tokenizer
        gc.collect()
    manifest = {'architecture': 'marian-pair', 'provenance': 'upstream_pretrained', 'model_version': args.output.name,
                'foundation_models': MODELS, 'upstream_revisions': revisions,
                'foundation_license': 'Apache-2.0', 'dataset_version': 'upstream-pretrained',
                'directions': list(MODELS), 'review_required': True,
                'files': {p.relative_to(args.output).as_posix(): file_sha256(p)
                          for p in sorted(args.output.rglob('*')) if p.is_file()}}
    (args.output / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    print('Package created. Evaluate both directions and obtain educator review before activation.')
    if args.reading_output:
        repo = 'Systran/faster-whisper-tiny'
        if args.direct_download:
            revision = download(repo, args.reading_output)
        else:
            revision = HfApi().model_info(repo).sha
            snapshot_download(repo, revision=revision, local_dir=args.reading_output, cache_dir=args.cache_dir)
        print(f'Reading checkpoint: {repo}@{revision}. This is speech recognition, not pronunciation assessment.')


if __name__ == '__main__':
    main()
