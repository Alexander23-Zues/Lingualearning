"""Actual held-out bilingual evaluation of a verified model package."""
import argparse
import csv
import json
import statistics
import time
from pathlib import Path
from types import SimpleNamespace
import sacrebleu
from services.inference.app.translation_runtime import ModelRuntime


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--package', type=Path, required=True)
    parser.add_argument('--test-csv', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    rows = list(csv.DictReader(args.test_csv.open(encoding='utf-8-sig', newline='')))
    if not rows or any(not r.get('english', '').strip() or not r.get('filipino', '').strip() for r in rows):
        raise ValueError('A nonempty held-out english,filipino CSV is required.')
    runtime = ModelRuntime(args.package)
    report, samples = {}, []
    for direction, source, target in [('en_to_fil', 'english', 'filipino'), ('fil_to_en', 'filipino', 'english')]:
        predictions, references, latencies = [], [], []
        for row in rows:
            started = time.perf_counter()
            result = runtime.translate(SimpleNamespace(text=row[source], source_language='en' if source == 'english' else 'fil'))
            latencies.append((time.perf_counter() - started) * 1000)
            predictions.append(result)
            references.append(row[target])
            samples.append({'direction': direction, 'source': row[source], 'reference': row[target], 'prediction': result, 'reviewer_notes': ''})
        report[direction] = {'sacrebleu': sacrebleu.corpus_bleu(predictions, [references]).score,
                             'chrf': sacrebleu.corpus_chrf(predictions, [references]).score,
                             'sample_count': len(rows), 'latency_ms_p50': statistics.median(latencies),
                             'latency_ms_p95': sorted(latencies)[min(len(rows)-1, int(len(rows)*.95))]}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2), encoding='utf-8')
    args.output.with_suffix('.review.json').write_text(json.dumps(samples, ensure_ascii=False, indent=2), encoding='utf-8')


if __name__ == '__main__':
    main()
