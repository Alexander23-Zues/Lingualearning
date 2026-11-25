"""Replay teacher-labelled English WAV files locally, one recording at a time.

Never writes to school records or changes the active model. Keep the corpus and
prediction output in a private directory outside the source repository.
"""
import argparse
import hashlib
from importlib.metadata import PackageNotFoundError, version
import json
import sys
import time
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from scripts.evaluate_child_reading import evaluate, validate_labels
from services.inference.app.reading_comparison import compare_reading

MAX_ROWS = 2000
MAX_LABEL_BYTES = 10 * 1024 * 1024
MAX_AUDIO_BYTES = 1_500_000


def sha256_file(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def validate_wav_file(path):
    if not 0 < path.stat().st_size <= MAX_AUDIO_BYTES:
        raise ValueError('Use WAV recordings no larger than 1.5 MB.')
    try:
        with wave.open(str(path), 'rb') as clip:
            frames = clip.getnframes()
            if (clip.getnchannels(), clip.getsampwidth(), clip.getframerate()) != (1, 2, 16000) or not 0 < frames <= 720000:
                raise ValueError('Use mono 16-bit 16 kHz WAV recordings of at most 45 seconds.')
            if len(clip.readframes(frames)) != frames * 2:
                raise ValueError('Incomplete WAV recording.')
    except (wave.Error, EOFError) as error:
        raise ValueError('Invalid WAV recording.') from error


def load_corpus(labels_path, audio_root, training_speakers=None):
    if labels_path.stat().st_size > MAX_LABEL_BYTES:
        raise ValueError('The teacher label file is too large.')
    rows = [json.loads(line) for line in labels_path.read_text(encoding='utf-8-sig').splitlines() if line.strip()]
    if not 1 <= len(rows) <= MAX_ROWS:
        raise ValueError('Supply 1–2,000 teacher-labelled recordings.')
    validate_labels(rows, training_speakers)
    root, seen_audio, recordings = audio_root.resolve(strict=True), set(), []
    if not root.is_dir():
        raise ValueError('Choose the private audio folder.')
    for row in rows:
        relative = row.get('audio')
        if not isinstance(relative, str) or not relative.strip() or Path(relative).is_absolute():
            raise ValueError('Use relative audio paths inside the private audio folder.')
        path = (root / relative).resolve(strict=True)
        if not path.is_relative_to(root) or path.suffix.lower() != '.wav':
            raise ValueError('Audio paths must stay inside the private WAV folder.')
        validate_wav_file(path)
        checksum = sha256_file(path)
        if checksum in seen_audio:
            raise ValueError('The same audio is listed more than once; duplicate clips do not add coverage.')
        if row.get('audio_sha256') is not None and row['audio_sha256'] != checksum:
            raise ValueError('An audio checksum changed. Preserve the original labelled recording.')
        seen_audio.add(checksum)
        recordings.append(({**row, 'audio_sha256': checksum}, path))
    return recordings


def model_fingerprint(model_path):
    model_path = model_path.resolve(strict=True)
    required = ('model.bin', 'config.json', 'tokenizer.json')
    if not model_path.is_dir() or not all((model_path / name).is_file() for name in required):
        raise ValueError('Choose an installed CTranslate2 Whisper model directory; no downloads are performed.')
    files = {}
    for path in sorted(model_path.rglob('*')):
        if path.is_file():
            resolved = path.resolve(strict=True)
            if not resolved.is_relative_to(model_path):
                raise ValueError('Model files must stay inside the model directory.')
            files[path.relative_to(model_path).as_posix()] = sha256_file(path)
    identity = hashlib.sha256(json.dumps(files, sort_keys=True).encode()).hexdigest()
    versions = {}
    for package in ('faster-whisper', 'ctranslate2', 'numpy'):
        try:
            versions[package] = version(package)
        except PackageNotFoundError:
            versions[package] = 'not-installed'
    code = {name: sha256_file(ROOT / 'services/inference/app' / name)
            for name in ('reading.py', 'reading_comparison.py')}
    runtime_identity = hashlib.sha256(json.dumps({'versions': versions, 'code': code}, sort_keys=True).encode()).hexdigest()
    return {'model_sha256': identity, 'files': files, 'runtime_sha256': runtime_identity,
            'runtime_versions': versions, 'runtime_code': code}


def run_benchmark(recordings, runtime, output, identity, training_speakers=None):
    # Exclusive files preserve a prior run and its evidence. No model concurrency.
    predictions, started = [], time.monotonic()
    with (output / 'predictions.private.jsonl').open('x', encoding='utf-8') as stream:
        for index, (row, audio_path) in enumerate(recordings, 1):
            # Detect edits since preflight; labels must refer to these exact bytes.
            with audio_path.open('rb') as clip:
                audio = clip.read(MAX_AUDIO_BYTES + 1)
            if len(audio) > MAX_AUDIO_BYTES:
                raise ValueError('Audio exceeds the checked size limit.')
            if hashlib.sha256(audio).hexdigest() != row['audio_sha256']:
                raise ValueError('Audio changed after preflight; stop and recheck the labels.')
            tick = time.monotonic()
            recognized = runtime.recognize_with_details(audio, 'en')
            result = compare_reading(row['expected_text'], recognized.transcript, unclear=recognized.unclear)
            prediction = {**row, 'recognized_text': result['transcript'],
                          'recognition_status': result['recognition_status'],
                          'model_sha256': identity['model_sha256'],
                          'runtime_sha256': identity['runtime_sha256'],
                          'seconds': round(time.monotonic() - tick, 4)}
            stream.write(json.dumps(prediction, ensure_ascii=False) + '\n')
            stream.flush()
            predictions.append(prediction)
            print(f'Checked recording {index}/{len(recordings)}.', flush=True)
    report = evaluate(predictions, training_speakers)
    report.update(model=identity, seconds=round(time.monotonic() - started, 3),
                  predictions_sha256=sha256_file(output / 'predictions.private.jsonl'))
    (output / 'evaluation.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--labels', type=Path, required=True)
    parser.add_argument('--audio-root', type=Path, required=True)
    parser.add_argument('--training-speakers', type=Path)
    parser.add_argument('--model', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--validate-only', action='store_true')
    args = parser.parse_args()
    if not args.validate_only and args.model is None:
        parser.error('--model is required for a benchmark; --validate-only never loads a model.')
    if args.labels.resolve().is_relative_to(ROOT) or args.audio_root.resolve().is_relative_to(ROOT):
        parser.error('Keep child labels and audio in a private folder outside the source repository.')
    output = args.output.resolve()
    if (output.is_relative_to(ROOT) or output.is_relative_to(args.audio_root.resolve())
            or args.model and output.is_relative_to(args.model.resolve())):
        parser.error('Use a new private output directory outside the repository, corpus, and model.')
    runtime = None
    try:
        training = json.loads(args.training_speakers.read_text()) if args.training_speakers else None
        recordings = load_corpus(args.labels, args.audio_root, training)
        identity = model_fingerprint(args.model) if not args.validate_only else None
        output.mkdir(parents=True, exist_ok=False)
        if args.validate_only:
            report = {'labelled_recordings': len(recordings), 'audio_integrity_checked': True,
                      'model_loaded': False, 'model_trained': False, 'activation_allowed': False,
                      'child_accuracy_measured': False}
            (output / 'preflight.json').write_text(json.dumps(report, indent=2))
            print('Teacher labels and WAV integrity checked. No model loaded or activated.')
            return
        from services.inference.app.reading import ReadingRuntime
        runtime = ReadingRuntime(str(args.model))
        report = run_benchmark(recordings, runtime, output, identity, training)
        print('Evaluation saved. Coverage complete:', report['coverage_complete'], '; no model activated.')
    except (ValueError, OSError):
        parser.exit(2, 'Benchmark stopped. Check labels, WAV files, model, and new private output folder. No school records or model activation changed.\n')
    finally:
        if runtime is not None:
            runtime.release_model()


if __name__ == '__main__':
    main()
