import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../auth/domain/app_user.dart';
import '../auth/presentation/auth_controller.dart';
import 'learning_data.dart';
import 'material_reader.dart';
import 'story_art.dart';
import 'workspace_pages.dart';

class ChildProfilesPage extends ConsumerWidget {
  const ChildProfilesPage({
    required this.snapshot,
    required this.onChanged,
    super.key,
  });
  final Json snapshot;
  final VoidCallback onChanged;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final children = jsonRows(snapshot['children']);
    return ListView(
      padding: const EdgeInsets.all(28),
      children: [
        WorkspaceHeading(
          title: 'Child Profiles',
          description:
              'An authorized adult creates each learning profile and opens student mode. Children never register an account.',
          action: FilledButton.icon(
            onPressed: () => editChildProfile(context, ref),
            icon: const Icon(Icons.person_add_alt_1),
            label: const Text('Create child profile'),
          ),
        ),
        const SizedBox(height: 16),
        const StudentPermissionCard(),
        const SizedBox(height: 20),
        if (children.isEmpty)
          const Notice(
            'Create the first child profile using only a nickname, preset avatar, grade, learning level, and preferences.',
          ),
        ...children.map(
          (child) => Card(
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Wrap(
                alignment: WrapAlignment.spaceBetween,
                runSpacing: 16,
                spacing: 20,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      CircleAvatar(
                        radius: 28,
                        child: Icon(avatarIcons[child['avatar_key']], size: 30),
                      ),
                      const SizedBox(width: 16),
                      Flexible(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              '${child['nickname']}',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: Theme.of(context).textTheme.titleLarge,
                            ),
                            Text(
                              'Grade ${child['grade_level']} · ${child['learning_level']}',
                            ),
                            Text(
                              child['active'] == true
                                  ? 'Ready to learn'
                                  : 'Archived',
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  Wrap(
                    spacing: 8,
                    children: [
                      TextButton(
                        onPressed: () =>
                            editChildProfile(context, ref, initial: child),
                        child: const Text('Edit profile'),
                      ),
                      FilledButton.icon(
                        onPressed: child['active'] != true
                            ? null
                            : () async {
                                try {
                                  final result = Map<String, dynamic>.from(
                                    await ref
                                            .read(learningRepositoryProvider)
                                            .call('open_child_session', {
                                              'p_child_id': child['id'],
                                            })
                                        as Map,
                                  );
                                  ref
                                      .read(studentSessionProvider.notifier)
                                      .open(result);
                                  await ref
                                      .read(adultLockProvider.notifier)
                                      .setLocked(true);
                                  if (context.mounted) context.go('/student');
                                } catch (e) {
                                  if (context.mounted) {
                                    ScaffoldMessenger.of(context).showSnackBar(
                                      SnackBar(content: Text(friendlyError(e))),
                                    );
                                  }
                                }
                              },
                        icon: const Icon(Icons.play_arrow_rounded),
                        label: const Text('Start learning'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

Future<void> editChildProfile(
  BuildContext context,
  WidgetRef ref, {
  Json? initial,
}) async {
  final form = GlobalKey<FormState>();
  final nickname = TextEditingController(text: initial?['nickname'] as String?);
  var avatar = initial?['avatar_key'] as String? ?? 'tarsier';
  var grade = (initial?['grade_level'] as num? ?? 1).toInt();
  var level = initial?['learning_level'] as String? ?? 'beginner';
  var active = initial?['active'] != false;
  final prefs = Map<String, dynamic>.from(
    initial?['preferences'] as Map? ?? {},
  );
  var language = prefs['language'] as String? ?? 'bilingual';
  var sound = prefs['sound'] != false;
  var reduced = prefs['reduced_motion'] == true;
  bool saving = false;
  String? error;
  await showDialog<void>(
    context: context,
    builder: (dialog) => StatefulBuilder(
      builder: (dialog, setDialog) => AlertDialog(
        title: Text(
          initial == null ? 'Create child profile' : 'Edit child profile',
        ),
        content: SizedBox(
          width: 520,
          child: SingleChildScrollView(
            child: Form(
              key: form,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text(
                    'Use a nickname. Do not enter a child’s real contact details or upload a photograph.',
                  ),
                  const SizedBox(height: 16),
                  TextFormField(
                    controller: nickname,
                    maxLength: 40,
                    decoration: const InputDecoration(labelText: 'Nickname'),
                    validator: (value) => value == null || value.trim().isEmpty
                        ? 'Choose a nickname.'
                        : null,
                  ),
                  const SizedBox(height: 12),
                  const Text('Preset avatar'),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 10,
                    runSpacing: 8,
                    children: avatarKeys
                        .map(
                          (key) => ChoiceChip(
                            label: Text(key),
                            avatar: Icon(avatarIcons[key]),
                            selected: avatar == key,
                            onSelected: (_) => setDialog(() => avatar = key),
                          ),
                        )
                        .toList(),
                  ),
                  const SizedBox(height: 16),
                  DropdownButtonFormField<int>(
                    isExpanded: true,
                    initialValue: grade,
                    decoration: const InputDecoration(labelText: 'Grade'),
                    items: List.generate(
                      6,
                      (i) => DropdownMenuItem(
                        value: i + 1,
                        child: Text('Grade ${i + 1}'),
                      ),
                    ),
                    onChanged: (v) => grade = v!,
                  ),
                  const SizedBox(height: 14),
                  DropdownButtonFormField<String>(
                    isExpanded: true,
                    initialValue: level,
                    decoration: const InputDecoration(
                      labelText: 'Learning level',
                    ),
                    items: learningLevels
                        .map((l) => DropdownMenuItem(value: l, child: Text(l)))
                        .toList(),
                    onChanged: (v) => level = v!,
                  ),
                  const SizedBox(height: 14),
                  DropdownButtonFormField<String>(
                    isExpanded: true,
                    initialValue: language,
                    decoration: const InputDecoration(
                      labelText: 'Preferred content language',
                    ),
                    items: const [
                      DropdownMenuItem(
                        value: 'bilingual',
                        child: Text('English and Filipino'),
                      ),
                      DropdownMenuItem(value: 'en', child: Text('English')),
                      DropdownMenuItem(value: 'fil', child: Text('Filipino')),
                    ],
                    onChanged: (v) => language = v!,
                  ),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Sound and pronunciation'),
                    value: sound,
                    onChanged: (v) => setDialog(() => sound = v),
                  ),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Reduce motion'),
                    value: reduced,
                    onChanged: (v) => setDialog(() => reduced = v),
                  ),
                  if (initial != null)
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('Profile is active'),
                      subtitle: const Text(
                        'Archiving closes active learning sessions.',
                      ),
                      value: active,
                      onChanged: (v) => setDialog(() => active = v),
                    ),
                  if (error != null)
                    Text(
                      error!,
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.error,
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: saving ? null : () => Navigator.pop(dialog),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: saving
                ? null
                : () async {
                    if (!form.currentState!.validate()) return;
                    setDialog(() => saving = true);
                    try {
                      await ref.read(learningRepositoryProvider).call(
                        'save_child_profile',
                        {
                          'p_id': initial?['id'],
                          'p_data': {
                            'nickname': nickname.text,
                            'avatar_key': avatar,
                            'grade_level': grade,
                            'learning_level': level,
                            'preferences': {
                              'language': language,
                              'sound': sound,
                              'reduced_motion': reduced,
                            },
                            'active': active,
                          },
                        },
                      );
                      ref.invalidate(workspaceSnapshotProvider);
                      if (dialog.mounted) Navigator.pop(dialog);
                    } catch (e) {
                      setDialog(() {
                        error = friendlyError(e);
                        saving = false;
                      });
                    }
                  },
            child: Text(saving ? 'Saving…' : 'Save child profile'),
          ),
        ],
      ),
    ),
  );
  nickname.dispose();
}

class StudentLearningPage extends ConsumerStatefulWidget {
  const StudentLearningPage({super.key});
  @override
  ConsumerState<StudentLearningPage> createState() =>
      _StudentLearningPageState();
}

class _StudentLearningPageState extends ConsumerState<StudentLearningPage> {
  Json? data;
  String? error;
  String section = 'home', query = '';
  bool loading = true, offline = false;
  @override
  void initState() {
    super.initState();
    Future.microtask(load);
  }

  Future<void> load() async {
    final session = ref.read(studentSessionProvider);
    if (session == null) return;
    try {
      final result = await ref.read(studentRepositoryProvider).load(session);
      if (mounted) {
        setState(() {
          data = result;
          loading = false;
          offline = false;
          error = null;
        });
      }
    } catch (e) {
      if (e is StudentSessionExpired) {
        if (mounted) {
          setState(() {
            loading = false;
            offline = false;
            error = e.toString();
          });
        }
        return;
      }
      final cached = await LearningCache.read('child.${session.id}');
      if (mounted) {
        setState(() {
          loading = false;
          offline = cached != null;
          data = cached;
          error = cached == null ? friendlyError(e) : null;
        });
      }
    }
  }

  void open(Json material, {bool vocabulary = false}) {
    final session = ref.read(studentSessionProvider)!;
    Navigator.push(
      context,
      MaterialPageRoute<void>(
        builder: (_) => MaterialReader(
          material: vocabulary ? {...material, 'kind': 'vocabulary'} : material,
          session: session,
          onCompleted: load,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(studentSessionProvider);
    if (session == null) return const AdultUnlockPage();
    final child = session.child;
    return PopScope(
      canPop: false,
      child: Scaffold(
        backgroundColor: const Color(0xFFFFFCF2),
        appBar: AppBar(
          automaticallyImplyLeading: false,
          title: Row(
            children: [
              CircleAvatar(child: Icon(avatarIcons[child['avatar_key']])),
              const SizedBox(width: 10),
              Flexible(child: Text('Hi, ${child['nickname']}!')),
            ],
          ),
          actions: [
            IconButton(
              onPressed: load,
              tooltip: 'Refresh learning content',
              icon: const Icon(Icons.refresh),
            ),
            TextButton.icon(
              onPressed: () => context.go('/adult-unlock'),
              icon: const Icon(Icons.lock_outline),
              label: const Text('Adult controls'),
            ),
          ],
        ),
        body: loading
            ? const Center(child: CircularProgressIndicator())
            : error != null
            ? Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(error!, textAlign: TextAlign.center),
                      const SizedBox(height: 18),
                      FilledButton(
                        onPressed: load,
                        child: const Text('Try again'),
                      ),
                    ],
                  ),
                ),
              )
            : ListView(
                padding: const EdgeInsets.all(24),
                children: [
                  Center(
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 1150),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          if (offline)
                            const Notice(
                              'You are using downloaded content. Stars and progress update when you reconnect.',
                            ),
                          Wrap(
                            spacing: 10,
                            runSpacing: 10,
                            children: studentSections.entries
                                .map(
                                  (entry) => ChoiceChip(
                                    label: Text(entry.value),
                                    selected: section == entry.key,
                                    onSelected: (_) => setState(() {
                                      section = entry.key;
                                      query = '';
                                    }),
                                  ),
                                )
                                .toList(),
                          ),
                          const SizedBox(height: 24),
                          if (section == 'home')
                            ..._home(child)
                          else if (section == 'progress')
                            ..._progress()
                          else if (section == 'translator')
                            StudentTranslator(
                              session: session,
                              activeModel: data?['active_model'] as Map?,
                            )
                          else if (section == 'downloads')
                            ..._downloads(session)
                          else
                            ..._library(),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
      ),
    );
  }

  List<Widget> _home(Json child) => [
    Card(
      color: const Color(0xFFE4F6F1),
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Wrap(
          spacing: 24,
          runSpacing: 20,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            Image.asset(
              'assets/images/linguakids-character-journey.png',
              width: 140,
              height: 140,
              fit: BoxFit.contain,
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Let’s learn together!',
                  style: Theme.of(context).textTheme.headlineMedium,
                ),
                const SizedBox(height: 10),
                Text(
                  'Grade ${child['grade_level']} · ${child['learning_level']}',
                ),
                const SizedBox(height: 12),
                Text(
                  offline
                      ? 'Your downloaded learning adventure'
                      : '${data?['stars'] ?? 0} stars earned · ${data?['completed'] ?? 0} activities completed',
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    ),
    const SizedBox(height: 18),
    Wrap(
      spacing: 16,
      runSpacing: 16,
      children: studentSections.entries
          .where((e) => !['home', 'progress', 'downloads'].contains(e.key))
          .map(
            (entry) => SizedBox(
              width: 245,
              child: Card(
                child: InkWell(
                  borderRadius: BorderRadius.circular(20),
                  onTap: () => setState(() => section = entry.key),
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(
                          const {
                            'lessons': Icons.menu_book_rounded,
                            'dictionary': Icons.spellcheck_rounded,
                            'translator': Icons.translate_rounded,
                            'games': Icons.extension_rounded,
                            'quizzes': Icons.quiz_rounded,
                            'stories': Icons.auto_stories_rounded,
                            'vocabulary': Icons.style_rounded,
                          }[entry.key],
                          size: 42,
                          color: const Color(0xFF21A0A0),
                        ),
                        const SizedBox(height: 16),
                        Text(
                          entry.value,
                          style: Theme.of(context).textTheme.titleLarge,
                        ),
                        const SizedBox(height: 8),
                        Text(studentDescriptions[entry.key]!),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          )
          .toList(),
    ),
  ];
  List<Widget> _library() {
    final kind = const {
      'lessons': 'lesson',
      'dictionary': 'dictionary',
      'games': 'game',
      'quizzes': 'quiz',
      'stories': 'story',
    }[section];
    final saved = (data?['saved_vocabulary'] as List? ?? []).cast<String>();
    final rows = learningShelfMaterials(data?['materials'])
        .where(
          (m) =>
              (section == 'vocabulary'
                  ? saved.contains(m['id']) || m['kind'] == 'vocabulary'
                  : section == 'dictionary'
                  ? ['dictionary', 'vocabulary'].contains(m['kind'])
                  : m['kind'] == kind) &&
              '${m['title']} ${m['body']} ${m['summary']}'
                  .toLowerCase()
                  .contains(query.toLowerCase()),
        )
        .toList();
    return [
      Text(
        studentSections[section]!,
        style: Theme.of(context).textTheme.headlineMedium,
      ),
      const SizedBox(height: 10),
      Text(studentDescriptions[section]!),
      const SizedBox(height: 18),
      TextField(
        key: ValueKey(section),
        onChanged: (v) => setState(() => query = v),
        decoration: const InputDecoration(
          prefixIcon: Icon(Icons.search),
          hintText: 'What would you like to find?',
        ),
      ),
      const SizedBox(height: 18),
      if (rows.isEmpty)
        Notice(
          section == 'vocabulary'
              ? 'Save a word set from the dictionary to practice it here.'
              : 'No matching learning activities yet. Your adult can add classroom content.',
        ),
      if (section == 'stories')
        LayoutBuilder(
          builder: (context, box) => Wrap(
            spacing: 22,
            runSpacing: 18,
            children: rows
                .map(
                  (m) => SizedBox(
                    width: box.maxWidth < 560
                        ? box.maxWidth
                        : (box.maxWidth - 22 * (box.maxWidth > 930 ? 2 : 1)) /
                              (box.maxWidth > 930 ? 3 : 2),
                    child: StoryBookCover(material: m, onOpen: () => open(m)),
                  ),
                )
                .toList(),
          ),
        )
      else
        ...rows.map(
          (m) => Card(
            child: ListTile(
              contentPadding: const EdgeInsets.all(20),
              leading: CircleAvatar(child: Icon(materialIcons[m['kind']])),
              title: Text(
                '${m['title']}',
                style: const TextStyle(
                  fontSize: 21,
                  fontWeight: FontWeight.w700,
                ),
              ),
              subtitle: Text('${m['summary']}'),
              trailing: const Icon(Icons.play_circle_outline_rounded),
              onTap: () => open(m, vocabulary: section == 'vocabulary'),
            ),
          ),
        ),
    ];
  }

  List<Widget> _progress() {
    final attempts = jsonRows(data?['attempts']);
    final materials = jsonRows(data?['materials']);
    return [
      Text('My progress', style: Theme.of(context).textTheme.headlineMedium),
      const SizedBox(height: 18),
      if (offline)
        const Notice('Connect to see your latest stars and badges.')
      else ...[
        Wrap(
          spacing: 16,
          runSpacing: 16,
          children: [
            MetricCard(
              label: 'My stars',
              value: '${data?['stars'] ?? 0}',
              icon: Icons.star_rounded,
            ),
            MetricCard(
              label: 'Activities completed',
              value: '${data?['completed'] ?? 0}',
              icon: Icons.task_alt_rounded,
            ),
          ],
        ),
        const SizedBox(height: 20),
        Text('My badges', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 12),
        Wrap(
          spacing: 12,
          runSpacing: 12,
          children: (data?['badges'] as List? ?? [])
              .map(
                (b) => Chip(
                  avatar: const Icon(Icons.workspace_premium_rounded),
                  label: Text('$b'),
                ),
              )
              .toList(),
        ),
        if ((data?['badges'] as List? ?? []).isEmpty)
          const Text('Complete your first activity to earn your first badge.'),
        const SizedBox(height: 22),
        ...attempts.map((a) {
          final m = materials
              .where((m) => m['id'] == a['material_id'])
              .firstOrNull;
          return Card(
            child: ListTile(
              leading: const Icon(Icons.star_rounded, color: Color(0xFFFFC857)),
              title: Text('${m?['title'] ?? 'Completed activity'}'),
              subtitle: Text(
                '${a['correct_count']}/${a['total_count']} · ${a['stars']} new stars',
              ),
            ),
          );
        }),
      ],
    ];
  }

  List<Widget> _downloads(StudentSession session) => [
    Text(
      'My downloaded content',
      style: Theme.of(context).textTheme.headlineMedium,
    ),
    const SizedBox(height: 12),
    const Text(
      'Save lessons, stories, dictionary sets, games, and quizzes on this device. Practice works offline; answers are checked and stars awarded after reconnecting.',
    ),
    const SizedBox(height: 20),
    Wrap(
      spacing: 12,
      runSpacing: 12,
      children: [
        FilledButton.icon(
          onPressed: offline
              ? null
              : () async {
                  await LearningCache.save('child.${session.id}', {
                    'materials': data?['materials'] ?? [],
                    'saved_vocabulary': data?['saved_vocabulary'] ?? [],
                    'offline': true,
                  });
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text(
                          'Learning content downloaded on this device.',
                        ),
                      ),
                    );
                  }
                },
          icon: const Icon(Icons.download),
          label: const Text('Download learning content'),
        ),
        OutlinedButton(
          onPressed: () async {
            await LearningCache.clear('child.${session.id}');
            if (mounted) {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Downloaded content removed.')),
              );
            }
          },
          child: const Text('Remove downloads'),
        ),
      ],
    ),
    const SizedBox(height: 22),
    ...jsonRows(data?['materials']).map(
      (m) => ListTile(
        leading: Icon(materialIcons[m['kind']]),
        title: Text('${m['title']}'),
        onTap: () => open(m),
      ),
    ),
  ];
}

const studentSections = {
  'home': 'My learning map',
  'lessons': 'Lessons',
  'dictionary': 'Dictionary',
  'translator': 'Translate',
  'games': 'Games',
  'quizzes': 'Quizzes',
  'stories': 'Stories',
  'vocabulary': 'My vocabulary',
  'progress': 'My progress',
  'downloads': 'Downloads',
};
const studentDescriptions = {
  'lessons': 'Explore short lessons in English and Filipino.',
  'dictionary': 'Find the words you need and save your favorites.',
  'translator': 'Translate a short sentence using the active trained model.',
  'games': 'Match words and learn through play.',
  'quizzes': 'Show what you have learned and earn stars.',
  'stories': 'Read and listen to illustrated bilingual stories.',
  'vocabulary': 'Practice your saved and classroom vocabulary sets.',
};

class StudentTranslator extends ConsumerStatefulWidget {
  const StudentTranslator({
    required this.session,
    required this.activeModel,
    super.key,
  });
  final StudentSession session;
  final Map? activeModel;
  @override
  ConsumerState<StudentTranslator> createState() => _StudentTranslatorState();
}

class _StudentTranslatorState extends ConsumerState<StudentTranslator> {
  final text = TextEditingController();
  String source = 'en', result = '';
  bool loading = false;
  @override
  void dispose() {
    text.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      Text(
        'Translate a short sentence',
        style: Theme.of(context).textTheme.headlineMedium,
      ),
      const SizedBox(height: 14),
      Notice(
        widget.activeModel == null
            ? 'A trained translation model is not active yet. Ask your adult to check model readiness.'
            : 'Using ${widget.activeModel!['name']} · ${widget.activeModel!['version']}. Ask an adult to review translations.',
      ),
      const SizedBox(height: 16),
      DropdownButtonFormField<String>(
        isExpanded: true,
        initialValue: source,
        decoration: const InputDecoration(labelText: 'Direction'),
        items: const [
          DropdownMenuItem(value: 'en', child: Text('English → Filipino')),
          DropdownMenuItem(value: 'fil', child: Text('Filipino → English')),
        ],
        onChanged: (v) => setState(() => source = v!),
      ),
      const SizedBox(height: 16),
      TextField(
        controller: text,
        maxLength: 300,
        minLines: 4,
        maxLines: 6,
        decoration: const InputDecoration(labelText: 'Your sentence'),
      ),
      const SizedBox(height: 14),
      FilledButton.icon(
        onPressed: widget.activeModel == null || loading
            ? null
            : () async {
                if (text.text.trim().isEmpty) return;
                setState(() => loading = true);
                try {
                  final translated = await ref
                      .read(studentRepositoryProvider)
                      .translate(widget.session, text.text.trim(), source);
                  if (mounted) setState(() => result = translated);
                } catch (e) {
                  if (mounted) setState(() => result = friendlyError(e));
                } finally {
                  if (mounted) setState(() => loading = false);
                }
              },
        icon: const Icon(Icons.translate),
        label: Text(loading ? 'Translating…' : 'Translate'),
      ),
      if (result.isNotEmpty)
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 20),
          child: SelectableText(
            result,
            style: Theme.of(context).textTheme.titleLarge,
          ),
        ),
    ],
  );
}

class AdultUnlockPage extends ConsumerStatefulWidget {
  const AdultUnlockPage({super.key});
  @override
  ConsumerState<AdultUnlockPage> createState() => _AdultUnlockPageState();
}

class _AdultUnlockPageState extends ConsumerState<AdultUnlockPage> {
  final email = TextEditingController(), password = TextEditingController();
  bool loading = false;
  String? error;
  @override
  void initState() {
    super.initState();
    email.text = ref.read(authControllerProvider).value?.email ?? '';
  }

  @override
  void dispose() {
    email.dispose();
    password.dispose();
    super.dispose();
  }

  Future<void> unlock() async {
    final preview = ref.read(learningRepositoryProvider).isPreview;
    setState(() => loading = true);
    if (!preview) {
      await ref
          .read(authControllerProvider.notifier)
          .signIn(email.text, password.text);
      if (ref.read(authControllerProvider).hasError) {
        if (mounted) {
          setState(() {
            error =
                'Adult login could not be verified. Check your email and password.';
            loading = false;
          });
        }
        return;
      }
    }
    final childSession = ref.read(studentSessionProvider);
    if (childSession != null) {
      try {
        await ref.read(studentRepositoryProvider).close(childSession);
      } catch (_) {
        /* Expired or offline sessions still leave the adult UI locked until verification. */
      }
    }
    ref.read(studentSessionProvider.notifier).clear();
    await ref.read(adultLockProvider.notifier).setLocked(false);
    final admin =
        ref.read(authControllerProvider).value?.role ==
        AccountRole.administrator;
    if (mounted) context.go(admin ? '/workspace/overview' : '/workspace/home');
  }

  @override
  Widget build(BuildContext context) {
    final preview = ref.watch(learningRepositoryProvider).isPreview;
    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        title: const Text('Adult verification'),
      ),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 460),
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(28),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Icon(Icons.lock_rounded, size: 52),
                    const SizedBox(height: 18),
                    Text(
                      'Return to adult controls',
                      style: Theme.of(context).textTheme.headlineMedium,
                    ),
                    const SizedBox(height: 12),
                    Text(
                      preview
                          ? 'This is a local preview. No real account password is needed.'
                          : 'An authorized adult must verify their account before leaving student mode.',
                    ),
                    const SizedBox(height: 20),
                    if (!preview) ...[
                      TextField(
                        controller: email,
                        decoration: const InputDecoration(
                          labelText: 'Adult email',
                        ),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: password,
                        obscureText: true,
                        decoration: const InputDecoration(
                          labelText: 'Adult account password',
                        ),
                        onSubmitted: (_) => unlock(),
                      ),
                      const SizedBox(height: 18),
                    ],
                    if (error != null)
                      Text(
                        error!,
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.error,
                        ),
                      ),
                    FilledButton(
                      onPressed: loading ? null : unlock,
                      child: Text(
                        loading
                            ? 'Verifying…'
                            : preview
                            ? 'Return to preview'
                            : 'Verify adult and exit',
                      ),
                    ),
                    if (ref.watch(studentSessionProvider) != null)
                      TextButton(
                        onPressed: () => context.go('/student'),
                        child: const Text('Keep learning'),
                      ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
