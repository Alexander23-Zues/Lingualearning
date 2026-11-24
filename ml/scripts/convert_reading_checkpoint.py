"""Convert the checksum-verified official Whisper Tiny checkpoint for training."""
import argparse
import hashlib
import json
import os
from pathlib import Path

os.environ.setdefault('USE_TF', '0')
os.environ.setdefault('USE_FLAX', '0')

import torch
from transformers import GenerationConfig, WhisperConfig, WhisperForConditionalGeneration

CHECKSUM = '65147644a518d12f04e32d6f3b26facc3f8dd46e5390956a9424a650c0ce22b9'

# OpenAI/Hugging Face parameter names, following the upstream Whisper converter.
RENAMES = {
    'blocks': 'layers', 'mlp.0': 'fc1', 'mlp.2': 'fc2', 'mlp_ln': 'final_layer_norm',
    '.attn.query': '.self_attn.q_proj', '.attn.key': '.self_attn.k_proj',
    '.attn.value': '.self_attn.v_proj', '.attn_ln': '.self_attn_layer_norm',
    '.attn.out': '.self_attn.out_proj', '.cross_attn.query': '.encoder_attn.q_proj',
    '.cross_attn.key': '.encoder_attn.k_proj', '.cross_attn.value': '.encoder_attn.v_proj',
    '.cross_attn_ln': '.encoder_attn_layer_norm', '.cross_attn.out': '.encoder_attn.out_proj',
    'decoder.ln.': 'decoder.layer_norm.', 'encoder.ln.': 'encoder.layer_norm.',
    'token_embedding': 'embed_tokens', 'encoder.positional_embedding': 'encoder.embed_positions.weight',
    'decoder.positional_embedding': 'decoder.embed_positions.weight', 'ln_post': 'layer_norm',
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('checkpoint', type=Path)
    parser.add_argument('foundation', type=Path)
    args = parser.parse_args()
    with args.checkpoint.open('rb') as handle:
        if hashlib.file_digest(handle, 'sha256').hexdigest() != CHECKSUM:
            raise ValueError('The official Whisper checkpoint checksum failed.')
    torch.set_num_threads(2)
    checkpoint = torch.load(args.checkpoint, map_location='cpu', weights_only=True, mmap=True)
    config = WhisperConfig.from_pretrained(args.foundation, local_files_only=True)
    if config.d_model != checkpoint['dims']['n_audio_state'] or config.vocab_size != checkpoint['dims']['n_vocab']:
        raise ValueError('The checkpoint does not match its tokenizer/configuration.')
    model = WhisperForConditionalGeneration(config)
    model.generation_config = GenerationConfig.from_pretrained(args.foundation, local_files_only=True)
    converted = {}
    for key, tensor in checkpoint['model_state_dict'].items():
        if key in {'layers', 'blocks'}:
            continue
        for original, replacement in RENAMES.items():
            key = key.replace(original, replacement)
        converted['model.' + key] = tensor
    converted['proj_out.weight'] = converted['model.decoder.embed_tokens.weight']
    model.load_state_dict(converted, strict=True)
    del checkpoint, converted
    model.save_pretrained(args.foundation, safe_serialization=True)
    (args.foundation / 'origin.json').write_text(json.dumps({
        'foundation': 'openai/whisper-tiny', 'official_checkpoint_sha256': CHECKSUM,
        'source': 'https://github.com/openai/whisper',
    }, indent=2), encoding='utf-8')
    print('Verified Whisper Tiny foundation converted for training.', flush=True)


if __name__ == '__main__':
    main()
