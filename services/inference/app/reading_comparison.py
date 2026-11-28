"""Recognized-word comparison shared by inference and independent evaluation."""
import re
import unicodedata
from difflib import SequenceMatcher


def tokens(text: str) -> list[str]:
    return re.findall(r"[^\W_]+(?:['’][^\W_]+)*", unicodedata.normalize('NFKC', text))


def words(text: str) -> list[str]:
    return [token.casefold().replace('’', "'") for token in tokens(text)]


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
    return {'transcript': recognized, 'speech_detected': True, 'recognition_status': 'recognized',
            'matched_words': matched, 'missing_words': missing, 'extra_words': extra,
            'expected_word_count': len(target),
            'word_results': [
                {'word': word, 'correct': index in correct_positions,
                 'confidence': float(index in correct_positions)}
                for index, word in enumerate(tokens(expected))
            ],
            'feedback': ('We heard all the reading words. Well done!'
                         if target and not missing else
                         'The app could not confirm every word. Listen to your recording and try again if needed.'),
            'assessment_type': 'reading_recognition', 'pronunciation_assessment_available': False}


def mission_reading_decision(result: dict) -> str:
    """Mirror private.adventure_record_reading for evaluation; never grant credit."""
    if result['recognition_status'] == 'no_speech' or not result['speech_detected']:
        return 'no_evidence'
    expected = max(1, result['expected_word_count'])
    matched = min(expected, len(result['matched_words']))
    passed = (result['recognition_status'] == 'recognized' and matched == expected
              and len(result['extra_words']) <= max(1, expected // 4))
    return 'auto_pass' if passed else 'teacher_review'
