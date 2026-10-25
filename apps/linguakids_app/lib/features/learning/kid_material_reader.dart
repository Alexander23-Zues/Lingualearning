import 'dart:math';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/audio/pronunciation_service.dart';
import 'learning_data.dart';
import 'story_art.dart';

class MaterialReader extends ConsumerStatefulWidget {
  const MaterialReader({
    required this.material,
    this.session,
    this.onCompleted,
    super.key,
  });
  final Json material;
  final StudentSession? session;
  final VoidCallback? onCompleted;
  @override
  ConsumerState<MaterialReader> createState() => _MaterialReaderState();
}

class _MaterialReaderState extends ConsumerState<MaterialReader> {
  final answers = <String, dynamic>{};
  final pronunciation = PronunciationService();
  final scroll = ScrollController();
  int page = 0;
  bool revealed = false, saving = false, submitted = false;
  String? error, feedback;
  late List<String> gameChoices;
  Json get body =>
      Map<String, dynamic>.from(widget.material['body'] as Map? ?? {});
  String get kind => widget.material['kind'] as String;
  int get scene => (body['cover_scene'] as num? ?? 0).toInt();
  bool get sound =>
      widget.session?.child['preferences'] is! Map ||
      (widget.session!.child['preferences'] as Map)['sound'] != false;
  String get language =>
      (widget.session?.child['preferences'] as Map?)?['language'] as String? ??
      'bilingual';
  List<Json> get pairs => jsonRows(body['pairs']);
  List<Json> get questions => jsonRows(body['questions']);
  List<Json> get pages => jsonRows(body['pages']);
  int get total => switch (kind) {
    'quiz' => questions.length,
    'game' => pairs.length,
    'story' => pages.length,
    'lesson' => pages.isEmpty ? 1 : pages.length,
    'vocabulary' => pairs.length,
    _ => 1,
  };
  bool get currentReady => switch (kind) {
    'quiz' =>
      questions.isNotEmpty && answers.containsKey(questions[page]['id']),
    'game' => pairs.isNotEmpty && answers.containsKey(pairs[page]['en']),
    _ => true,
  };
  bool get ready => switch (kind) {
    'quiz' => answers.length == questions.length && questions.isNotEmpty,
    'game' => answers.length == pairs.length && pairs.isNotEmpty,
    'story' => pages.isNotEmpty && page == pages.length - 1,
    'lesson' => pages.isEmpty || page == pages.length - 1,
    _ => true,
  };
  @override
  void initState() {
    super.initState();
    gameChoices = pairs.map((p) => p['fil'] as String).toSet().toList()
      ..shuffle(Random(widget.material['id'].hashCode));
  }

  @override
  void dispose() {
    pronunciation.stop();
    scroll.dispose();
    super.dispose();
  }

  void turn(int next) {
    pronunciation.stop();
    setState(() {
      page = next;
      revealed = false;
      feedback = null;
    });
    if (scroll.hasClients) scroll.jumpTo(0);
  }

  Future<void> listen(String text, String language) async {
    try {
      await pronunciation.speak(text: text, language: language);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(friendlyError(e))));
      }
    }
  }

  Future<void> complete() async {
    if (saving || submitted) return;
    if (widget.session == null) {
      setState(
        () => feedback =
            'Great practice! An adult can open a child profile to save stars and progress.',
      );
      return;
    }
    setState(() {
      saving = true;
      error = null;
    });
    try {
      final checked = await ref
          .read(studentRepositoryProvider)
          .complete(widget.session!, widget.material, answers);
      if (!mounted) return;
      setState(() => submitted = true);
      widget.onCompleted?.call();
      await showDialog<void>(
        context: context,
        builder: (dialog) => AlertDialog(
          title: Text(
            checked['pending'] == true
                ? 'Practice saved for later'
                : 'Wonderful work!',
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('🌟 🦊 🌟', style: TextStyle(fontSize: 40)),
              const SizedBox(height: 16),
              Text(
                checked['pending'] == true
                    ? 'Your answers are saved on this device. Reconnect to check them and earn stars.'
                    : '${checked['correct_count']} of ${checked['total_count']} correct!\n${checked['stars']} new stars.${checked['stars'] == 0 ? ' You already earned stars for this activity.' : ''}',
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 20, height: 1.5),
              ),
            ],
          ),
          actions: [
            FilledButton.icon(
              onPressed: () => Navigator.pop(dialog),
              icon: const Icon(Icons.check_circle),
              label: const Text('Hooray!'),
            ),
          ],
        ),
      );
    } catch (e) {
      if (mounted) setState(() => error = friendlyError(e));
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  void match(String value) {
    if (answers.containsKey(pairs[page]['en']) || submitted) return;
    setState(() {
      if (value == pairs[page]['fil']) {
        answers[pairs[page]['en'] as String] = value;
        feedback = 'A match! Great job, word explorer!';
      } else {
        feedback = 'Almost! Try another word. You can do it!';
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final paged =
        (['quiz', 'game', 'story', 'vocabulary'].contains(kind) ||
            (kind == 'lesson' && pages.isNotEmpty)) &&
        total > 0;
    return Scaffold(
      backgroundColor: const Color(0xFFFFFCF2),
      appBar: AppBar(
        title: Text(
          '${widget.material['title']}',
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
        ),
        toolbarHeight: 72,
      ),
      bottomNavigationBar: paged ? _navigation() : null,
      body: ListView(
        controller: scroll,
        padding: const EdgeInsets.fromLTRB(18, 16, 18, 32),
        children: [
          Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 900),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (kind != 'story')
                    AnimalWelcome(
                      title: switch (kind) {
                        'quiz' => 'Choose your answer!',
                        'game' => 'Let’s match words!',
                        'dictionary' => 'Meet your animal word buddies!',
                        _ => 'Let’s learn together!',
                      },
                      message: switch (kind) {
                        'quiz' =>
                          'Tap a big A, B, C, or D button. Take your time.',
                        'game' =>
                          'Tap the Filipino partner for each word. There is no timer!',
                        _ => 'Read, listen, and discover something new.',
                      },
                      scene: scene,
                    ),
                  if (paged) ...[
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            '${kind == 'quiz'
                                ? 'Question'
                                : kind == 'game'
                                ? 'Match'
                                : kind == 'story' || kind == 'lesson'
                                ? 'Page'
                                : 'Word'} ${page + 1} of $total',
                            style: const TextStyle(
                              fontWeight: FontWeight.w800,
                              fontSize: 17,
                            ),
                          ),
                        ),
                        if (kind == 'quiz')
                          Text(
                            '${answers.length} answered',
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(10),
                      child: LinearProgressIndicator(
                        value:
                            (kind == 'quiz'
                                ? answers.length
                                : kind == 'game'
                                ? answers.length
                                : page + 1) /
                            total,
                        minHeight: 10,
                        backgroundColor: const Color(0xFFE3E8E8),
                        color: const Color(0xFF289B88),
                      ),
                    ),
                    const SizedBox(height: 20),
                  ],
                  if (total == 0)
                    const Text(
                      'This activity is being prepared. Please ask an adult for help.',
                    ),
                  if (kind == 'lesson') ...[
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 20),
                      child: Text(
                        '${widget.material['summary']}',
                        style: const TextStyle(fontSize: 18),
                      ),
                    ),
                    ..._bilingual(
                      '${pages.isEmpty ? body['english'] ?? '' : pages[page]['english'] ?? ''}',
                      '${pages.isEmpty ? body['filipino'] ?? '' : pages[page]['filipino'] ?? ''}',
                    ),
                  ],
                  if (kind == 'dictionary') ..._dictionary(),
                  if (kind == 'vocabulary' && pairs.isNotEmpty)
                    ..._vocabulary(),
                  if (kind == 'game' && pairs.isNotEmpty) ..._game(),
                  if (kind == 'quiz' && questions.isNotEmpty) ..._quiz(),
                  if (kind == 'story' && pages.isNotEmpty) ..._story(),
                  if (feedback != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 18),
                      child: Semantics(
                        liveRegion: true,
                        child: Container(
                          padding: const EdgeInsets.all(18),
                          decoration: BoxDecoration(
                            color: const Color(0xFFE6F5EB),
                            borderRadius: BorderRadius.circular(18),
                          ),
                          child: Text(
                            feedback!,
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                              fontSize: 19,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      ),
                    ),
                  if (error != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 16),
                      child: Semantics(
                        liveRegion: true,
                        child: Text(
                          error!,
                          style: TextStyle(
                            color: Theme.of(context).colorScheme.error,
                            fontSize: 18,
                          ),
                        ),
                      ),
                    ),
                  if (submitted)
                    Padding(
                      padding: const EdgeInsets.only(top: 20),
                      child: FilledButton.icon(
                        onPressed: () => Navigator.pop(context),
                        icon: const Icon(Icons.home_rounded),
                        label: const Text('Back to my learning map'),
                      ),
                    ),
                  if (!paged && widget.session != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 24),
                      child: FilledButton.icon(
                        onPressed: saving || submitted ? null : complete,
                        icon: const Icon(Icons.star_rounded),
                        label: Text(
                          saving ? 'Checking…' : 'Finish this activity',
                        ),
                      ),
                    ),
                  const SizedBox(height: 22),
                  Text(
                    '${widget.material['source_label'] ?? 'Original supplemental learning activity'}',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  List<Widget> _quiz() {
    final question = questions[page],
        options = jsonRows(questions[page]['options']);
    return [
      Card(
        child: Padding(
          padding: const EdgeInsets.all(22),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                '${question['emoji'] ?? '🦉'}',
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 54),
              ),
              const SizedBox(height: 14),
              Text(
                '${question['prompt']}',
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 25,
                  fontWeight: FontWeight.w800,
                  height: 1.35,
                ),
              ),
              if (sound)
                TextButton.icon(
                  onPressed: () => listen('${question['prompt']}', 'en'),
                  icon: const Icon(Icons.volume_up_rounded),
                  label: const Text('Read the question aloud'),
                ),
              const SizedBox(height: 18),
              LayoutBuilder(
                builder: (context, box) {
                  final columns = box.maxWidth >= 640 ? 2 : 1;
                  final width = (box.maxWidth - (columns - 1) * 14) / columns;
                  return Wrap(
                    spacing: 14,
                    runSpacing: 14,
                    children: options
                        .asMap()
                        .entries
                        .map(
                          (entry) => SizedBox(
                            width: width,
                            child: KidChoiceButton(
                              letter: String.fromCharCode(65 + entry.key),
                              text: '${entry.value['text']}',
                              selected:
                                  answers[question['id']] == entry.value['id'],
                              onTap: () {
                                if (!submitted) {
                                  setState(() {
                                    answers[question['id'] as String] =
                                        entry.value['id'];
                                    feedback = null;
                                  });
                                }
                              },
                            ),
                          ),
                        )
                        .toList(),
                  );
                },
              ),
            ],
          ),
        ),
      ),
      if (page == questions.length - 1)
        Padding(
          padding: const EdgeInsets.only(top: 12),
          child: Text(
            ready
                ? 'All answers are ready! Tap “Check answers” below.'
                : 'Answer each question before checking. Use Back to finish any you skipped.',
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
          ),
        ),
    ];
  }

  List<Widget> _game() {
    final pair = pairs[page];
    final matched = answers.containsKey(pair['en']);
    return [
      Card(
        color: const Color(0xFFFFEDBF),
        child: Padding(
          padding: const EdgeInsets.all(25),
          child: Column(
            children: [
              Text(
                '${pair['emoji'] ?? '🐾'}',
                style: const TextStyle(fontSize: 64),
              ),
              const SizedBox(height: 12),
              Text(
                '${pair['en']}',
                style: const TextStyle(
                  fontSize: 34,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'Which Filipino word is its partner?',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 19),
              ),
              if (sound)
                TextButton.icon(
                  onPressed: () => listen('${pair['en']}', 'en'),
                  icon: const Icon(Icons.volume_up),
                  label: const Text('Listen to the word'),
                ),
            ],
          ),
        ),
      ),
      const SizedBox(height: 18),
      ...gameChoices.asMap().entries.map(
        (entry) => Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: KidChoiceButton(
            letter: String.fromCharCode(65 + entry.key),
            text: entry.value,
            selected: matched && answers[pair['en']] == entry.value,
            onTap: () => match(entry.value),
          ),
        ),
      ),
      if (matched)
        const Text(
          '⭐ Matched! Tap the next button to keep playing.',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 19,
            fontWeight: FontWeight.w800,
            color: Color(0xFF187A68),
          ),
        ),
    ];
  }

  List<Widget> _story() {
    final current = pages[page];
    final art = (current['scene'] as num? ?? scene).toInt();
    final color = storyColors[(art ~/ 4).clamp(0, 3)];
    return [
      Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: const Color(0xFFE9DEBF), width: 2),
          boxShadow: const [
            BoxShadow(
              color: Color(0x13000000),
              blurRadius: 15,
              offset: Offset(0, 6),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 15),
              decoration: BoxDecoration(
                color: color,
                borderRadius: const BorderRadius.vertical(
                  top: Radius.circular(22),
                ),
              ),
              child: Column(
                children: [
                  Text(
                    '${widget.material['title']}',
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w900,
                      fontSize: 22,
                    ),
                  ),
                  if (body['filipino_title'] != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 5),
                      child: Text(
                        '${body['filipino_title']}',
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 15,
                        ),
                      ),
                    ),
                ],
              ),
            ),
            AnimalScene(
              scene: art,
              aspectRatio: 1.65,
              label:
                  '${widget.material['title']}, illustrated page ${page + 1}',
            ),
            Padding(
              padding: const EdgeInsets.all(22),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  ..._bilingual(
                    '${current['english'] ?? ''}',
                    '${current['filipino'] ?? ''}',
                  ),
                  Center(
                    child: Text(
                      '— ${page + 1} —',
                      style: TextStyle(
                        fontSize: 18,
                        color: color,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
      if (page == pages.length - 1)
        const Padding(
          padding: EdgeInsets.only(top: 20),
          child: Text(
            '🌟 The end! What was your favorite part?',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
          ),
        ),
    ];
  }

  List<Widget> _dictionary() => [
    ...pairs.map(
      (pair) => Card(
        child: ListTile(
          contentPadding: const EdgeInsets.all(20),
          leading: Text(
            '${pair['emoji'] ?? '🐾'}',
            style: const TextStyle(fontSize: 32),
          ),
          title: Text(
            '${pair['en']}',
            style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800),
          ),
          subtitle: Text(
            '${pair['fil']}',
            style: const TextStyle(fontSize: 22),
          ),
          trailing: sound
              ? IconButton(
                  onPressed: () => listen('${pair['en']}', 'en'),
                  icon: const Icon(Icons.volume_up),
                  tooltip: 'Listen to ${pair['en']}',
                )
              : null,
        ),
      ),
    ),
    if (widget.session != null)
      Padding(
        padding: const EdgeInsets.only(top: 18),
        child: OutlinedButton.icon(
          onPressed: () async {
            try {
              await ref
                  .read(studentRepositoryProvider)
                  .saveWord(widget.session!, widget.material['id'] as String);
              if (mounted) {
                setState(
                  () => feedback = 'Saved! Find these words in My vocabulary.',
                );
              }
              widget.onCompleted?.call();
            } catch (e) {
              if (mounted) setState(() => error = friendlyError(e));
            }
          },
          icon: const Icon(Icons.bookmark_add),
          label: const Text('Save these words'),
        ),
      ),
  ];
  List<Widget> _vocabulary() => [
    Card(
      color: const Color(0xFFE4F6F0),
      child: InkWell(
        onTap: () => setState(() => revealed = !revealed),
        borderRadius: BorderRadius.circular(22),
        child: Padding(
          padding: const EdgeInsets.all(30),
          child: Column(
            children: [
              Text(
                '${pairs[page]['emoji'] ?? '🦊'}',
                style: const TextStyle(fontSize: 64),
              ),
              const SizedBox(height: 18),
              Text(
                '${pairs[page]['en']}',
                style: const TextStyle(
                  fontSize: 32,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 18),
              Text(
                revealed
                    ? '${pairs[page]['fil']}'
                    : 'Tap to reveal the Filipino word',
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 24),
              ),
              const SizedBox(height: 18),
              FilledButton.icon(
                onPressed: () => setState(() => revealed = !revealed),
                icon: Icon(revealed ? Icons.visibility_off : Icons.visibility),
                label: Text(revealed ? 'Hide answer' : 'Show answer'),
              ),
            ],
          ),
        ),
      ),
    ),
  ];
  List<Widget> _bilingual(String english, String filipino) => [
    if (language != 'fil' && english.isNotEmpty) ...[
      Text(english, style: const TextStyle(fontSize: 22, height: 1.6)),
      if (sound)
        TextButton.icon(
          onPressed: () => listen(english, 'en'),
          icon: const Icon(Icons.volume_up_rounded),
          label: const Text('Listen in English'),
        ),
      const SizedBox(height: 18),
    ],
    if (language != 'en' && filipino.isNotEmpty) ...[
      Text(
        filipino,
        style: const TextStyle(
          fontSize: 22,
          height: 1.6,
          color: Color(0xFF247970),
        ),
      ),
      if (sound)
        TextButton.icon(
          onPressed: () => listen(filipino, 'fil'),
          icon: const Icon(Icons.volume_up_rounded),
          label: const Text('Pakinggan sa Filipino'),
        ),
      const SizedBox(height: 18),
    ],
  ];
  Widget _navigation() {
    final finalPage = page == total - 1;
    return Material(
      elevation: 8,
      color: const Color(0xFFFFFCF2),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 10, 14, 12),
          child: Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size(0, 56),
                  ),
                  onPressed: page == 0 ? null : () => turn(page - 1),
                  icon: const Icon(Icons.arrow_back_rounded),
                  label: const Text('Back'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                flex: 2,
                child: FilledButton.icon(
                  style: FilledButton.styleFrom(minimumSize: const Size(0, 56)),
                  onPressed: saving || submitted
                      ? null
                      : finalPage
                      ? (ready ? complete : null)
                      : currentReady
                      ? () => turn(page + 1)
                      : null,
                  icon: Icon(
                    finalPage
                        ? Icons.star_rounded
                        : Icons.arrow_forward_rounded,
                  ),
                  label: Text(
                    saving
                        ? 'Checking…'
                        : submitted
                        ? 'Completed!'
                        : finalPage
                        ? (kind == 'quiz'
                              ? 'Check answers'
                              : kind == 'story'
                              ? 'Finish story'
                              : kind == 'lesson'
                              ? 'Finish lesson'
                              : 'Finish activity')
                        : (kind == 'story' || kind == 'lesson'
                              ? 'Next page'
                              : kind == 'game'
                              ? 'Next match'
                              : kind == 'vocabulary'
                              ? 'Next word'
                              : 'Next question'),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
