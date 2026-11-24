"""Real Marian fine-tuning in both directions. Invoked only by the worker/CLI."""
import argparse
import gc
import json
import os
from pathlib import Path
import torch
from huggingface_hub import HfApi
from datasets import Dataset
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM, DataCollatorForSeq2Seq, Seq2SeqTrainer, Seq2SeqTrainingArguments, TrainerCallback, set_seed
from ml.scripts.prepare_dataset import load_rows, assign_splits
from ml.scripts.training_readiness import MODELS, local_foundation, checked_dataset_manifest
from services.inference.app.translation_runtime import file_sha256


class Progress(TrainerCallback):
    def __init__(self, path, direction):
        self.path, self.direction = path, direction

    def on_log(self, args, state, control, logs=None, **kwargs):
        value = {'phase': 'training', 'direction': self.direction, 'step': state.global_step,
                 'total_steps': state.max_steps, 'epoch': state.epoch,
                 'logs': {k: v for k, v in (logs or {}).items() if isinstance(v, (int, float))}}
        tmp = self.path.with_suffix('.tmp')
        tmp.write_text(json.dumps(value), encoding='utf-8')
        os.replace(tmp, self.path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dataset', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--epochs', type=int, default=3)
    parser.add_argument('--batch-size', type=int, default=2)
    parser.add_argument('--gradient-accumulation', type=int, default=4)
    parser.add_argument('--base-package', type=Path, help='Verified local Marian pair; avoids downloading the foundation again.')
    parser.add_argument('--dataset-manifest', type=Path, help='Preserve and verify the frozen dataset source/license metadata.')
    args = parser.parse_args()
    if not 1 <= args.epochs <= 20 or not 1 <= args.batch_size <= 16:
        raise ValueError('Training configuration exceeds supported limits.')
    set_seed(42)
    base_manifest = local_foundation(args.base_package) if args.base_package else None
    dataset_manifest = checked_dataset_manifest(args.dataset, args.dataset_manifest) if args.dataset_manifest else None
    
    # Load dataset and check size
    rows = load_rows(args.dataset)
    dataset_size = len(rows)
    
    # Warn about training time for large datasets
    if dataset_size > 15000:
        print(f"WARNING: Large dataset detected: {dataset_size:,} pairs")
        print(f"WARNING: Estimated training time: {args.epochs * dataset_size * 2 // 3600}-{args.epochs * dataset_size * 3 // 3600} hours on CPU")
        print(f"WARNING: Training will proceed in both directions with memory optimizations enabled.")
    
    splits = assign_splits(rows, 42, (.8, .1, .1))
    if any(not rows for rows in splits.values()):
        raise ValueError('Dataset needs enough unrelated pairs for nonempty train, validation and test splits.')
    args.output.mkdir(parents=True, exist_ok=True)
    package = args.output / 'package'
    if package.exists():
        print("WARNING: Model package already exists, assuming resume from checkpoint")
        # Don't raise error, allow resuming
    revisions = {}
    
    # Check if we're resuming mid-training
    resume_from_checkpoint = None
    current_direction_index = 0
    directions_list = list(MODELS.items())
    
    # Check which direction we were training
    for idx, (direction, name) in enumerate(directions_list):
        checkpoint_dirs = list((args.output / direction).glob('checkpoint-*')) if (args.output / direction).exists() else []
        if checkpoint_dirs:
            resume_from_checkpoint = str(max(checkpoint_dirs, key=lambda p: int(p.name.split('-')[1])))
            current_direction_index = idx
            print(f"Found checkpoint for {direction}: {resume_from_checkpoint}")
            break
    
    for idx, (direction, name) in enumerate(directions_list):
        # Skip directions that were already completed
        if idx < current_direction_index:
            print(f"Skipping {direction} - already completed")
            continue
            
        source, target = ('english', 'filipino') if direction == 'en_to_fil' else ('filipino', 'english')
        revision = base_manifest['upstream_revisions'][name] if base_manifest else HfApi().model_info(name).sha
        revisions[name] = revision
        source_path = args.base_package / direction if base_manifest else name
        options = {'local_files_only': True} if base_manifest else {'revision': revision}
        tokenizer = AutoTokenizer.from_pretrained(source_path, trust_remote_code=False, **options)
        model = AutoModelForSeq2SeqLM.from_pretrained(source_path, trust_remote_code=False, **options)
        def tokenize(batch):
            value = tokenizer(batch[source], max_length=256, truncation=True)
            value['labels'] = tokenizer(text_target=batch[target], max_length=256, truncation=True)['input_ids']
            return value
        data = {key: Dataset.from_list(rows).map(tokenize, batched=True) for key, rows in splits.items()}
        training = Seq2SeqTrainingArguments(output_dir=str(args.output / direction),
            num_train_epochs=args.epochs, per_device_train_batch_size=args.batch_size,
            per_device_eval_batch_size=args.batch_size, gradient_accumulation_steps=args.gradient_accumulation,
            learning_rate=2e-5, eval_strategy='epoch', save_strategy='epoch', logging_steps=1,
            save_total_limit=2, load_best_model_at_end=True, fp16=torch.cuda.is_available(),
            report_to='none', seed=42)
        trainer = Seq2SeqTrainer(model=model, args=training, train_dataset=data['train'],
            eval_dataset=data['validation'], processing_class=tokenizer,
            data_collator=DataCollatorForSeq2Seq(tokenizer, model=model),
            callbacks=[Progress(args.output / 'progress.json', direction)])
        
        # Resume from checkpoint if this is the direction we were training
        if idx == current_direction_index and resume_from_checkpoint:
            print(f"Resuming training for {direction} from {resume_from_checkpoint}")
            trainer.train(resume_from_checkpoint=resume_from_checkpoint)
        else:
            trainer.train()
        trainer.save_model(package / direction)
        tokenizer.save_pretrained(package / direction)
        del trainer, model, tokenizer, data
        gc.collect()
        
        # Memory optimization: clear cache between directions
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        print(f"OK: Completed training for {direction}, memory cleared for next direction")
    import csv
    with (args.output / 'held_out.csv').open('w', encoding='utf-8', newline='') as handle:
        writer = csv.DictWriter(handle, fieldnames=['english', 'filipino'])
        writer.writeheader()
        writer.writerows({k: r[k] for k in writer.fieldnames} for r in splits['test'])
    manifest = {'architecture': 'marian-pair', 'provenance': 'fine_tuned', 'upstream_revisions': revisions, 'model_version': 'marian-' + args.output.parent.name,
        'foundation_models': MODELS, 'foundation_license': 'Apache-2.0',
        'dataset_version': file_sha256(args.dataset), 'dataset_provenance': dataset_manifest,
        'review_required': True, 'directions': list(MODELS),
        'files': {p.relative_to(package).as_posix(): file_sha256(p) for p in sorted(package.rglob('*')) if p.is_file()}}
    (package / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')


if __name__ == '__main__':
    main()
