"""Prepare an internal transcript-disjoint bilingual FLEURS speech corpus."""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import io
import json
from pathlib import Path
import random
import re
import time
import wave

import av
import httpx

MIRROR = "FluidInference/fleurs-full"
REVISION = "1cca811bb8ea4d370345f108f00518167040282c"
LANGUAGES = {"en": "en_us", "fil": "fil_ph"}
BASE = f"https://huggingface.co/datasets/{MIRROR}/resolve/{REVISION}"


def catalog(client, language):
    code = LANGUAGES[language]
    response = client.get(f"{BASE}/{code}/{code}.trans.txt")
    response.raise_for_status()
    unique = {}
    for line in response.text.splitlines():
        values = line.split(maxsplit=1)
        if len(values) != 2:
            continue
        source_id, text = values
        if not re.fullmatch(code + r"_\d+", source_id):
            raise ValueError("Unexpected public recording identifier.")
        normalized = " ".join(re.findall(r"[^\W_]+", text.casefold()))
        if 2 <= len(text.split()) and len(text) <= 300:
            unique.setdefault(normalized, {"source_id": source_id, "text": text, "language": language})
    candidates = list(unique.values())
    random.Random(20261117).shuffle(candidates)
    if len(candidates) < 80:
        raise ValueError("Insufficient unique speech samples for independent evaluation.")
    training_count = min(96 if language == "en" else 192, len(candidates) - 48)
    selected = []
    for split, start, count in [("test", 0, 24), ("validation", 24, 24), ("train", 48, training_count)]:
        selected += [dict(row, split=split) for row in candidates[start:start + count]]
    return selected


def pcm_wave(data):
    output = io.BytesIO()
    resampler = av.AudioResampler(format='s16', layout='mono', rate=16000)
    with wave.open(output, 'wb') as wav:
        wav.setparams((1, 2, 16000, 0, 'NONE', 'not compressed'))
        with av.open(io.BytesIO(data)) as clip:
            for frame in clip.decode(audio=0):
                for converted in resampler.resample(frame):
                    wav.writeframesraw(converted.to_ndarray().tobytes())
            for converted in resampler.resample(None):
                wav.writeframesraw(converted.to_ndarray().tobytes())
    return output.getvalue()



def recording(client, row, root):
    source_id = row["source_id"]
    relative = "audio/" + source_id + ".wav"
    path = root / relative
    if path.is_file():
        data = path.read_bytes()
    else:
        address = f"{BASE}/{LANGUAGES[row['language']]}/{source_id}.wav"
        for attempt in range(3):
            try:
                response = client.get(address + f"?reading_sample={time.time_ns()}")
                response.raise_for_status()
                if len(response.content) > 5_000_000:
                    raise ValueError("Unexpectedly large recording.")
                data = pcm_wave(response.content)
                with wave.open(io.BytesIO(data), "rb") as audio:
                    if not 0 < audio.getnframes() / 16000 <= 30:
                        return None
                temporary = path.with_suffix(".part")
                temporary.write_bytes(data)
                temporary.replace(path)
                break
            except (httpx.RequestError, httpx.HTTPStatusError):
                if attempt == 2:
                    raise
                time.sleep(attempt + 1)
    return dict(row, audio=relative, sha256=hashlib.sha256(data).hexdigest())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    root = args.output.resolve()
    (root / "audio").mkdir(parents=True, exist_ok=True)
    saved = []
    failures = []
    with httpx.Client(timeout=40, follow_redirects=True) as client:
        selected = catalog(client, "en") + catalog(client, "fil")
        print("Selected real speech recordings: " + str(len(selected)), flush=True)
        with ThreadPoolExecutor(max_workers=4) as pool:
            jobs = {pool.submit(recording, client, row, root): row for row in selected}
            for count, future in enumerate(as_completed(jobs), 1):
                try:
                    row = future.result()
                    if row is not None:
                        saved.append(row)
                except (httpx.RequestError, httpx.HTTPStatusError) as error:
                    failures.append({"id": jobs[future]["source_id"], "error": type(error).__name__})
                if count % 16 == 0 or count == len(selected):
                    print(f"Prepared human speech recordings {count}/{len(selected)}", flush=True)
    if failures:
        (root / "download-errors.json").write_text(json.dumps(failures), encoding="utf-8")
        raise RuntimeError(f"{len(failures)} recordings need a download retry. Successful files are cached.")
    for split in ["train", "validation", "test"]:
        rows = sorted((row for row in saved if row["split"] == split), key=lambda row: row["source_id"])
        path = root / (split + ".jsonl")
        temporary = path.with_suffix(".part")
        temporary.write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows), encoding="utf-8")
        temporary.replace(path)
    manifest = {
        "dataset": "google/fleurs", "mirror": MIRROR, "mirror_revision": REVISION,
        "source": "https://huggingface.co/datasets/google/fleurs",
        "license": "CC-BY-4.0", "seed": 20261117,
        "selection": "Internal transcript-disjoint split of mirrored FLEURS test recordings.",
        "recordings": {split: sum(row["split"] == split for row in saved) for split in ["train", "validation", "test"]},
        "per_language": {language: sum(row["language"] == language for row in saved) for language in LANGUAGES},
    }
    (root / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps(manifest), flush=True)


if __name__ == "__main__":
    main()
