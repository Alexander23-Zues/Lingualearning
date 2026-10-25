import argparse
import json
import statistics
import time
from pathlib import Path

import sacrebleu
import torch
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-dir", type=Path, required=True)
    parser.add_argument("--test-file", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--human-review-template", type=Path)
    args = parser.parse_args()

    tokenizer = AutoTokenizer.from_pretrained(args.model_dir, local_files_only=True)
    model = AutoModelForSeq2SeqLM.from_pretrained(args.model_dir, local_files_only=True)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model.to(device).eval()
    grouped = {"en_to_fil": [], "fil_to_en": []}
    with args.test_file.open("r", encoding="utf-8") as handle:
        for line in handle:
            row = json.loads(line)
            grouped[row["direction"]].append(row)

    report = {}
    review_rows = []
    for direction, rows in grouped.items():
        predictions, references, latencies = [], [], []
        for row in rows:
            inputs = tokenizer(row["input"], return_tensors="pt", truncation=True).to(device)
            started = time.perf_counter()
            with torch.inference_mode():
                output = model.generate(**inputs, max_new_tokens=256, num_beams=4)
            if device.type == "cuda":
                torch.cuda.synchronize()
            latencies.append((time.perf_counter() - started) * 1000)
            prediction = tokenizer.decode(output[0], skip_special_tokens=True)
            predictions.append(prediction)
            references.append(row["target"])
            review_rows.append({
                "direction": direction,
                "source": row["input"],
                "reference": row["target"],
                "prediction": prediction,
                "meaning_1_to_5": "",
                "grammar_1_to_5": "",
                "naturalness_1_to_5": "",
                "teaching_suitability_1_to_5": "",
                "reviewer_notes": "",
            })
        ordered = sorted(latencies)
        report[direction] = {
            "sacrebleu": sacrebleu.corpus_bleu(predictions, [references]).score if rows else None,
            "chrf": sacrebleu.corpus_chrf(predictions, [references]).score if rows else None,
            "sample_count": len(rows),
            "latency_ms_p50": statistics.median(latencies) if latencies else None,
            "latency_ms_p95": ordered[min(len(ordered) - 1, round(len(ordered) * 0.95))] if ordered else None,
        }
    args.output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    review_path = args.human_review_template or args.output.with_name("human_review.jsonl")
    with review_path.open("w", encoding="utf-8") as handle:
        for row in review_rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
