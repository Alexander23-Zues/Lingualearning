import argparse
import json
from pathlib import Path

import numpy as np
import sacrebleu
from datasets import load_dataset
from transformers import (
    AutoModelForSeq2SeqLM,
    AutoTokenizer,
    DataCollatorForSeq2Seq,
    EarlyStoppingCallback,
    Seq2SeqTrainer,
    Seq2SeqTrainingArguments,
    set_seed,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--base-model", default="google/mt5-small")
    parser.add_argument("--learning-rate", type=float, default=3e-4)
    parser.add_argument("--epochs", type=float, default=5)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--gradient-accumulation", type=int, default=4)
    parser.add_argument("--max-source-length", type=int, default=256)
    parser.add_argument("--max-target-length", type=int, default=256)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--early-stopping-patience", type=int, default=3)
    parser.add_argument("--resume-from-checkpoint", default=None)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    set_seed(args.seed)
    files = {name: str(args.dataset_dir / f"{name}.jsonl") for name in ("train", "validation", "test")}
    dataset = load_dataset("json", data_files=files)
    tokenizer = AutoTokenizer.from_pretrained(args.base_model)
    model = AutoModelForSeq2SeqLM.from_pretrained(args.base_model)

    def tokenize(batch):
        model_inputs = tokenizer(batch["input"], max_length=args.max_source_length, truncation=True)
        labels = tokenizer(text_target=batch["target"], max_length=args.max_target_length, truncation=True)
        model_inputs["labels"] = labels["input_ids"]
        return model_inputs

    tokenized = dataset.map(tokenize, batched=True, remove_columns=dataset["train"].column_names)

    def metrics(eval_prediction):
        predictions, labels = eval_prediction
        predictions = np.where(predictions != -100, predictions, tokenizer.pad_token_id)
        labels = np.where(labels != -100, labels, tokenizer.pad_token_id)
        decoded_predictions = tokenizer.batch_decode(predictions, skip_special_tokens=True)
        decoded_labels = tokenizer.batch_decode(labels, skip_special_tokens=True)
        return {
            "sacrebleu": sacrebleu.corpus_bleu(decoded_predictions, [decoded_labels]).score,
            "chrf": sacrebleu.corpus_chrf(decoded_predictions, [decoded_labels]).score,
        }

    training_args = Seq2SeqTrainingArguments(
        output_dir=str(args.output_dir),
        learning_rate=args.learning_rate,
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.batch_size,
        gradient_accumulation_steps=args.gradient_accumulation,
        eval_strategy="steps",
        save_strategy="steps",
        eval_steps=250,
        save_steps=250,
        logging_steps=50,
        predict_with_generate=True,
        generation_max_length=args.max_target_length,
        load_best_model_at_end=True,
        metric_for_best_model="eval_loss",
        greater_is_better=False,
        save_total_limit=3,
        fp16=True,
        report_to="none",
        seed=args.seed,
    )
    trainer = Seq2SeqTrainer(
        model=model,
        args=training_args,
        train_dataset=tokenized["train"],
        eval_dataset=tokenized["validation"],
        processing_class=tokenizer,
        data_collator=DataCollatorForSeq2Seq(tokenizer, model=model),
        compute_metrics=metrics,
        callbacks=[EarlyStoppingCallback(early_stopping_patience=args.early_stopping_patience)],
    )
    trainer.train(resume_from_checkpoint=args.resume_from_checkpoint)
    best_dir = args.output_dir / "best"
    trainer.save_model(best_dir)
    tokenizer.save_pretrained(best_dir)

    results = {}
    for direction in ("en_to_fil", "fil_to_en"):
        indices = [index for index, value in enumerate(dataset["test"]["direction"]) if value == direction]
        direction_dataset = tokenized["test"].select(indices)
        result = trainer.evaluate(direction_dataset, metric_key_prefix=f"test_{direction}")
        results[direction] = {key: float(value) for key, value in result.items() if isinstance(value, (int, float))}
    (args.output_dir / "measured_metrics.json").write_text(json.dumps(results, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
