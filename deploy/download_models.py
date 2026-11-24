"""Download upstream model artifacts in cloud build, avoiding upload size limits."""
import gc
import json
import os
from pathlib import Path
from huggingface_hub import snapshot_download
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM
from services.inference.app.translation_runtime import file_sha256

root = Path('/app/services/inference/models')
package = root / 'opus-baseline-v1'
revisions = {
    'en_to_fil': ('Helsinki-NLP/opus-mt-en-tl', 'e46e1761492cb6a6fb9515a72bb55ca654815ca5'),
    'fil_to_en': ('Helsinki-NLP/opus-mt-tl-en', '8d2dee91f8b3fa48dda8ec06ee2af8f24970dcbc'),
}
for direction, (repo, revision) in revisions.items():
    tokenizer = AutoTokenizer.from_pretrained(repo, revision=revision, trust_remote_code=False)
    model = AutoModelForSeq2SeqLM.from_pretrained(repo, revision=revision, trust_remote_code=False)
    model.save_pretrained(package / direction, safe_serialization=True)
    tokenizer.save_pretrained(package / direction)
    del model, tokenizer
    gc.collect()
manifest = {
    'architecture': 'marian-pair', 'model_version': package.name,
    'provenance': 'upstream_pretrained', 'review_required': True,
    'foundation_models': {key: repo for key, (repo, _) in revisions.items()},
    'upstream_revisions': {repo: rev for repo, rev in revisions.values()},
    'foundation_license': 'Apache-2.0', 'dataset_version': 'upstream-pretrained',
    'directions': list(revisions),
    'files': {p.relative_to(package).as_posix(): file_sha256(p) for p in package.rglob('*') if p.is_file()},
}
(package / 'manifest.json').write_text(json.dumps(manifest, indent=2))
snapshot_download('Systran/faster-whisper-tiny', revision='d90ca5fe260221311c53c58e660288d3deb8d356',
                  local_dir=root / 'whisper-tiny',
                  allow_patterns=['config.json', 'model.bin', 'tokenizer.json', 'vocabulary.txt'])

# MMS voices are CC BY-NC 4.0. Include them only for approved noncommercial deployments.
if os.environ.get('INCLUDE_SCHOOL_VOICES') == 'true':
    voices = {
        'en': ('facebook/mms-tts-eng', 'c71de0fe7204c83f1c10820a7d696d0b450048ba'),
        'fil': ('facebook/mms-tts-tgl', '79182edde3d60484a9e7a666240917f454138a0b'),
    }
    for language, (repo, revision) in voices.items():
        snapshot_download(repo, revision=revision, local_dir=root / 'voices' / language,
                          allow_patterns=['*.json', 'model.safetensors', 'README.md'])
