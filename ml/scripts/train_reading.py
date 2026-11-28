"""Fine-tune Whisper decoder attention on a small bilingual speech corpus."""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import random
import sys
import time
import wave

os.environ.setdefault('USE_TF', '0')
os.environ.setdefault('USE_FLAX', '0')
os.environ.setdefault('TOKENIZERS_PARALLELISM', 'false')

import numpy as np
import torch
from transformers import WhisperFeatureExtractor, WhisperTokenizerFast, WhisperForConditionalGeneration
from transformers import get_linear_schedule_with_warmup
from transformers.modeling_outputs import BaseModelOutput

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from services.inference.app.translation_runtime import file_sha256


def read_rows(root, split):
    return [json.loads(line) for line in (root / (split + '.jsonl')).read_text(encoding='utf-8').splitlines()]


def samples(path):
    with wave.open(str(path), 'rb') as audio:
        if (audio.getnchannels(), audio.getsampwidth(), audio.getframerate()) != (1, 2, 16000):
            raise ValueError('Training expects mono 16-bit 16 kHz recordings.')
        return np.frombuffer(audio.readframes(audio.getnframes()), dtype='<i2').astype(np.float32) / 32768


def encode_records(records, corpus, cache, extractor, tokenizer, model, foundation_hash):
    cache.mkdir(parents=True, exist_ok=True)
    encoded = []
    model.eval()
    for index, record in enumerate(records, 1):
        key = hashlib.sha256((foundation_hash + record['sha256']).encode()).hexdigest()
        path = cache / (key + '.npy')
        if not path.is_file():
            audio = samples(corpus / record['audio'])
            features = extractor(audio, sampling_rate=16000, return_tensors='pt').input_features
            with torch.no_grad():
                hidden = model.model.encoder(features).last_hidden_state[0].to(torch.float16).numpy()
            temporary = path.with_suffix('.part')
            with temporary.open('wb') as handle:
                np.save(handle, hidden)
            temporary.replace(path)
            del audio, features, hidden
        tokenizer.set_prefix_tokens(language='tagalog' if record['language'] == 'fil' else 'english', task='transcribe')
        labels = tokenizer(record['text']).input_ids
        if labels[0] == model.config.decoder_start_token_id:
            labels = labels[1:]
        encoded.append(dict(record, features=str(path), labels=labels))
        if index % 25 == 0 or index == len(records):
            print(f'Encoded speech recordings {index}/{len(records)}', flush=True)
    return encoded


def tensors(record):
    hidden = torch.from_numpy(np.load(record['features'])).to(torch.float32).unsqueeze(0)
    labels = torch.tensor([record['labels']], dtype=torch.long)
    return BaseModelOutput(last_hidden_state=hidden), labels


def validation_loss(model, records):
    model.eval()
    losses = []
    with torch.no_grad():
        for record in records:
            hidden, labels = tensors(record)
            output = model(encoder_outputs=hidden, labels=labels, use_cache=False)
            losses.append(float(output.loss))
    return sum(losses) / len(losses)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--corpus', type=Path, required=True)
    parser.add_argument('--foundation', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--epochs', type=int, default=2)
    parser.add_argument('--learning-rate', type=float, default=1e-5)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    torch.set_num_threads(2)
    torch.manual_seed(20261116)
    extractor = WhisperFeatureExtractor.from_pretrained(args.foundation, local_files_only=True)
    tokenizer = WhisperTokenizerFast.from_pretrained(args.foundation, local_files_only=True)
    model = WhisperForConditionalGeneration.from_pretrained(args.foundation, local_files_only=True)
    model.requires_grad_(False)
    for name, parameter in model.named_parameters():
        if name.startswith('model.decoder.layers.') and ('.q_proj.' in name or '.v_proj.' in name):
            parameter.requires_grad_(True)
    trainable = [parameter for parameter in model.parameters() if parameter.requires_grad]
    trainable_count = sum(parameter.numel() for parameter in trainable)
    print(f'Trainable decoder attention parameters: {trainable_count:,}', flush=True)
    foundation_hash = file_sha256(args.foundation / 'model.safetensors')
    train = encode_records(read_rows(args.corpus, 'train'), args.corpus, args.output / 'features', extractor, tokenizer, model, foundation_hash)
    validation = encode_records(read_rows(args.corpus, 'validation'), args.corpus, args.output / 'features', extractor, tokenizer, model, foundation_hash)
    before = validation_loss(model, validation)
    print(f'Validation loss before training: {before:.4f}', flush=True)
    accumulation = 4
    updates_per_epoch = math.ceil(len(train) / accumulation)
    total_updates = updates_per_epoch * args.epochs
    optimizer = torch.optim.AdamW(trainable, lr=args.learning_rate, weight_decay=0.01)
    scheduler = get_linear_schedule_with_warmup(optimizer, max(1, total_updates // 10), total_updates)
    history = []
    best = float('inf')
    update = 0
    started = time.monotonic()
    for epoch in range(args.epochs):
        ordered = train.copy()
        random.Random(20261116 + epoch).shuffle(ordered)
        model.train()
        optimizer.zero_grad(set_to_none=True)
        recent = []
        for index, record in enumerate(ordered, 1):
            hidden, labels = tensors(record)
            result = model(encoder_outputs=hidden, labels=labels, use_cache=False)
            recent.append(float(result.loss.detach()))
            (result.loss / accumulation).backward()
            if index % accumulation == 0 or index == len(ordered):
                torch.nn.utils.clip_grad_norm_(trainable, 1.0)
                optimizer.step()
                scheduler.step()
                optimizer.zero_grad(set_to_none=True)
                update += 1
                if update % 10 == 0:
                    print(f'Training update {update}/{total_updates}, loss {sum(recent) / len(recent):.4f}', flush=True)
                    recent.clear()
        loss = validation_loss(model, validation)
        history.append({'epoch': epoch + 1, 'validation_loss': loss, 'optimizer_updates': update})
        print(f'Epoch {epoch + 1} validation loss: {loss:.4f}', flush=True)
        if loss < best:
            best = loss
            target = args.output / 'best-hf'
            model.save_pretrained(target, safe_serialization=True)
            tokenizer.save_pretrained(target)
            extractor.save_pretrained(target)
    report = {
        'model_version': 'linguakids-reading-v1', 'foundation': 'openai/whisper-tiny',
        'foundation_sha256': foundation_hash, 'method': 'Frozen encoder and decoder attention query/value fine-tuning',
        'trainable_parameters': trainable_count, 'training_recordings': len(train),
        'validation_recordings': len(validation), 'test_recordings': len(read_rows(args.corpus, 'test')),
        'epochs': args.epochs, 'optimizer_updates': update, 'learning_rate': args.learning_rate,
        'seed': 20261116, 'baseline_validation_loss': before, 'best_validation_loss': best,
        'history': history, 'seconds': round(time.monotonic() - started, 2),
        'dataset': json.loads((args.corpus / 'manifest.json').read_text(encoding='utf-8')),
        'assessment_type': 'reading_recognition', 'pronunciation_assessment_available': False,
    }
    (args.output / 'training-report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps({key: report[key] for key in ['model_version', 'optimizer_updates', 'best_validation_loss', 'seconds']}), flush=True)


if __name__ == '__main__':
    main()
