"""Measure open-vocabulary speech recognition on held-out human recordings."""
import argparse
import json
from pathlib import Path
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from services.inference.app.reading import ReadingRuntime, words


def errors(reference, hypothesis):
    previous = list(range(len(hypothesis) + 1))
    for index, expected in enumerate(reference, 1):
        current = [index]
        for position, spoken in enumerate(hypothesis, 1):
            current.append(min(current[-1] + 1, previous[position] + 1,
                               previous[position - 1] + (expected != spoken)))
        previous = current
    return previous[-1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model', type=Path, required=True)
    parser.add_argument('--corpus', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--split', choices=['validation', 'test'], default='test')
    args = parser.parse_args()
    runtime = ReadingRuntime(str(args.model))
    records = [json.loads(line) for line in (args.corpus / (args.split + '.jsonl')).read_text(encoding='utf-8').splitlines()]
    totals = {language: {'word_errors': 0, 'reference_words': 0, 'recordings': 0} for language in ['en', 'fil']}
    results = []
    started = time.monotonic()
    for index, record in enumerate(records, 1):
        transcript = runtime.recognize((args.corpus / record['audio']).read_bytes(), record['language'])
        reference, hypothesis = words(record['text']), words(transcript)
        count = errors(reference, hypothesis)
        total = totals[record['language']]
        total['word_errors'] += count
        total['reference_words'] += len(reference)
        total['recordings'] += 1
        results.append({'source_id': record['source_id'], 'language': record['language'], 'expected': record['text'],
                        'transcript': transcript, 'word_errors': count, 'reference_words': len(reference)})
        if index % 8 == 0:
            print(f'Evaluated held-out recordings {index}/{len(records)}', flush=True)
    for total in totals.values():
        total['word_error_rate'] = total['word_errors'] / total['reference_words']
    report = {'split': args.split, 'model': str(args.model), 'metrics': totals, 'recordings': results,
              'seconds': round(time.monotonic() - started, 2)}
    args.output.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding='utf-8')
    print(json.dumps(totals), flush=True)


if __name__ == '__main__':
    main()
