# Translation training

Training is intentionally separate from ordinary development. Use a suitable CUDA GPU machine and an approved immutable dataset snapshot exported by an administrator. The included template has headers only; it is not a corpus.

The configurable foundation is `google/mt5-small` (Apache-2.0). It is a multilingual text-to-text checkpoint, not an already trained English–Filipino translator. Fine-tuning creates both directions with explicit prefixes:

- `translate English to Filipino: ...`
- `translate Filipino to English: ...`

## GPU workflow

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements-training.txt
python scripts/prepare_dataset.py --input approved_snapshot.csv --output-dir prepared --seed 42
python scripts/train.py --dataset-dir prepared --output-dir outputs/run-001 --epochs 5 --batch-size 8 --gradient-accumulation 4
python scripts/package_model.py --model-dir outputs/run-001/best --output-dir packages/linguakids-mt5-001 --dataset-version SNAPSHOT_VERSION
```

Splits are formed by normalized related-pair groups before bidirectional examples are expanded. Duplicate/reversed pairs therefore remain in one split. Training supports checkpoints, resume, early stopping, configurable learning rate, epochs, batch size, and gradient accumulation. Metrics are measured, never pre-filled.
