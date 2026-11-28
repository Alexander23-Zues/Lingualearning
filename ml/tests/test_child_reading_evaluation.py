"""Synthetic fixtures test evaluation safeguards, never child-model accuracy."""
import copy
import json
import sys
import wave
from pathlib import Path
from types import SimpleNamespace

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from scripts.benchmark_child_reading import load_corpus, main as benchmark_main, model_fingerprint, run_benchmark
from scripts.evaluate_child_reading import compare_reports, evaluate
from services.inference.app.reading_comparison import compare_reading, mission_reading_decision


def row(**changes):
    return {'speaker_id': 'synthetic_child_1', 'recording_id': 'synthetic_clip_1',
            'reviewer_id': 'synthetic_teacher_1', 'consent_reference': 'synthetic-fixture-only',
            'is_child': True, 'grade_level': 1, 'language': 'en', 'condition': 'normal',
            'label_blinded': True, 'expected_text': 'The little bird sings.',
            'human_transcript': 'The little bird sings.', 'teacher_reading_correct': True,
            'recognized_text': 'The little bird sings.', 'recognition_status': 'recognized',
            'audio_sha256': 'a' * 64, 'model_sha256': 'b' * 64, 'runtime_sha256': 'c' * 64, **changes}


@pytest.mark.parametrize(('expected', 'spoken', 'unclear', 'decision'), [
    ('The bird sings.', 'The bird sings.', False, 'auto_pass'),
    ('The bird sings.', 'The... bird... sings.', False, 'auto_pass'),
    ('The bird sings.', 'The, the bird sings.', False, 'auto_pass'),
    ('The bird sings.', 'The bird.', False, 'teacher_review'),
    ('The bird sings.', 'The bird sings. Look over there.', False, 'teacher_review'),
    ('The bird sings.', 'The bird sings.', True, 'teacher_review'),
    ('The bird sings.', '', False, 'no_evidence'),
    ("Don't stop.", 'DON’T stop!', False, 'auto_pass'),
])
def test_measures_actual_mission_word_policy(expected, spoken, unclear, decision):
    assert mission_reading_decision(compare_reading(expected, spoken, unclear=unclear)) == decision


def test_uncertainty_is_not_counted_as_a_successful_exact_transcript():
    report = evaluate([row(recognition_status='unclear')])
    assert report['overall']['auto_passes'] == 0
    assert report['overall']['teacher_reviews'] == 1
    assert report['overall']['correct_readings_not_auto_passed'] == 1
    assert report['overall']['word_error_rate'] == 1


def test_counts_false_passes_when_recognizer_hallucinates_the_target():
    report = evaluate([row(human_transcript='The bird sleeps.', teacher_reading_correct=False)])
    assert report['overall']['false_auto_passes'] == 1
    assert report['overall']['false_auto_pass_rate'] == 1


def test_silence_is_not_a_successful_reading_or_a_zero_wer_observation():
    report = evaluate([row(condition='silence', human_transcript='', teacher_reading_correct=False,
                           recognized_text='', recognition_status='no_speech')])
    assert report['overall']['no_evidence'] == 1
    assert report['overall']['word_error_rate'] is None
    assert report['overall']['false_speech_on_silence'] == 0
    assert report['activation_allowed'] is False


def test_detects_false_speech_on_silence_including_unclear_audio():
    report = evaluate([row(condition='silence', human_transcript='', teacher_reading_correct=False,
                           recognition_status='unclear')])
    assert report['overall']['false_speech_on_silence'] == 1
    assert report['overall']['auto_passes'] == 0


@pytest.mark.parametrize('changes', [
    {'is_child': 'true'}, {'teacher_reading_correct': 'false'}, {'consent_reference': ' '},
    {'reviewer_id': 'teacher@example.com'}, {'recording_id': ''}, {'speaker_id': 'A child name'},
    {'grade_level': True}, {'grade_level': 7}, {'language': 'fil'}, {'label_blinded': False},
    {'expected_text': '...'}, {'human_transcript': None}, {'condition': 'unknown'},
    {'condition': 'silence'}, {'recognized_text': None}, {'recognition_status': None},
    {'recognized_text': '', 'recognition_status': 'recognized'},
])
def test_missing_or_conflicting_evidence_is_rejected(changes):
    with pytest.raises(ValueError):
        evaluate([row(**changes)])


def test_duplicate_ids_and_speaker_leakage_are_rejected():
    with pytest.raises(ValueError, match='Duplicate'):
        evaluate([row(), row()])
    with pytest.raises(ValueError, match='training data'):
        evaluate([row()], ['synthetic_child_1'])


def test_missing_training_speaker_list_is_not_called_verified_disjoint():
    report = evaluate([row()])
    assert report['speaker_disjoint'] is None
    assert any('unverified' in gap for gap in report['coverage_gaps'])


def test_mixed_models_cannot_be_reported_as_one_accuracy_measurement():
    with pytest.raises(ValueError, match='one checksum-identified'):
        evaluate([row(), row(recording_id='other_clip', model_sha256='d' * 64)])
    with pytest.raises(ValueError, match='one checksum-identified'):
        evaluate([row(runtime_sha256=None)])


def test_coverage_is_reported_per_grade_condition_and_both_teacher_labels():
    report = evaluate([])
    assert report['recordings'] == 0
    assert report['coverage_complete'] is False
    assert len(report['grades']) == 6
    assert set(report['groups']) == {'normal', 'slow', 'accent', 'silence', 'classroom_noise'}
    assert report['overall']['teacher_label_agreement'] is None


def test_complete_synthetic_coverage_still_does_not_validate_or_activate_a_model():
    rows = []
    for grade in range(1, 7):
        for child in range(2):
            for condition in ('normal', 'slow', 'accent', 'silence', 'classroom_noise'):
                correct = condition != 'silence' and child == 0
                rows.append(row(speaker_id=f'synthetic_{grade}_{child}',
                                recording_id=f'clip_{grade}_{child}_{condition}',
                                grade_level=grade, condition=condition,
                                human_transcript='The little bird sings.' if condition != 'silence' else '',
                                teacher_reading_correct=correct,
                                recognized_text='The little bird sings.' if condition != 'silence' else '',
                                recognition_status='recognized' if condition != 'silence' else 'no_speech'))
    report = evaluate(rows, [])
    assert report['coverage_complete'] is True
    assert report['activation_allowed'] is report['pronunciation_grading_validated'] is False
    assert report['overall']['false_auto_passes'] == 24


def test_aggregate_output_does_not_disclose_private_transcripts_or_identifiers():
    source = row(consent_reference='PRIVATE-CONSENT-REFERENCE')
    text = json.dumps(evaluate([source]))
    for private in (source['speaker_id'], source['recording_id'], source['reviewer_id'],
                    source['consent_reference'], source['human_transcript']):
        assert private not in text


def test_paired_comparison_reports_silence_and_slow_reading_regressions():
    baseline = [row(condition='slow'), row(recording_id='silent', condition='silence',
                teacher_reading_correct=False, human_transcript='', recognized_text='', recognition_status='no_speech')]
    candidate = copy.deepcopy(baseline)
    candidate[0]['recognized_text'] = 'The bird.'
    candidate[1].update(recognized_text='The little bird sings.', recognition_status='recognized')
    report = compare_reports(baseline, candidate, [])
    assert any('slow:' in message for message in report['regressions'])
    assert any('silence:' in message for message in report['regressions'])
    assert report['activation_allowed'] is False


@pytest.mark.parametrize('changes', [
    {'audio_sha256': 'b' * 64}, {'human_transcript': 'A different teacher transcript.'},
    {'reviewer_id': 'another_teacher'}, {'recording_id': 'another_clip'}, {'audio_sha256': None},
])
def test_model_comparison_rejects_changed_evidence(changes):
    with pytest.raises(ValueError):
        compare_reports([row()], [row(**changes)], [])


def write_wav(path, sample=0, frames=16000):
    with wave.open(str(path), 'wb') as clip:
        clip.setparams((1, 2, 16000, 0, 'NONE', 'not compressed'))
        clip.writeframes(sample.to_bytes(2, 'little', signed=True) * frames)


def corpus(tmp_path, rows=None):
    audio = tmp_path / 'audio'
    audio.mkdir()
    write_wav(audio / 'clip.wav')
    labels = tmp_path / 'labels.jsonl'
    values = rows or [row(audio='clip.wav', audio_sha256=None)]
    labels.write_text('\n'.join(json.dumps(value) for value in values))
    return labels, audio


def test_audio_preflight_deduplicates_bytes_and_detects_changed_checksums(tmp_path):
    labels, audio = corpus(tmp_path)
    records = load_corpus(labels, audio)
    assert len(records[0][0]['audio_sha256']) == 64
    for change in ({'audio_sha256': '0' * 64}, {'audio': '../outside.wav'}, {'audio': str(audio / 'clip.wav')}):
        labels.write_text(json.dumps(row(**{'audio': 'clip.wav', 'audio_sha256': None, **change})))
        with pytest.raises((ValueError, OSError)):
            load_corpus(labels, audio)
    duplicate = [row(audio='clip.wav', audio_sha256=None), row(audio='clip.wav', audio_sha256=None, recording_id='second')]
    labels.write_text('\n'.join(json.dumps(value) for value in duplicate))
    with pytest.raises(ValueError, match='same audio'):
        load_corpus(labels, audio)


def test_truncated_wav_is_rejected_before_any_model_load(tmp_path):
    labels, audio = corpus(tmp_path)
    path = audio / 'clip.wav'
    path.write_bytes(path.read_bytes()[:-10])
    with pytest.raises(ValueError, match='Incomplete'):
        load_corpus(labels, audio)


def test_model_identity_changes_when_weights_change(tmp_path):
    for name in ('model.bin', 'config.json', 'tokenizer.json'):
        (tmp_path / name).write_bytes(b'synthetic model fixture')
    first = model_fingerprint(tmp_path)
    (tmp_path / 'model.bin').write_bytes(b'different synthetic weights')
    assert model_fingerprint(tmp_path)['model_sha256'] != first['model_sha256']


def test_benchmark_uses_actual_prediction_status_without_writing_school_results(tmp_path):
    labels, audio = corpus(tmp_path)
    output = tmp_path / 'private-output'
    output.mkdir()
    runtime = SimpleNamespace(recognize_with_details=lambda data, language: SimpleNamespace(transcript='', unclear=False))
    identity = {'model_sha256': 'a' * 64, 'runtime_sha256': 'b' * 64}
    report = run_benchmark(load_corpus(labels, audio), runtime, output, identity, [])
    assert report['overall']['no_evidence'] == 1
    assert report['overall']['correct_readings_not_auto_passed'] == 1
    assert report['activation_allowed'] is False
    saved = json.loads((output / 'predictions.private.jsonl').read_text())
    assert saved['recognition_status'] == 'no_speech'
    with pytest.raises(FileExistsError):
        run_benchmark(load_corpus(labels, audio), runtime, output, identity, [])


def test_preflight_cli_never_imports_or_loads_a_model(tmp_path, monkeypatch):
    labels, audio = corpus(tmp_path)
    output = tmp_path / 'preflight-output'
    monkeypatch.setitem(sys.modules, 'services.inference.app.reading', None)
    monkeypatch.setattr(sys, 'argv', ['benchmark', '--labels', str(labels), '--audio-root', str(audio),
                                    '--output', str(output), '--validate-only'])
    benchmark_main()
    report = json.loads((output / 'preflight.json').read_text())
    assert report['model_loaded'] is report['child_accuracy_measured'] is report['activation_allowed'] is False
    assert not (output / 'predictions.private.jsonl').exists()


def test_preflight_cli_preserves_an_existing_output_folder(tmp_path, monkeypatch):
    labels, audio = corpus(tmp_path)
    output = tmp_path / 'existing-output'
    output.mkdir()
    saved = output / 'preflight.json'
    saved.write_text('preserve this earlier evidence')
    monkeypatch.setattr(sys, 'argv', ['benchmark', '--labels', str(labels), '--audio-root', str(audio),
                                    '--output', str(output), '--validate-only'])
    with pytest.raises(SystemExit) as stopped:
        benchmark_main()
    assert stopped.value.code == 2
    assert saved.read_text() == 'preserve this earlier evidence'


def test_preflight_rejects_outputs_inside_the_audio_folder(tmp_path, monkeypatch):
    labels, audio = corpus(tmp_path)
    output = audio / 'do-not-create'
    monkeypatch.setattr(sys, 'argv', ['benchmark', '--labels', str(labels), '--audio-root', str(audio),
                                    '--output', str(output), '--validate-only'])
    with pytest.raises(SystemExit):
        benchmark_main()
    assert not output.exists()


def test_cli_refuses_to_keep_a_child_corpus_in_the_source_repository(tmp_path, monkeypatch):
    output = tmp_path / 'must-not-be-created'
    monkeypatch.setattr(sys, 'argv', ['benchmark', '--labels', str(ROOT / 'labels.private.jsonl'),
                                    '--audio-root', str(ROOT / 'ml/test_data'),
                                    '--output', str(output), '--validate-only'])
    with pytest.raises(SystemExit) as stopped:
        benchmark_main()
    assert stopped.value.code == 2
    assert not output.exists()
