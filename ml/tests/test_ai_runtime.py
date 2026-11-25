import hashlib
import io
import json
import wave
import pytest
from services.inference.app.reading import compare_reading, validate_wav
from services.inference.app.translation_runtime import verified_manifest


def test_reading_alignment_counts_repeats_and_marks_missing_words():
    result = compare_reading('The book is on the table.', 'The book on the table')
    assert result['missing_words'] == ['is']
    assert result['matched_words'] == ['the','book','on','the','table']
    assert result['assessment_type'] == 'reading_recognition'
    assert result['pronunciation_assessment_available'] is False
    assert 'accuracy' not in result


def test_recognition_handles_filipino_and_empty_audio_transcripts():
    silent = compare_reading('Nasa mesa ang aklat.', '')
    assert silent['recognition_status'] == 'no_speech'
    assert silent['speech_detected'] is False
    assert silent['missing_words'] == silent['word_results'] == []
    assert compare_reading('Salamat, kaibigan!', 'salamat kaibigan')['missing_words'] == []


def test_wav_validation_limits_format_and_duration():
    data = io.BytesIO()
    with wave.open(data,'wb') as clip:
        clip.setnchannels(1); clip.setsampwidth(2); clip.setframerate(16000); clip.writeframes(b'\0\0'*16000)
    assert validate_wav(data.getvalue()) == 1
    with pytest.raises(ValueError): validate_wav(b'not audio')
    with pytest.raises(ValueError): validate_wav(b'x'*1_500_001)


def test_manifest_checksums_and_path_boundary(tmp_path):
    artifact = tmp_path/'model.safetensors'; artifact.write_bytes(b'fixture')
    manifest = {'model_version':'test', 'files': {'model.safetensors': hashlib.sha256(b'fixture').hexdigest()}}
    path = tmp_path/'manifest.json'; path.write_text(json.dumps(manifest))
    assert verified_manifest(tmp_path)['model_version'] == 'test'
    artifact.write_bytes(b'changed')
    with pytest.raises(ValueError): verified_manifest(tmp_path)
    manifest['files'] = {'../outside': 'a'*64}; path.write_text(json.dumps(manifest))
    with pytest.raises(ValueError): verified_manifest(tmp_path)


def test_worker_rejects_modified_frozen_pairs_before_training():
    from ml.scripts.training_worker import verified_pairs
    pairs = [{'english': f'word {i}', 'filipino': f'salita {i}'} for i in range(20)]
    snapshot = {'pairs': pairs, 'source': 'Original test fixture', 'license': 'Original',
                'checksum': hashlib.sha256(json.dumps(pairs, ensure_ascii=False, sort_keys=True).encode()).hexdigest()}
    assert verified_pairs(snapshot) == pairs
    pairs[0]['filipino'] = 'changed after approval'
    with pytest.raises(ValueError, match='checksum'):
        verified_pairs(snapshot)


def test_worker_rejects_an_unsplittable_frozen_dataset_before_starting_training():
    from ml.scripts.training_worker import verified_pairs
    pairs = [{'english': f'word {i}', 'filipino': 'one shared target'} for i in range(20)]
    snapshot = {'pairs': pairs, 'source': 'Original fixture', 'license': 'Original',
        'checksum': hashlib.sha256(json.dumps(pairs, ensure_ascii=False, sort_keys=True).encode()).hexdigest()}
    with pytest.raises(ValueError, match='empty'):
        verified_pairs(snapshot)
