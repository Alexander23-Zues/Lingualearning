"""Prepare attributed text from a pinned OPUS Tatoeba release; no auto-publishing."""
import argparse
import csv
import hashlib
import io
import json
import re
import unicodedata
import zipfile
from collections import Counter
from pathlib import Path

from ml.scripts.prepare_dataset import normalize, assign_related_group_keys, assign_splits
from ml.scripts.training_readiness import pairs_summary

SOURCE = 'https://object.pouta.csc.fi/OPUS-Tatoeba/v2023-04-12/moses/en-tl.txt.zip'
ARCHIVE_SHA256 = '9abddc7d2fcea307e8582285617d1a10246fdb9050b6c6345243cb4b9991f40b'
LICENSE = 'CC BY 2.0 FR'
TOPICS = {
    'classroom': 'book books pencil pencils pen paper teacher teachers student students school classroom learn learning read reading write writing story stories word words number numbers color colors lesson lessons',
    'nature': 'bird birds cat cats dog dogs animal animals sun moon tree trees flower flowers leaf leaves rain stars star garden sky',
    'everyday': 'water apple apples banana bananas fruit food bread milk rice breakfast lunch dinner morning afternoon evening',
    'family_and_kindness': 'friend friends family mother father sister brother help please thanks thank happy smile kind',
}
BLOCKED = set(('kill killed killing murder die died dying death dead blood gun guns knife weapon war bomb drunk alcohol beer wine '
    'sex sexual rape abuse naked nude drug drugs cocaine heroin suicide hate stupid idiot fool hell damn fuck shit ass '
    'magnakaw nakaw patayin patay mamatay pumatay baril bomba alak lasing droga hubad bastos tanga bobo gago puta '
    'password address telephone marriage marry married divorce pregnant pregnancy maiden smoking smoke cigarette cigarettes').split())
FIELDS = ['english', 'filipino', 'source', 'license', 'category', 'reviewer_notes', 'pair_id', 'source_line']


def tokens(text):
    return re.findall(r"[^\W_]+(?:['’][^\W_]+)*", text.casefold())


def topic_for(english):
    words = set(tokens(english))
    return next((topic for topic, keywords in TOPICS.items() if words.intersection(keywords.split())), None)


def eligible(english, filipino):
    combined = english + ' ' + filipino
    if any(mark in combined for mark in ['http:', 'https:', 'www.', '@', '<', '>', '\ufffd']):
        return False
    if any(unicodedata.category(char).startswith('C') for char in combined):
        return False
    if max(len(english), len(filipino)) > 180 or any(char.isdigit() for char in combined):
        return False
    if not 2 <= len(tokens(english)) <= 14 or not 2 <= len(tokens(filipino)) <= 18:
        return False
    return not set(tokens(combined)).intersection(BLOCKED)


def prepare(archive_path, output, max_pairs=1500):
    content = archive_path.read_bytes()
    if hashlib.sha256(content).hexdigest() != ARCHIVE_SHA256:
        raise ValueError('Dataset archive differs from the pinned reviewed source.')
    if output.exists():
        raise FileExistsError('Choose a new immutable dataset directory.')
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        if sum(item.file_size for item in archive.infolist()) > 10_000_000:
            raise ValueError('Unexpected expanded dataset size.')
        en = archive.read('Tatoeba.en-tl.en').decode('utf-8').splitlines()
        fil = archive.read('Tatoeba.en-tl.tl').decode('utf-8').splitlines()
        if len(en) != len(fil):
            raise ValueError('Sentence alignment counts do not match.')
        license_text = archive.read('LICENSE')
        readme = archive.read('README')
    smoke = Path('ml/data/classroom_smoke_test.csv')
    held_out_words = set()
    if smoke.is_file():
        for row in csv.DictReader(smoke.open(encoding='utf-8-sig')):
            held_out_words.update([normalize(row['english']), normalize(row['filipino'])])
    counts = Counter()
    rows, seen = [], set()
    for index, (english, filipino) in enumerate(zip(en, fil), 1):
        english, filipino = english.strip(), filipino.strip()
        topic = topic_for(english)
        if not eligible(english, filipino) or not topic:
            counts['length_topic_or_content_filter'] += 1
            continue
        key = normalize(english), normalize(filipino)
        if any(value in held_out_words for value in key):
            counts['existing_smoke_overlap'] += 1
            continue
        if key in seen:
            counts['exact_duplicate'] += 1
            continue
        seen.add(key)
        rows.append({'english': english, 'filipino': filipino, 'category': topic,
            'source': f'{SOURCE}#moses-line-{index}',
            'license': LICENSE, 'reviewer_notes': 'Automated text/topic screen; educator translation and curriculum review pending.',
            'pair_id': hashlib.sha256((english + '\u241f' + filipino).encode()).hexdigest()[:20], 'source_line': index})
    # The app currently permits one target per English input. Prefer the shortest
    # attested alternative, with a stable ID tie-break; never invent a translation.
    rows.sort(key=lambda row: (len(tokens(row['filipino'])), row['pair_id']))
    unique, sources = [], set()
    for row in rows:
        key = normalize(row['english'])
        if key in sources:
            counts['alternative_translation_removed'] += 1
            continue
        sources.add(key)
        unique.append(row)
    unique.sort(key=lambda row: hashlib.sha256(row['pair_id'].encode()).hexdigest())
    counts['not_selected_by_limit'] = max(0, len(unique) - max_pairs)
    rows = unique[:max_pairs]
    summary = pairs_summary(rows)
    assign_related_group_keys(rows)
    splits = assign_splits(rows, 42, (.8, .1, .1))
    output.mkdir(parents=True)
    (output / 'UPSTREAM-LICENSE.txt').write_bytes(license_text)
    (output / 'UPSTREAM-README.txt').write_bytes(readme)
    files = {}
    for name, values in {'candidate': rows, **splits}.items():
        target = output / f'{name}.csv'
        with target.open('w', encoding='utf-8', newline='') as handle:
            writer = csv.DictWriter(handle, fieldnames=FIELDS, extrasaction='ignore')
            writer.writeheader()
            writer.writerows(values)
        files[target.name] = hashlib.sha256(target.read_bytes()).hexdigest()
    manifest = {'dataset': 'OPUS Tatoeba en-tl', 'release': 'v2023-04-12', 'source_url': SOURCE,
        'source_archive_sha256': ARCHIVE_SHA256, 'original_pairs': len(en), 'license': LICENSE,
        'license_url': 'https://creativecommons.org/licenses/by/2.0/fr/',
        'attribution': 'Tatoeba contributors (https://tatoeba.org) via OPUS (https://opus.nlpl.eu). Exact release and aligned Moses row retained. J. Tiedemann (2012), Parallel Data, Tools and Interfaces in OPUS.',
        'modifications': 'Topic/length/content filters, exact deduplication, single attested alternative selection, grouped seed-42 splits.',
        'classroom_approved': False, 'human_review_pending': True, 'upstream_training_overlap': 'unknown',
        'summary': summary, 'excluded': dict(counts), 'files': files}
    (output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(manifest, indent=2))
    return manifest


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--archive', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--max-pairs', type=int, default=1500)
    args = parser.parse_args()
    if not 20 <= args.max_pairs <= 50000:
        raise ValueError('Choose 20-50,000 candidate pairs.')
    prepare(args.archive, args.output, args.max_pairs)


if __name__ == '__main__':
    main()
