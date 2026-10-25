import 'package:flutter_tts/flutter_tts.dart';

class PronunciationUnavailable implements Exception {
  const PronunciationUnavailable(this.message);
  final String message;
  @override
  String toString() => message;
}

class PronunciationService {
  PronunciationService() : _tts = FlutterTts();
  final FlutterTts _tts;

  Future<void> speak({
    required String text,
    required String language,
    bool slow = false,
  }) async {
    final available = (await _tts.getLanguages as List<dynamic>)
        .map((value) => value.toString())
        .toList();
    final prefixes = language == 'fil' ? const ['fil', 'tl'] : const ['en'];
    String? selected;
    for (final preferred in prefixes) {
      for (final candidate in available) {
        if (candidate.toLowerCase().startsWith(preferred)) {
          selected = candidate;
          break;
        }
      }
      if (selected != null) break;
    }
    if (selected == null) {
      final label = language == 'fil' ? 'Filipino' : 'English';
      throw PronunciationUnavailable('A suitable $label voice is not installed on this device.');
    }
    await _tts.stop();
    await _tts.setLanguage(selected);
    await _tts.setSpeechRate(slow ? 0.32 : 0.48);
    await _tts.speak(text);
  }

  Future<void> stop() => _tts.stop();
}
