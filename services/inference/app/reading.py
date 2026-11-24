"""Reading recognition, deliberately NOT phoneme/pronunciation assessment."""
import io
import re
import unicodedata
import wave
from dataclasses import dataclass
from difflib import SequenceMatcher

import numpy as np

from .memory import trim_memory


@dataclass(frozen=True)
class Recognition:
    transcript: str
    unclear: bool = False


def tokens(text: str) -> list[str]:
    return re.findall(r"[^\W_]+(?:['’][^\W_]+)*", unicodedata.normalize('NFKC', text))


def words(text: str) -> list[str]:
    return [token.casefold().replace("’", "'") for token in tokens(text)]


def compare_reading(expected: str, recognized: str, *, unclear: bool = False) -> dict:
    target, spoken = words(expected), words(recognized)
    if unclear or not spoken:
        return {'transcript': '', 'speech_detected': unclear,
                'recognition_status': 'unclear' if unclear else 'no_speech', 'matched_words': [],
                'missing_words': [], 'extra_words': [], 'word_results': [],
                'expected_word_count': len(target), 'assessment_type': 'reading_recognition',
                'pronunciation_assessment_available': False}
    matched, missing, extra = [], [], []
    correct_positions = set()
    for tag, a, b, c, d in SequenceMatcher(None, target, spoken, autojunk=False).get_opcodes():
        if tag == 'equal':
            matched.extend(target[a:b])
            correct_positions.update(range(a, b))
        else:
            missing.extend(target[a:b])
            extra.extend(spoken[c:d])
    
    # Build word-level results array matching expected text word order
    word_results = [
        {'word': word, 'correct': index in correct_positions, 'confidence': float(index in correct_positions)}
        for index, word in enumerate(tokens(expected))
    ]
    
    return {'transcript': recognized, 'speech_detected': True, 'recognition_status': 'recognized',
            'matched_words': matched, 'missing_words': missing,
            'extra_words': extra, 'expected_word_count': len(target),
            'word_results': word_results,
            'feedback': ('We heard all the reading words. Well done!'
                         if target and not missing else
                         'The app could not confirm every word. Listen to your recording and try again if needed.'),
            'assessment_type': 'reading_recognition', 'pronunciation_assessment_available': False}


def validate_wav(data: bytes) -> float:
    if not data or len(data) > 1_500_000:
        raise ValueError('Record a WAV clip of at most 45 seconds (1.5 MB).')
    try:
        with wave.open(io.BytesIO(data), 'rb') as clip:
            if clip.getnchannels() != 1 or clip.getsampwidth() != 2 or clip.getframerate() != 16000:
                raise ValueError('Use mono 16-bit, 16 kHz WAV audio.')
            duration = clip.getnframes() / clip.getframerate()
            if not 0 < duration <= 45:
                raise ValueError('Record between 0 and 45 seconds.')
            if len(clip.readframes(clip.getnframes())) != clip.getnframes() * 2:
                raise ValueError('Incomplete WAV recording.')
            return duration
    except (wave.Error, EOFError) as error:
        raise ValueError('Invalid WAV recording.') from error


def reduce_steady_noise(samples: np.ndarray) -> np.ndarray:
    """Estimate background from quiet frames, then attenuate it without cutting pauses."""
    window_size, hop = 512, 256
    if samples.size < 4000:
        return samples
    pad_right = window_size + (-samples.size % hop)
    padded = np.pad(samples, (hop, pad_right))
    frames = np.lib.stride_tricks.sliding_window_view(padded, window_size)[::hop]
    # Exclude padded frames from the noise estimate.
    levels = np.mean(frames[1:-2] ** 2, axis=1)
    floor, loud = np.percentile(levels, [20, 90])
    if floor < 0.001 ** 2 or loud < floor * 1.2:
        return samples
    window = np.hanning(window_size).astype(np.float32)
    spectrum = np.fft.rfft(frames * window)
    power = np.abs(spectrum) ** 2
    noise = np.median(power[1:-2][levels <= floor], axis=0)
    # Keep part of every frequency bin to preserve soft syllables and consonants.
    gain = np.sqrt(np.clip(1 - 2 * noise / np.maximum(power, 1e-12), 0.09, 1))
    filtered = np.fft.irfft(spectrum * gain, n=window_size) * window
    output = np.zeros_like(padded)
    weights = np.zeros_like(padded)
    window_power = window ** 2
    for i, frame in enumerate(filtered):
        start = i * hop
        output[start:start + window_size] += frame
        weights[start:start + window_size] += window_power
    span = slice(hop, hop + samples.size)
    return output[span] / weights[span]


class ReadingRuntime:
    def __init__(self, path: str):
        self.path = path
        self.model = self._load_model()

    def _load_model(self):
        from faster_whisper import WhisperModel
        return WhisperModel(self.path, device='cpu', compute_type='int8', cpu_threads=2, local_files_only=True)

    def release_model(self) -> None:
        self.model = None
        trim_memory()

    def recognize(self, data: bytes, language: str) -> str:
        return self.recognize_with_details(data, language).transcript

    def recognize_with_details(self, data: bytes, language: str) -> Recognition:
        validate_wav(data)
        # Input is already mono PCM at Whisper's 16 kHz sample rate.
        with wave.open(io.BytesIO(data), 'rb') as clip:
            samples = np.frombuffer(clip.readframes(clip.getnframes()), dtype='<i2').astype(np.float32)
        # Discard digital silence before loading the recognizer. Quiet speech still goes through VAD.
        if np.max(np.abs(samples)) < 16:
            return Recognition('')
        samples /= 32768.0
        if self.model is None:
            self.model = self._load_model()
        segments, _ = self.model.transcribe(reduce_steady_noise(samples), language='tl' if language == 'fil' else 'en',
                                           beam_size=3, vad_filter=True, temperature=0,
                                           vad_parameters={'threshold': 0.4, 'min_silence_duration_ms': 650,
                                                           'min_speech_duration_ms': 96, 'speech_pad_ms': 350},
                                           condition_on_previous_text=False)
        segments = list(segments)
        transcript = ' '.join(segment.text.strip() for segment in segments).strip()[:1200]
        spoken = [segment for segment in segments if words(segment.text)]
        # Confidence is a retry cue. It does not measure how the learner pronounced a word.
        unclear = bool(spoken and all(segment.avg_logprob < -1.2 for segment in spoken))
        return Recognition(transcript, unclear)
