"""Download public speech artifacts using verified, resumable HTTP byte ranges."""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
from pathlib import Path
import time

import httpx


def file_checksum(path):
    with path.open('rb') as handle:
        return hashlib.file_digest(handle, 'sha256').hexdigest()


def download_file(url, path, expected_sha256=None, workers=4, expected_size=None):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with httpx.Client(timeout=35, follow_redirects=True) as client:
        if expected_size is None:
            separator = '&' if '?' in url else '?'
            probe = url + separator + f'speech_size={time.time_ns()}'
            with client.stream('GET', probe, headers={'Range': 'bytes=0-0'}) as response:
                response.raise_for_status()
                size = int(response.headers['content-range'].rsplit('/', 1)[1])
        else:
            size = expected_size
        if path.is_file() and path.stat().st_size == size and (not expected_sha256 or file_checksum(path) == expected_sha256):
            return path
        temporary = path.with_suffix('.part')
        offset = temporary.stat().st_size if temporary.is_file() else 0
        if offset > size:
            raise ValueError('Partial download is larger than its source.')
        parts = path.parent / (path.name + '.parts')
        parts.mkdir(exist_ok=True)
        block_size = 4 * 1024 * 1024
        ranges = [(begin, min(begin + block_size, size) - 1) for begin in range(offset, size, block_size)]

        def fetch(interval):
            begin, end = interval
            target = parts / str(begin)
            if target.is_file() and target.stat().st_size == end - begin + 1:
                return end - begin + 1
            for attempt in range(4):
                # Distinct URLs prevent intermediaries reusing a different cached byte range.
                separator = '&' if '?' in url else '?'
                address = url + separator + f'speech_range={begin}&attempt={attempt}&fresh={time.time_ns()}'
                try:
                    with client.stream('GET', address, headers={'Range': f'bytes={begin}-{end}', 'Accept-Encoding': 'gzip'}) as response:
                        response.raise_for_status()
                        expected = f'bytes {begin}-{end}/{size}'
                        if response.status_code != 206 or response.headers.get('content-range') != expected:
                            raise ValueError('The server returned an unexpected byte range.')
                        data = bytearray()
                        for chunk in response.iter_raw():
                            data.extend(chunk)
                            if len(data) > end - begin + 1:
                                raise ValueError('The server exceeded the requested byte range.')
                    if len(data) != end - begin + 1:
                        raise ValueError('Incomplete byte range.')
                    partial = target.with_suffix('.part')
                    partial.write_bytes(data)
                    partial.replace(target)
                    return len(data)
                except (httpx.RequestError, httpx.HTTPStatusError, ValueError):
                    if attempt == 3:
                        raise
                    time.sleep(attempt + 1)

        completed = offset
        reported = offset
        with ThreadPoolExecutor(max_workers=workers) as pool:
            jobs = [pool.submit(fetch, interval) for interval in ranges]
            for future in as_completed(jobs):
                completed += future.result()
                if completed - reported >= 64 * 1024 * 1024 or completed == size:
                    print(f'{path.name}: downloaded {completed // (1024 * 1024)}/{size // (1024 * 1024)} MB', flush=True)
                    reported = completed
        with temporary.open('ab') as output:
            for begin, _ in ranges:
                source = parts / str(begin)
                with source.open('rb') as handle:
                    for chunk in iter(lambda: handle.read(1024 * 1024), b''):
                        output.write(chunk)
        if temporary.stat().st_size != size:
            raise ValueError('The assembled download has an incorrect size.')
        if expected_sha256:
            if file_checksum(temporary) != expected_sha256:
                raise ValueError('The speech artifact checksum does not match its publisher.')
        temporary.replace(path)
        for begin, _ in ranges:
            (parts / str(begin)).unlink(missing_ok=True)
        return path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('url')
    parser.add_argument('output', type=Path)
    parser.add_argument('--sha256')
    parser.add_argument('--size', type=int)
    args = parser.parse_args()
    download_file(args.url, args.output, args.sha256, expected_size=args.size)


if __name__ == '__main__':
    main()
