"""Evaluate held-out English child recordings using the actual mission rule.

Aggregate reports contain no audio, transcripts, consent references, or learner
identifiers. This does not train, activate, or validate pronunciation grading.
"""
import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from services.inference.app.reading_comparison import compare_reading, mission_reading_decision, words

CONDITIONS = ('normal', 'slow', 'accent', 'silence', 'classroom_noise')
CODE = re.compile(r'[A-Za-z0-9_-]{1,80}')


def distance(a, b):
    row = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        next_row = [i]
        for j, y in enumerate(b, 1):
            next_row.append(min(next_row[-1] + 1, row[j] + 1, row[j - 1] + (x != y)))
        row = next_row
    return row[-1]


def validate_labels(rows, training_speakers=None):
    if training_speakers is not None and (
        not isinstance(training_speakers, (list, tuple, set))
        or any(not isinstance(code, str) or not CODE.fullmatch(code) for code in training_speakers)
    ):
        raise ValueError('Training speakers must be a list of pseudonymous speaker codes.')
    seen, speaker_grades = set(), {}
    for index, row in enumerate(rows, 1):
        def require(condition, message):
            if not condition:
                raise ValueError(f'Row {index}: {message}')
        require(isinstance(row, dict), 'Use an assessment record object.')
        require(row.get('is_child') is True and isinstance(row.get('teacher_reading_correct'), bool),
                'Confirm child status and an independent teacher true/false reading label.')
        require(isinstance(row.get('consent_reference'), str) and bool(row['consent_reference'].strip()),
                'A nonempty consent reference is required.')
        for key in ('speaker_id', 'recording_id', 'reviewer_id'):
            require(isinstance(row.get(key), str) and CODE.fullmatch(row[key]),
                    f'Use a pseudonymous {key}, without names or email addresses.')
        require(row['recording_id'] not in seen, 'Duplicate recording ID.')
        seen.add(row['recording_id'])
        require(training_speakers is None or row['speaker_id'] not in training_speakers,
                'A test speaker appears in the training data.')
        require(type(row.get('grade_level')) is int and 1 <= row['grade_level'] <= 6,
                'Use a grade from 1 to 6.')
        require(row.get('language') == 'en', 'Use the separate English assessment/recording.')
        require(row.get('condition') in CONDITIONS, 'Choose a documented recording condition.')
        require(row.get('label_blinded') is True,
                'The teacher must label the audio before viewing the model prediction.')
        require(isinstance(row.get('expected_text'), str) and 1 <= len(row['expected_text'].strip()) <= 300
                and bool(words(row['expected_text'])), 'Enter the actual English text (1–300 characters).')
        require(isinstance(row.get('human_transcript'), str), 'Record a teacher transcript; silence uses an empty string.')
        reference = words(row['human_transcript'])
        require(row['condition'] != 'silence' or (not reference and not row['teacher_reading_correct']),
                'Silence must have an empty teacher transcript and a false reading label.')
        require(row['condition'] == 'silence' or bool(reference), 'A voiced condition requires a teacher transcript.')
        require(row['speaker_id'] not in speaker_grades or speaker_grades[row['speaker_id']] == row['grade_level'],
                'A speaker code has conflicting grade levels.')
        speaker_grades[row['speaker_id']] = row['grade_level']
    return speaker_grades


def prediction_result(row):
    if not isinstance(row.get('recognized_text'), str):
        raise ValueError('Every prediction needs recognized_text, including an explicit empty string for silence.')
    status = row.get('recognition_status')
    if status not in {'recognized', 'unclear', 'no_speech'}:
        raise ValueError('Every prediction needs the actual recognition_status.')
    result = compare_reading(row['expected_text'], row['recognized_text'], unclear=status == 'unclear')
    if status != result['recognition_status']:
        raise ValueError('The transcript conflicts with recognition_status.')
    return result


def prediction_identity(rows):
    identity = {}
    for field in ('model_sha256', 'runtime_sha256'):
        raw = [row.get(field) for row in rows]
        if any(not isinstance(value, str) or not re.fullmatch(r'[a-f0-9]{64}', value) for value in raw):
            raise ValueError('Use predictions from one checksum-identified model and runtime per evaluation.')
        values = set(raw)
        if len(values) > 1:
            raise ValueError('Use predictions from one checksum-identified model and runtime per evaluation.')
        identity[field] = next(iter(values)) if values else None
    return identity


def group_metrics(items):
    reference_words = sum(item['reference_words'] for item in items)
    teacher_correct = sum(item['teacher_correct'] for item in items)
    teacher_incorrect = len(items) - teacher_correct
    false_passes = sum(item['auto_pass'] and not item['teacher_correct'] for item in items)
    missed_correct = sum(not item['auto_pass'] and item['teacher_correct'] for item in items)
    return {
        'recordings': len(items), 'unique_child_speakers': len({item['speaker'] for item in items}),
        'reference_words': reference_words,
        'word_error_rate': sum(item['edit_errors'] for item in items) / reference_words if reference_words else None,
        'teacher_correct_recordings': teacher_correct, 'teacher_incorrect_recordings': teacher_incorrect,
        'auto_passes': sum(item['auto_pass'] for item in items),
        'teacher_reviews': sum(item['decision'] == 'teacher_review' for item in items),
        'no_evidence': sum(item['decision'] == 'no_evidence' for item in items),
        'false_auto_passes': false_passes,
        'false_auto_pass_rate': false_passes / teacher_incorrect if teacher_incorrect else None,
        'correct_readings_not_auto_passed': missed_correct,
        'correct_reading_review_rate': missed_correct / teacher_correct if teacher_correct else None,
        'false_speech_on_silence': sum(item['false_speech'] for item in items),
        'teacher_label_agreement': (len(items) - false_passes - missed_correct) / len(items) if items else None,
    }


def evaluate(rows, training_speakers=None, minimum_per_condition=10):
    rows = list(rows)
    if type(minimum_per_condition) is not int or minimum_per_condition < 1:
        raise ValueError('Use a positive per-condition minimum.')
    speakers = validate_labels(rows, training_speakers)
    identity = prediction_identity(rows)
    groups = {condition: [] for condition in CONDITIONS}
    grades = {grade: [] for grade in range(1, 7)}
    items = []
    for row in rows:
        result = prediction_result(row)
        reference, hypothesis = words(row['human_transcript']), words(result['transcript'])
        decision = mission_reading_decision(result)
        item = {'reference_words': len(reference), 'edit_errors': distance(reference, hypothesis),
                'teacher_correct': row['teacher_reading_correct'], 'auto_pass': decision == 'auto_pass',
                'decision': decision, 'speaker': row['speaker_id'],
                'false_speech': row['condition'] == 'silence' and result['speech_detected']}
        groups[row['condition']].append(item)
        grades[row['grade_level']].append(item)
        items.append(item)
    gaps = []
    if not rows:
        gaps.append('No teacher-labelled child recordings supplied.')
    if len(speakers) < 10:
        gaps.append('Fewer than 10 distinct child speakers.')
    for condition, values in groups.items():
        if len(values) < minimum_per_condition:
            gaps.append(f'{condition}: fewer than {minimum_per_condition} recordings.')
        if len({item['speaker'] for item in values}) < 3:
            gaps.append(f'{condition}: fewer than 3 distinct speakers.')
        if condition != 'silence' and not {True, False}.issubset({item['teacher_correct'] for item in values}):
            gaps.append(f'{condition}: include teacher-correct and teacher-incorrect examples.')
    for grade, values in grades.items():
        if len({item['speaker'] for item in values}) < 2:
            gaps.append(f'Grade {grade}: fewer than 2 distinct speakers.')
    if training_speakers is None:
        gaps.append('Training speaker list was not supplied; speaker overlap is unverified.')
    complete = not gaps
    return {
        'assessment': 'English word recognition/comparison; automatic mission reading decisions',
        'policy': 'All target words, recognized status, extra words <= max(1, target words // 4); silence gives no evidence.',
        'recordings': len(rows), 'unique_child_speakers': len(speakers),
        'speaker_disjoint': True if training_speakers is not None else None,
        'coverage_complete': complete, 'coverage_gaps': gaps,
        'minimum_per_condition': minimum_per_condition,
        'prediction_identity': identity,
        'overall': group_metrics(items),
        'groups': {key: group_metrics(values) for key, values in groups.items()},
        'grades': {str(grade): group_metrics(values) for grade, values in grades.items()},
        'pronunciation_grading_validated': False, 'activation_allowed': False,
        'decision': ('Coverage is ready for independent baseline comparison and teacher review. No automatic activation.'
                     if complete else 'Insufficient verified evaluation coverage. Do not claim validated accuracy or activate a candidate.'),
    }


def compare_reports(baseline_rows, candidate_rows, training_speakers=None):
    def indexed(rows):
        validate_labels(rows, training_speakers)
        return {row['recording_id']: row for row in rows}
    baseline, candidate = indexed(baseline_rows), indexed(candidate_rows)
    if set(baseline) != set(candidate):
        raise ValueError('Baseline and candidate must use exactly the same held-out recordings.')
    fields = ('speaker_id', 'grade_level', 'condition', 'language', 'expected_text', 'human_transcript',
              'teacher_reading_correct', 'reviewer_id', 'label_blinded', 'consent_reference', 'audio_sha256')
    for key, row in baseline.items():
        if any(row.get(field) != candidate[key].get(field) for field in fields):
            raise ValueError('Baseline and candidate labels/audio differ; independent comparison is invalid.')
        if not isinstance(row.get('audio_sha256'), str) or not re.fullmatch(r'[a-f0-9]{64}', row['audio_sha256']):
            raise ValueError('An audio checksum is required for paired model comparison.')
    reports = [evaluate(rows, training_speakers) for rows in (baseline_rows, candidate_rows)]
    regressions = []
    for scope in ('overall', *CONDITIONS):
        a, b = [report['overall'] if scope == 'overall' else report['groups'][scope] for report in reports]
        if b['false_auto_passes'] > a['false_auto_passes']:
            regressions.append(f'{scope}: more incorrect readings automatically passed.')
        if b['correct_readings_not_auto_passed'] > a['correct_readings_not_auto_passed']:
            regressions.append(f'{scope}: more correct readings need review or produced no evidence.')
        if b['false_speech_on_silence'] > a['false_speech_on_silence']:
            regressions.append(f'{scope}: more false speech on silence.')
        if a['word_error_rate'] is not None and b['word_error_rate'] > a['word_error_rate']:
            regressions.append(f'{scope}: word error rate increased.')
    return {'baseline': reports[0], 'candidate': reports[1], 'regressions': regressions,
            'activation_allowed': False, 'pronunciation_grading_validated': False,
            'decision': 'Do not activate: review regressions.' if regressions else 'Independent teacher review is still required; no model activated.'}


def load_predictions(path):
    return [json.loads(line) for line in path.read_text(encoding='utf-8-sig').splitlines() if line.strip()]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--predictions', type=Path, required=True)
    parser.add_argument('--baseline', type=Path)
    parser.add_argument('--training-speakers', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if args.output.resolve() in {path.resolve() for path in (args.predictions, args.baseline, args.training_speakers) if path}:
        parser.error('Write the report to a separate file; preserve the evidence inputs.')
    try:
        rows = load_predictions(args.predictions)
        training = json.loads(args.training_speakers.read_text()) if args.training_speakers else None
        report = compare_reports(load_predictions(args.baseline), rows, training) if args.baseline else evaluate(rows, training)
        report['predictions_sha256'] = hashlib.sha256(args.predictions.read_bytes()).hexdigest()
        if args.baseline:
            report['baseline_sha256'] = hashlib.sha256(args.baseline.read_bytes()).hexdigest()
        args.output.write_text(json.dumps(report, indent=2), encoding='utf-8')
    except (ValueError, OSError):
        parser.exit(2, 'Evaluation failed. Check input fields and files; source recordings and model activation were not changed.\n')
    print('Aggregate evaluation saved. No model trained or activated.')


if __name__ == '__main__':
    main()
