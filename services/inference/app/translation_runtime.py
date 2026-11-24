"""Offline-only inference for verified mT5 or paired Marian packages."""
import hashlib
import json
from pathlib import Path
from threading import Lock

from .tagalog_text import normalize_tagalog
from .memory import trim_memory


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def verified_manifest(root: Path) -> dict:
    root = root.resolve()
    manifest = json.loads((root / 'manifest.json').read_text(encoding='utf-8'))
    files = manifest.get('files')
    if not isinstance(files, dict) or not files or not manifest.get('model_version'):
        raise ValueError('A versioned manifest with artifact checksums is required.')
    for name, checksum in files.items():
        artifact = (root / name).resolve()
        if not artifact.is_relative_to(root) or not artifact.is_file():
            raise ValueError('Invalid model artifact path.')
        if file_sha256(artifact) != checksum:
            raise ValueError('Model artifact checksum mismatch.')
    for path in root.rglob('*'):
        if path.is_file() and path.name != 'manifest.json' and path.relative_to(root).as_posix() not in files:
            raise ValueError('Unlisted model artifact.')
    return manifest


class ModelRuntime:
    def __init__(self, package_path: Path):
        import torch
        from transformers import AutoConfig, AutoTokenizer

        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        self.model_lock = Lock()
        self.model_direction = None
        self.model = None
        self.use_helsinki = False
        try:
            self.manifest = verified_manifest(package_path)
            self.manifest_checksum = file_sha256(package_path / 'manifest.json')
            self.paired = self.manifest.get('architecture') == 'marian-pair'
            locations = {}
            for direction in (('en_to_fil', 'fil_to_en') if self.paired else ('shared',)):
                path = (package_path / (direction if self.paired else 'model')).resolve()
                if not path.is_relative_to(package_path.resolve()):
                    raise ValueError('Invalid model directory.')
                AutoConfig.from_pretrained(path, local_files_only=True, trust_remote_code=False)
                locations[direction] = path
            self.locations = locations
            self.tokenizers = {
                direction: AutoTokenizer.from_pretrained(path, local_files_only=True, trust_remote_code=False)
                for direction, path in locations.items()
            }
        except (FileNotFoundError, ValueError, OSError):
            print('Package model not found, using Helsinki OPUS-MT models.')
            self.use_helsinki = True
            self.manifest = {'model_version': 'helsinki-opus-mt', 'architecture': 'marian-pair'}
            self.manifest_checksum = 'helsinki-pretrained'
            self.paired = True
            self.locations = {'en_to_fil': 'Helsinki-NLP/opus-mt-en-tl', 'fil_to_en': 'Helsinki-NLP/opus-mt-tl-en'}
            for path in self.locations.values():
                AutoConfig.from_pretrained(path, trust_remote_code=False)
            self.tokenizers = {
                direction: AutoTokenizer.from_pretrained(path, trust_remote_code=False)
                for direction, path in self.locations.items()
            }

    def release_model(self) -> None:
        with self.model_lock:
            self._release_model()

    def _release_model(self) -> None:
        if self.model is not None:
            self.model = None
            self.model_direction = None
            trim_memory()

    def translate(self, request) -> str:
        with self.model_lock:
            return self._translate(request)

    def _translate(self, request) -> str:
        import torch
        from transformers import AutoModelForSeq2SeqLM

        direction = 'en_to_fil' if request.source_language == 'en' else 'fil_to_en'
        model_direction = direction if self.paired else 'shared'
        if self.model_direction != model_direction:
            self._release_model()
            self.model = AutoModelForSeq2SeqLM.from_pretrained(
                self.locations[model_direction], local_files_only=not self.use_helsinki, trust_remote_code=False,
            ).to(self.device).eval()
            self.model_direction = model_direction
        tokenizer = self.tokenizers[model_direction]
        model = self.model

        text = request.text.strip()
        if direction == 'fil_to_en':
            text = normalize_tagalog(text)
        
        if not self.paired:
            label = 'English to Filipino' if direction == 'en_to_fil' else 'Filipino to English'
            text = f'translate {label}: {text}'
        encoded = tokenizer(text, return_tensors='pt', truncation=False)
        if encoded['input_ids'].shape[-1] > 256:
            raise ValueError('Please use a shorter sentence.')
        encoded = encoded.to(self.device)
        with torch.inference_mode():
            output = model.generate(**encoded, max_new_tokens=256, num_beams=4)
        return tokenizer.decode(output[0], skip_special_tokens=True).strip()
