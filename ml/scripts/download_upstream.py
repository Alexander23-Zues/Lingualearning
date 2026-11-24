"""Verified streaming fallback for public Hugging Face artifacts."""
import hashlib
import json
import time
import urllib.request
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

ALLOWED = {'Helsinki-NLP/opus-mt-en-tl', 'Helsinki-NLP/opus-mt-tl-en', 'Systran/faster-whisper-tiny'}


def download_ranges(url, path, size, expected, chunk=1024 * 1024):
    if not expected:
        raise ValueError('Large artifacts require an upstream SHA-256.')
    partial = path.with_suffix(path.suffix + '.partial')
    reusable = set()
    if partial.is_file() and partial.stat().st_size == size:
        # Recover bytes from interrupted older transfers too. This is only a
        # candidate cache: the entire official checksum must pass before use.
        with partial.open('rb') as handle:
            for start in range(0, size, chunk):
                block = handle.read(min(chunk, size - start))
                if block and any(block):
                    reusable.add(start)
    else:
        with partial.open('wb') as handle:
            handle.truncate(size)
    print(f'{path.name}: resuming {len(reusable)} candidate chunks; full checksum still required.', flush=True)

    def region(start):
        if start in reusable:
            return
        end = min(size, start + chunk) - 1
        for attempt in range(3):
            try:
                request = urllib.request.Request(url, headers={'Range': f'bytes={start}-{end}'})
                with urllib.request.urlopen(request, timeout=30) as response:
                    if response.status != 206 or response.headers.get('Content-Range') != f'bytes {start}-{end}/{size}':
                        raise ValueError('The server did not honor the verified byte range.')
                    data = response.read(end - start + 1)
                if len(data) != end - start + 1:
                    raise ValueError('Incomplete artifact range.')
                with partial.open('r+b') as handle:
                    handle.seek(start)
                    handle.write(data)
                print(f'{path.name}: received range {start}-{end}', flush=True)
                return
            except Exception:
                if attempt == 2:
                    raise
                time.sleep(2)

    with ThreadPoolExecutor(max_workers=8) as regions:
        list(regions.map(region, range(0, size, chunk)))
    digest = hashlib.sha256()
    with partial.open('rb') as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b''):
            digest.update(block)
    if digest.hexdigest() != expected:
        # Interrupted writes or a different revision can invalidate candidate
        # ranges. Never promote them; the next invocation starts cleanly.
        partial.unlink()
        raise ValueError('Upstream ranged artifact checksum mismatch. Retry for a clean transfer.')
    partial.replace(path)


def download(repo: str, destination: Path) -> str:
    if repo not in ALLOWED:
        raise ValueError('Only the reviewed upstream repositories are supported.')
    metadata = json.load(urllib.request.urlopen(f'https://huggingface.co/api/models/{repo}?blobs=true', timeout=30))
    revision = metadata['sha']
    destination.mkdir(parents=True, exist_ok=True)
    allowed = {'config.json','generation_config.json','tokenizer_config.json','source.spm','target.spm','vocab.json','pytorch_model.bin',
               'model.bin','tokenizer.json','vocabulary.json','vocabulary.txt','preprocessor_config.json'}
    def fetch(item):
        name = item['rfilename']
        if name not in allowed:
            return
        path = destination / name
        expected = item.get('lfs', {}).get('sha256')
        if path.is_file() and path.stat().st_size == item['size']:
            if not expected or hashlib.sha256(path.read_bytes()).hexdigest() == expected:
                return
        partial = path.with_suffix(path.suffix + '.partial')
        if item['size'] > 16 * 1024 * 1024:
            download_ranges(f'https://huggingface.co/{repo}/resolve/{revision}/{name}', path, item['size'], expected)
            return
        for attempt in range(3):
            try:
                with urllib.request.urlopen(f'https://huggingface.co/{repo}/resolve/{revision}/{name}', timeout=60) as response, partial.open('wb') as handle:
                    count, digest = 0, hashlib.sha256()
                    while block := response.read(1024*1024):
                        handle.write(block); digest.update(block); count += len(block)
                        if count % (16*1024*1024) == 0:
                            print(f'{repo}/{name}: {count//(1024*1024)} MB', flush=True)
                if count != item['size'] or expected and digest.hexdigest() != expected:
                    raise ValueError('Upstream artifact size/checksum mismatch.')
                partial.replace(path)
                return
            except Exception:
                if attempt == 2:
                    raise
                time.sleep(2)
    with ThreadPoolExecutor(max_workers=3) as pool:
        list(pool.map(fetch, metadata['siblings']))
    return revision
