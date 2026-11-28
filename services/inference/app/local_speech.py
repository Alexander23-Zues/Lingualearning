"""Generate English and Filipino audio from local MMS voice checkpoints."""
import io
import re
import wave
from pathlib import Path
from threading import Lock

from .memory import trim_memory


MAX_VOICE_CHUNK = 80


def voice_chunks(text: str):
    chunk = ""
    for word in text.split():
        if len(word) > MAX_VOICE_CHUNK:
            raise ValueError("Add spaces between words before listening.")
        if chunk and len(chunk) + len(word) + 1 > MAX_VOICE_CHUNK:
            boundaries = list(re.finditer(r"""[.!?…,:;]["'’”)]* """, chunk))
            if boundaries:
                end = boundaries[-1].end()
                yield chunk[:end].rstrip()
                chunk = chunk[end:]
            if chunk and len(chunk) + len(word) + 1 > MAX_VOICE_CHUNK:
                yield chunk
                chunk = ""
        chunk = f"{chunk} {word}" if chunk else word
    if chunk:
        yield chunk


class LocalSpeech:
    def __init__(self, root: Path):
        from transformers import AutoTokenizer

        self.paths = {}
        self.tokenizers = {}
        for language in ("en", "fil"):
            path = root / language
            if not (path / "model.safetensors").is_file():
                raise FileNotFoundError(f"Missing speech model for {language}.")
            self.paths[language] = path
            self.tokenizers[language] = AutoTokenizer.from_pretrained(path, local_files_only=True)
        self.model_language = None
        self.model = None
        self.model_lock = Lock()

    def release_model(self) -> None:
        with self.model_lock:
            self._release_model()

    def _release_model(self) -> None:
        if self.model is not None:
            self.model = None
            self.model_language = None
            trim_memory()

    def speak(self, text: str, language: str) -> bytes:
        with self.model_lock:
            return self._speak(text, language)

    def _speak(self, text: str, language: str) -> bytes:
        import torch
        from transformers import VitsModel

        chunks = list(voice_chunks(text))
        if not chunks:
            raise ValueError("Enter a word or sentence to listen.")
        # Keep only the selected voice checkpoint in memory.
        if self.model_language != language:
            self._release_model()
            self.model = VitsModel.from_pretrained(
                self.paths[language], local_files_only=True, use_safetensors=True,
            ).eval()
            self.model_language = language
        tokenizer = self.tokenizers[language]
        buffer = io.BytesIO()
        with wave.open(buffer, "wb") as audio:
            audio.setparams((1, 2, self.model.config.sampling_rate, 0, "NONE", "not compressed"))
            with torch.inference_mode(), torch.backends.mkldnn.flags(enabled=False):
                for chunk in chunks:
                    waveform = self.model(**tokenizer(chunk, return_tensors="pt")).waveform[0]
                    pcm = (waveform.clamp(-1, 1) * 32767).to(torch.int16).numpy().astype("<i2", copy=False)
                    audio.writeframesraw(pcm.tobytes())
                    del waveform, pcm
                    trim_memory()
        return buffer.getvalue()
