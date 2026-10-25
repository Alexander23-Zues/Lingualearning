import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:uuid/uuid.dart';

import '../auth/domain/app_user.dart';
import '../auth/presentation/auth_controller.dart';
import 'child_pages.dart';
import 'learning_data.dart';
import 'material_reader.dart';
import 'story_art.dart';

final adultPreferencesProvider = FutureProvider<Json>((ref) {
  ref.watch(authControllerProvider.select((value) => value.value?.id));
  return ref.watch(learningRepositoryProvider).preferences();
});

class LearningWorkspace extends ConsumerStatefulWidget {
  const LearningWorkspace({required this.section, super.key});
  final String section;
  @override
  ConsumerState<LearningWorkspace> createState() => _LearningWorkspaceState();
}

class _LearningWorkspaceState extends ConsumerState<LearningWorkspace> {
  String query = '';
  int grade = 0;
  String status = 'all';
  final kindsBySection = const {
    'lessons': 'lesson',
    'dictionary': 'dictionary',
    'activities': 'game',
    'quizzes': 'quiz',
    'stories': 'story',
  };
  final recordKinds = const {
    'plans': 'plan',
    'sessions': 'session',
    'curriculum': 'curriculum',
    'datasets': 'dataset',
    'training': 'training',
    'announcements': 'announcement',
  };
  void refresh() => ref.invalidate(workspaceSnapshotProvider);
  bool matches(Json row) =>
      jsonEncode(row).toLowerCase().contains(query.toLowerCase());

  @override
  Widget build(BuildContext context) {
    final snapshot = ref.watch(workspaceSnapshotProvider);
    final user = ref.watch(authControllerProvider).value;
    if (user == null) return const SizedBox();
    if (widget.section == 'settings') return const AdultSettingsPage();
    return snapshot.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) => Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.cloud_off_rounded, size: 48),
              const SizedBox(height: 12),
              Text(friendlyError(error), textAlign: TextAlign.center),
              const SizedBox(height: 16),
              FilledButton(onPressed: refresh, child: const Text('Try again')),
            ],
          ),
        ),
      ),
      data: (data) {
        final admin = user.role == AccountRole.administrator;
        final materials = learningShelfMaterials(data['materials']);
        final records = jsonRows(data['records']);
        final children = jsonRows(data['children']);
        final attempts = jsonRows(data['attempts']);
        final offline = data['offline'] == true;
        if (widget.section == 'home' || widget.section == 'overview') {
          return _home(user, data);
        }
        if (widget.section == 'students') {
          return ChildProfilesPage(snapshot: data, onChanged: refresh);
        }
        if (widget.section == 'educators') return _educators(data);
        if (widget.section == 'models') return _models(data);
        if (widget.section == 'reports' ||
            widget.section == 'student-submissions') {
          return _reports(children, attempts, materials);
        }
        if (widget.section == 'downloads') return _downloads(materials);
        if (recordKinds.containsKey(widget.section)) {
          return _records(
            records,
            materials,
            recordKinds[widget.section]!,
            admin,
            offline,
          );
        }
        final kind = kindsBySection[widget.section];
        var visible = materials
            .where(
              (m) =>
                  (kind == null || m['kind'] == kind) &&
                  matches(m) &&
                  (grade == 0 || m['grade_level'] == grade) &&
                  (status == 'all' || m['status'] == status),
            )
            .toList();
        if (widget.section == 'resources' && !admin) {
          visible = visible.where((m) => m['owner_id'] == user.id).toList();
        }
        final title =
            const {
              'lessons': 'Curriculum and Lessons',
              'dictionary': 'English–Filipino Dictionary',
              'activities': 'Activities and Games',
              'quizzes': 'Quiz and Worksheet Builder',
              'stories': 'Stories and Reading',
              'resources': 'Teaching Resources',
            }[widget.section] ??
            'Learning library';
        final description = const {
          'lessons':
              'Plan a bilingual sequence, open an original starter lesson, or write your own classroom material.',
          'dictionary':
              'Find bilingual word sets, pronunciation practice, and vocabulary for your students.',
          'activities':
              'Build word-pair games that students can play at their own pace.',
          'quizzes':
              'Write questions with answer keys. Student scores and stars are calculated by the server.',
          'stories':
              'Create illustrated bilingual stories using short pages and preset illustrations.',
          'resources':
              'Your working drafts and classroom-ready materials, with clear publication states.',
        }[widget.section]!;
        return ListView(
          padding: const EdgeInsets.all(28),
          children: [
            WorkspaceHeading(
              title: title,
              description: description,
              action: FilledButton.icon(
                onPressed: offline
                    ? null
                    : () => editMaterial(context, ref, kind: kind),
                icon: const Icon(Icons.add),
                label: Text(kind == null ? 'New material' : 'New $kind'),
              ),
            ),
            if (offline)
              const Notice(
                'Offline library · saved materials are available to read. Connect to create or update records.',
              ),
            const SizedBox(height: 20),
            _filters(),
            const SizedBox(height: 20),
            if (visible.isEmpty)
              const Notice(
                'No materials match these filters. Create a draft or try another grade or status.',
              ),
            if (kind == 'story')
              LayoutBuilder(
                builder: (context, box) => Wrap(
                  spacing: 22,
                  runSpacing: 18,
                  children: visible
                      .map(
                        (m) => SizedBox(
                          width: box.maxWidth < 560
                              ? box.maxWidth
                              : (box.maxWidth -
                                        22 * (box.maxWidth > 930 ? 2 : 1)) /
                                    (box.maxWidth > 930 ? 3 : 2),
                          child: Column(
                            children: [
                              StoryBookCover(
                                material: m,
                                onOpen: () => Navigator.push(
                                  context,
                                  MaterialPageRoute<void>(
                                    builder: (_) => MaterialReader(material: m),
                                  ),
                                ),
                              ),
                              if (admin || m['owner_id'] == user.id)
                                TextButton.icon(
                                  onPressed: () =>
                                      editMaterial(context, ref, initial: m),
                                  icon: const Icon(Icons.edit_outlined),
                                  label: const Text('Edit this story'),
                                ),
                            ],
                          ),
                        ),
                      )
                      .toList(),
                ),
              )
            else
              ...visible.map((m) {
                final canEdit =
                    admin ||
                    (m['owner_id'] == user.id && m['status'] != 'published');
                return Card(
                  child: ListTile(
                    contentPadding: const EdgeInsets.all(18),
                    leading: CircleAvatar(
                      child: Icon(materialIcons[m['kind']] ?? Icons.menu_book),
                    ),
                    title: Text(
                      m['title'] as String,
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                    subtitle: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('${m['summary']}'),
                        const SizedBox(height: 6),
                        Text(
                          'Grade ${m['grade_level']} · ${m['learning_level']} · ${m['status']}',
                        ),
                        Text(
                          '${m['source_label']}',
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ],
                    ),
                    trailing: Wrap(
                      children: [
                        IconButton(
                          tooltip: 'Open material',
                          icon: const Icon(Icons.open_in_new),
                          onPressed: () => Navigator.push(
                            context,
                            MaterialPageRoute<void>(
                              builder: (_) => MaterialReader(material: m),
                            ),
                          ),
                        ),
                        if (canEdit && !offline)
                          IconButton(
                            tooltip: 'Edit material',
                            icon: const Icon(Icons.edit_outlined),
                            onPressed: () =>
                                editMaterial(context, ref, initial: m),
                          ),
                      ],
                    ),
                    onTap: () => Navigator.push(
                      context,
                      MaterialPageRoute<void>(
                        builder: (_) => MaterialReader(material: m),
                      ),
                    ),
                  ),
                );
              }),
          ],
        );
      },
    );
  }

  Widget _filters() => Wrap(
    spacing: 14,
    runSpacing: 14,
    crossAxisAlignment: WrapCrossAlignment.center,
    children: [
      SizedBox(
        width: 300,
        child: TextField(
          onChanged: (v) => setState(() => query = v),
          decoration: const InputDecoration(
            prefixIcon: Icon(Icons.search),
            hintText: 'Search this library',
          ),
        ),
      ),
      DropdownMenu<int>(
        initialSelection: grade,
        label: const Text('Grade'),
        onSelected: (v) => setState(() => grade = v ?? 0),
        dropdownMenuEntries: [
          const DropdownMenuEntry(value: 0, label: 'All grades'),
          ...List.generate(
            6,
            (i) => DropdownMenuEntry(value: i + 1, label: 'Grade ${i + 1}'),
          ),
        ],
      ),
      DropdownMenu<String>(
        initialSelection: status,
        label: const Text('Status'),
        onSelected: (v) => setState(() => status = v ?? 'all'),
        dropdownMenuEntries:
            ['all', 'draft', 'classroom', 'submitted', 'published', 'archived']
                .map(
                  (s) => DropdownMenuEntry(
                    value: s,
                    label: s == 'all' ? 'All statuses' : s,
                  ),
                )
                .toList(),
      ),
      IconButton(
        onPressed: refresh,
        icon: const Icon(Icons.refresh),
        tooltip: 'Refresh',
      ),
    ],
  );

  Widget _home(AppUser user, Json data) {
    final admin = user.role == AccountRole.administrator;
    final materials = jsonRows(data['materials']);
    final children = jsonRows(data['children']);
    final attempts = jsonRows(data['attempts']);
    final model = data['active_model'] as Map?;
    return ListView(
      padding: const EdgeInsets.all(28),
      children: [
        WorkspaceHeading(
          title: 'Good day, ${user.name}',
          description: admin
              ? 'Review learning content, support educators, and keep student access private.'
              : 'Prepare your next lesson, open a child’s learning profile, and celebrate their progress.',
        ),
        const SizedBox(height: 22),
        Wrap(
          spacing: 16,
          runSpacing: 16,
          children: [
            MetricCard(
              label: admin ? 'Educator accounts' : 'Child profiles',
              value: admin
                  ? '${jsonRows(data['educators']).where((e) => e['role'] == 'educator').length}'
                  : '${children.length}',
              icon: Icons.people_rounded,
            ),
            MetricCard(
              label: admin ? 'Published materials' : 'My teaching materials',
              value:
                  '${materials.where((m) => admin ? m['status'] == 'published' : m['owner_id'] == user.id).length}',
              icon: Icons.library_books_rounded,
            ),
            MetricCard(
              label: admin
                  ? 'Awaiting review'
                  : 'Learning activities completed',
              value: admin
                  ? '${materials.where((m) => m['status'] == 'submitted').length}'
                  : '${attempts.length}',
              icon: Icons.task_alt_rounded,
            ),
            MetricCard(
              label: 'Trained translation model',
              value: model == null ? 'Not active' : '${model['version']}',
              icon: Icons.translate_rounded,
            ),
          ],
        ),
        const SizedBox(height: 26),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  admin ? 'Content review desk' : 'Ready for today',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 12),
                Text(
                  admin
                      ? 'Educators can save private drafts and share classroom materials with their own students. Only administrators publish materials for everyone.'
                      : 'Choose a nickname and preset avatar for each child. An adult opens student mode; students do not create accounts or share contact information.',
                ),
                const SizedBox(height: 16),
                Wrap(
                  spacing: 12,
                  runSpacing: 12,
                  children: [
                    FilledButton.icon(
                      onPressed: () => context.go(
                        admin ? '/workspace/resources' : '/workspace/students',
                      ),
                      icon: Icon(
                        admin ? Icons.rate_review : Icons.emoji_people,
                      ),
                      label: Text(
                        admin
                            ? 'Review teaching resources'
                            : 'Open student profiles',
                      ),
                    ),
                    OutlinedButton(
                      onPressed: () => context.go(
                        admin ? '/workspace/educators' : '/workspace/lessons',
                      ),
                      child: Text(
                        admin ? 'Manage educators' : 'Browse lessons',
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 20),
        Text(
          'End users and permissions',
          style: Theme.of(context).textTheme.titleLarge,
        ),
        const SizedBox(height: 12),
        const StudentPermissionCard(),
        const SizedBox(height: 20),
        Text(
          'Recently updated learning materials',
          style: Theme.of(context).textTheme.titleLarge,
        ),
        ...materials
            .take(4)
            .map(
              (m) => Card(
                child: ListTile(
                  leading: Icon(materialIcons[m['kind']]),
                  title: Text('${m['title']}'),
                  subtitle: Text('Grade ${m['grade_level']} · ${m['status']}'),
                  onTap: () => Navigator.push(
                    context,
                    MaterialPageRoute<void>(
                      builder: (_) => MaterialReader(material: m),
                    ),
                  ),
                ),
              ),
            ),
      ],
    );
  }

  Widget _educators(Json data) => ListView(
    padding: const EdgeInsets.all(28),
    children: [
      WorkspaceHeading(
        title: 'Educator Management',
        description:
            'Review adult accounts and access status. A child never appears in this account list.',
        action: OutlinedButton.icon(
          onPressed: () async {
            await Clipboard.setData(
              ClipboardData(text: '${Uri.base.origin}/#/register'),
            );
            if (mounted) {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('Educator registration link copied.'),
                ),
              );
            }
          },
          icon: const Icon(Icons.link),
          label: const Text('Copy registration link'),
        ),
      ),
      const SizedBox(height: 20),
      TextField(
        onChanged: (v) => setState(() => query = v),
        decoration: const InputDecoration(
          prefixIcon: Icon(Icons.search),
          hintText: 'Search adult names or email addresses',
        ),
      ),
      const SizedBox(height: 20),
      ...jsonRows(data['educators'])
          .where(matches)
          .map(
            (e) => Card(
              child: ListTile(
                leading: const CircleAvatar(child: Icon(Icons.person_outline)),
                title: Text('${e['name']}'),
                subtitle: Text('${e['email']}\n${e['role']} · ${e['status']}'),
                isThreeLine: true,
                trailing: e['role'] == 'administrator'
                    ? const Chip(label: Text('Administrator'))
                    : TextButton(
                        onPressed: () => _changeEducator(e),
                        child: Text(
                          e['status'] == 'active' ? 'Suspend' : 'Activate',
                        ),
                      ),
              ),
            ),
          ),
      if (jsonRows(data['educators']).isEmpty)
        const Notice(
          'No adult accounts yet. Educators can use the registration link after the administrator finishes setup.',
        ),
    ],
  );
  Future<void> _changeEducator(Json educator) async {
    final reason = TextEditingController();
    String? error;
    await showDialog<void>(
      context: context,
      builder: (dialog) => StatefulBuilder(
        builder: (dialog, setDialog) => AlertDialog(
          title: Text(
            '${educator['status'] == 'active' ? 'Suspend' : 'Activate'} educator',
          ),
          content: TextField(
            controller: reason,
            maxLines: 3,
            decoration: InputDecoration(
              labelText: 'Reason for this change',
              errorText: error,
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialog),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () async {
                try {
                  await ref
                      .read(learningRepositoryProvider)
                      .call('admin_update_educator', {
                        'p_id': educator['id'],
                        'p_status': educator['status'] == 'active'
                            ? 'suspended'
                            : 'active',
                        'p_reason': reason.text,
                      });
                  if (dialog.mounted) Navigator.pop(dialog);
                  refresh();
                } catch (e) {
                  setDialog(() => error = friendlyError(e));
                }
              },
              child: const Text('Save access change'),
            ),
          ],
        ),
      ),
    );
    reason.dispose();
  }

  Widget _records(
    List<Json> records,
    List<Json> materials,
    String kind,
    bool admin,
    bool offline,
  ) {
    final specs = recordSpecs[kind]!;
    final rows = records
        .where(
          (r) => r['kind'] == kind && r['status'] != 'archived' && matches(r),
        )
        .toList();
    return ListView(
      padding: const EdgeInsets.all(28),
      children: [
        WorkspaceHeading(
          title: specs[0],
          description: specs[1],
          action: FilledButton.icon(
            onPressed: offline
                ? null
                : () => editRecord(
                    context,
                    ref,
                    kind: kind,
                    materials: materials,
                    records: records,
                  ),
            icon: const Icon(Icons.add),
            label: Text(specs[2]),
          ),
        ),
        if (kind == 'curriculum')
          const Notice(
            'Record actual source URLs and reviewer notes. Starter lessons are supplemental enrichment and do not claim official curriculum alignment.',
          ),
        if (kind == 'dataset')
          const Notice(
            'Use only original or licensed English–Filipino text. Do not include student names, contact details, or other personal data.',
          ),
        if (kind == 'training')
          const Notice(
            'Training runs on a separate suitable computer. A manifest records the selected data; it does not claim that a model has been trained.',
          ),
        const SizedBox(height: 20),
        TextField(
          onChanged: (v) => setState(() => query = v),
          decoration: const InputDecoration(
            prefixIcon: Icon(Icons.search),
            hintText: 'Search records',
          ),
        ),
        const SizedBox(height: 20),
        if (rows.isEmpty)
          Notice(
            'No ${specs[0].toLowerCase()} yet. Use “${specs[2]}” to create the first record.',
          ),
        ...rows.map((r) {
          final details = Map<String, dynamic>.from(r['data'] as Map? ?? {});
          return Card(
            child: ExpansionTile(
              title: Text('${r['title']}'),
              subtitle: Text(
                '${r['status']} · updated ${('${r['updated_at']}').split('T').first}',
              ),
              childrenPadding: const EdgeInsets.all(20),
              expandedCrossAxisAlignment: CrossAxisAlignment.start,
              children: [
                ...details.entries
                    .where((e) => e.key != 'pairs')
                    .map(
                      (e) => Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: SelectableText(
                          '${e.key.replaceAll('_', ' ')}: ${e.value}',
                        ),
                      ),
                    ),
                if (kind == 'dataset')
                  Text('${jsonRows(details['pairs']).length} bilingual pairs'),
                Wrap(
                  spacing: 10,
                  runSpacing: 8,
                  children: [
                    if (!offline &&
                        (admin ||
                            r['owner_id'] ==
                                ref.read(authControllerProvider).value?.id))
                      TextButton.icon(
                        onPressed: () => editRecord(
                          context,
                          ref,
                          kind: kind,
                          initial: r,
                          materials: materials,
                          records: records,
                        ),
                        icon: const Icon(Icons.edit_outlined),
                        label: const Text('Edit'),
                      ),
                    if (kind == 'dataset')
                      TextButton.icon(
                        onPressed: () async {
                          await Clipboard.setData(
                            ClipboardData(text: datasetCsv(details)),
                          );
                          if (mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text('Dataset CSV copied.'),
                              ),
                            );
                          }
                        },
                        icon: const Icon(Icons.copy),
                        label: const Text('Copy CSV'),
                      ),
                    if (kind == 'training')
                      TextButton.icon(
                        onPressed: () => Clipboard.setData(
                          ClipboardData(
                            text: const JsonEncoder.withIndent(
                              '  ',
                            ).convert(details),
                          ),
                        ),
                        icon: const Icon(Icons.copy),
                        label: const Text('Copy training manifest'),
                      ),
                  ],
                ),
              ],
            ),
          );
        }),
      ],
    );
  }

  Widget _models(Json data) => ListView(
    padding: const EdgeInsets.all(28),
    children: [
      const WorkspaceHeading(
        title: 'Model Registry',
        description:
            'Only evaluated and approved trained artifacts can become the active translation model.',
      ),
      const SizedBox(height: 18),
      Notice(
        data['active_model'] == null
            ? 'No trained model is active. Translation stays unavailable until an approved real model is deployed.'
            : 'Active model: ${(data['active_model'] as Map)['name']} · ${(data['active_model'] as Map)['version']}',
      ),
      if (data['active_model'] != null)
        Align(
          alignment: Alignment.centerLeft,
          child: OutlinedButton.icon(
            onPressed: () => _modelAction(null, true),
            icon: const Icon(Icons.undo),
            label: const Text('Roll back active model'),
          ),
        ),
      const SizedBox(height: 20),
      ...jsonRows(data['models']).map(
        (m) => Card(
          child: ListTile(
            leading: const Icon(Icons.hub_rounded),
            title: Text('${m['name']} · ${m['version']}'),
            subtitle: SelectableText(
              '${m['state']}\nArtifact: ${m['artifact_uri']}\nChecksum: ${m['artifact_checksum']}',
            ),
            isThreeLine: true,
            trailing: m['state'] == 'approved'
                ? TextButton(
                    onPressed: () => _modelAction(m, false),
                    child: const Text('Activate approved model'),
                  )
                : null,
          ),
        ),
      ),
      Card(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Prepare a real model',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 12),
              const Text(
                '1. Review licensed translation pairs.\n2. Create a training manifest and train using the project’s ML tools.\n3. Measure both translation directions and review sample output.\n4. Register the artifact, checksum, and evaluations through the protected model deployment workflow.',
              ),
              const SizedBox(height: 16),
              OutlinedButton(
                onPressed: () => context.go('/workspace/training'),
                child: const Text('Open training packages'),
              ),
            ],
          ),
        ),
      ),
    ],
  );

  Future<void> _modelAction(Json? model, bool rollback) async {
    final approved = await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: Text(
          rollback
              ? 'Roll back the active model?'
              : 'Activate this approved model?',
        ),
        content: Text(
          rollback
              ? 'The previous evaluated model will become active for translation.'
              : '${model!['name']} · ${model['version']} will become the translation model for the workspace.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialog, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialog, true),
            child: const Text('Confirm model change'),
          ),
        ],
      ),
    );
    if (approved != true) return;
    try {
      await ref
          .read(learningRepositoryProvider)
          .call('workspace_model_action', {
            'p_id': model?['id'],
            'p_checksum': model?['artifact_checksum'] ?? '',
            'p_rollback': rollback,
          });
      refresh();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(friendlyError(e))));
      }
    }
  }

  Widget _reports(
    List<Json> children,
    List<Json> attempts,
    List<Json> materials,
  ) {
    final stars = attempts.fold<int>(
      0,
      (sum, a) => sum + (a['stars'] as num? ?? 0).toInt(),
    );
    return ListView(
      padding: const EdgeInsets.all(28),
      children: [
        WorkspaceHeading(
          title: widget.section == 'student-submissions'
              ? 'Student Submissions'
              : 'Learning Reports',
          description:
              'Progress comes from recorded activity completions and server-scored quizzes.',
          action: OutlinedButton.icon(
            onPressed: () async {
              final csv = [
                'nickname,completed_activities,stars',
                ...children.map((c) {
                  final own = attempts
                      .where((a) => a['child_id'] == c['id'])
                      .toList();
                  return '"${('${c['nickname']}').replaceAll('"', '""')}",${own.length},${own.fold<num>(0, (sum, a) => sum + (a['stars'] as num? ?? 0))}';
                }),
              ].join('\n');
              await Clipboard.setData(ClipboardData(text: csv));
              if (mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Report CSV copied.')),
                );
              }
            },
            icon: const Icon(Icons.copy),
            label: const Text('Copy report CSV'),
          ),
        ),
        const SizedBox(height: 20),
        Wrap(
          spacing: 14,
          runSpacing: 14,
          children: [
            MetricCard(
              label: 'Child profiles',
              value: '${children.length}',
              icon: Icons.emoji_people,
            ),
            MetricCard(
              label: 'Completed activities',
              value: '${attempts.length}',
              icon: Icons.task_alt,
            ),
            MetricCard(
              label: 'Stars earned',
              value: '$stars',
              icon: Icons.star,
            ),
          ],
        ),
        const SizedBox(height: 22),
        if (attempts.isEmpty)
          const Notice(
            'No activity results yet. An authorized adult can open a child profile to begin learning.',
          ),
        ...children.map((c) {
          final own = attempts.where((a) => a['child_id'] == c['id']).toList();
          return Card(
            child: ExpansionTile(
              leading: Icon(avatarIcons[c['avatar_key']] ?? Icons.star),
              title: Text('${c['nickname']} · Grade ${c['grade_level']}'),
              subtitle: Text(
                '${own.length} activity records · ${c['learning_level']}',
              ),
              children: own.map((a) {
                final material = materials
                    .where((m) => m['id'] == a['material_id'])
                    .firstOrNull;
                return ListTile(
                  title: Text('${material?['title'] ?? 'Learning activity'}'),
                  subtitle: Text(
                    '${a['correct_count']}/${a['total_count']} correct · ${a['stars']} stars · ${a['completed_at']}',
                  ),
                );
              }).toList(),
            ),
          );
        }),
      ],
    );
  }

  Widget _downloads(List<Json> materials) {
    final viewerId = ref.read(authControllerProvider).value!.id;
    return FutureBuilder<Json?>(
      future: LearningCache.read('adult.downloads.$viewerId'),
      builder: (context, snapshot) {
        final saved = jsonRows(snapshot.data?['materials']);
        return ListView(
          padding: const EdgeInsets.all(28),
          children: [
            const WorkspaceHeading(
              title: 'Offline Downloads',
              description:
                  'Download learning content on this device. Reading, stories, and word practice work offline; progress sync needs a connection.',
            ),
            const SizedBox(height: 20),
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                FilledButton.icon(
                  onPressed: () async {
                    await LearningCache.save('adult.downloads.$viewerId', {
                      'materials': materials
                          .where(
                            (m) =>
                                m['status'] == 'published' ||
                                m['status'] == 'classroom',
                          )
                          .toList(),
                    });
                    setState(() {});
                  },
                  icon: const Icon(Icons.download),
                  label: const Text('Download available content'),
                ),
                OutlinedButton(
                  onPressed: () async {
                    await LearningCache.clear('adult.downloads.$viewerId');
                    setState(() {});
                  },
                  child: const Text('Remove downloads'),
                ),
              ],
            ),
            const SizedBox(height: 18),
            Text('${saved.length} materials saved on this device'),
            ...saved.map(
              (m) => Card(
                child: ListTile(
                  leading: Icon(materialIcons[m['kind']]),
                  title: Text('${m['title']}'),
                  subtitle: Text('Grade ${m['grade_level']} · downloaded'),
                  onTap: () => Navigator.push(
                    context,
                    MaterialPageRoute<void>(
                      builder: (_) => MaterialReader(material: m),
                    ),
                  ),
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

const recordSpecs = <String, List<String>>{
  'plan': [
    'My Teaching Plans',
    'Organize objectives, material selections, and reflections for your next class.',
    'New teaching plan',
  ],
  'session': [
    'Classroom Sessions',
    'Record a class label, participation, materials used, and a short teaching reflection.',
    'Record session',
  ],
  'curriculum': [
    'Curriculum References',
    'Maintain real source references and reviewer notes for curriculum alignment.',
    'Add source reference',
  ],
  'dataset': [
    'Translation Datasets',
    'Review English–Filipino pairs, provenance, and usage rights before training.',
    'New dataset',
  ],
  'training': [
    'Training Packages',
    'Prepare a documented dataset manifest for the separate training workflow.',
    'Create training manifest',
  ],
  'announcement': [
    'Announcements',
    'Write and publish useful updates for the educator workspace.',
    'New announcement',
  ],
};

class WorkspaceHeading extends StatelessWidget {
  const WorkspaceHeading({
    required this.title,
    required this.description,
    this.action,
    super.key,
  });
  final String title, description;
  final Widget? action;
  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) => Wrap(
      alignment: WrapAlignment.spaceBetween,
      spacing: 18,
      runSpacing: 18,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        SizedBox(
          width: (constraints.maxWidth - (action == null ? 0 : 240))
              .clamp(230, 700)
              .toDouble(),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: Theme.of(context).textTheme.headlineMedium),
              const SizedBox(height: 8),
              Text(description, style: Theme.of(context).textTheme.bodyLarge),
            ],
          ),
        ),
        ?action,
      ],
    ),
  );
}

class Notice extends StatelessWidget {
  const Notice(this.text, {super.key});
  final String text;
  @override
  Widget build(BuildContext context) => Card(
    color: const Color(0xFFFFF5DA),
    child: Padding(padding: const EdgeInsets.all(20), child: Text(text)),
  );
}

class MetricCard extends StatelessWidget {
  const MetricCard({
    required this.label,
    required this.value,
    required this.icon,
    super.key,
  });
  final String label, value;
  final IconData icon;
  @override
  Widget build(BuildContext context) => SizedBox(
    width: 240,
    child: Card(
      child: Padding(
        padding: const EdgeInsets.all(22),
        child: Row(
          children: [
            CircleAvatar(child: Icon(icon)),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(value, style: Theme.of(context).textTheme.titleLarge),
                  Text(label),
                ],
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

class StudentPermissionCard extends StatelessWidget {
  const StudentPermissionCard({super.key});
  @override
  Widget build(BuildContext context) => const Card(
    child: Padding(
      padding: EdgeInsets.all(22),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'A. Elementary Student',
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
          ),
          SizedBox(height: 10),
          Text('Students use child profiles created by an authorized adult.'),
          SizedBox(height: 10),
          Text(
            'Study lessons · search the dictionary · translate with the active trained model · play learning games · complete quizzes · read illustrated stories · practice saved vocabulary · earn stars and badges · view their own progress · use downloaded learning content offline.',
          ),
          SizedBox(height: 12),
          Text(
            'Collect only a nickname, preset avatar, grade, learning level, and preferences.',
            style: TextStyle(fontWeight: FontWeight.w700),
          ),
          SizedBox(height: 8),
          Text(
            'Children do not provide an email, exact birth date, address, phone number, or photograph.',
          ),
        ],
      ),
    ),
  );
}

Future<void> editMaterial(
  BuildContext context,
  WidgetRef ref, {
  Json? initial,
  String? kind,
}) async {
  Json data = initial ?? {};
  if (initial != null) {
    try {
      data = Map<String, dynamic>.from(
        await ref.read(learningRepositoryProvider).call(
              'learning_material_editor',
              {'p_id': initial['id']},
            )
            as Map,
      );
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(friendlyError(e))));
      }
      return;
    }
  }
  if (!context.mounted) return;
  final admin =
      ref.read(authControllerProvider).value?.role == AccountRole.administrator;
  final form = GlobalKey<FormState>();
  var selectedKind = data['kind'] as String? ?? kind ?? 'lesson';
  var selectedGrade = (data['grade_level'] as num? ?? 1).toInt();
  var level = data['learning_level'] as String? ?? 'beginner';
  var selectedStatus = data['status'] as String? ?? 'draft';
  final title = TextEditingController(text: data['title'] as String?);
  final summary = TextEditingController(text: data['summary'] as String?);
  final english = TextEditingController(
    text: (data['body'] as Map?)?['english'] as String?,
  );
  final filipino = TextEditingController(
    text: (data['body'] as Map?)?['filipino'] as String?,
  );
  final content = TextEditingController(
    text: formatMaterialBody(
      selectedKind,
      Map<String, dynamic>.from(data['body'] as Map? ?? {}),
    ),
  );
  String? error;
  bool saving = false;
  await showDialog<void>(
    context: context,
    builder: (dialog) => StatefulBuilder(
      builder: (dialog, setDialog) => AlertDialog(
        title: Text(
          initial == null
              ? 'Create teaching material'
              : 'Edit teaching material',
        ),
        content: SizedBox(
          width: 650,
          child: SingleChildScrollView(
            child: Form(
              key: form,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  DropdownButtonFormField<String>(
                    initialValue: selectedKind,
                    decoration: const InputDecoration(
                      labelText: 'Material type',
                    ),
                    items: learningKinds
                        .map((k) => DropdownMenuItem(value: k, child: Text(k)))
                        .toList(),
                    onChanged: initial == null
                        ? (v) => setDialog(() => selectedKind = v!)
                        : null,
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: title,
                    decoration: const InputDecoration(labelText: 'Title'),
                    validator: (v) =>
                        v == null || v.trim().isEmpty ? 'Enter a title.' : null,
                  ),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 12,
                    runSpacing: 12,
                    children: [
                      DropdownMenu<int>(
                        initialSelection: selectedGrade,
                        label: const Text('Grade'),
                        dropdownMenuEntries: List.generate(
                          6,
                          (i) => DropdownMenuEntry(
                            value: i + 1,
                            label: 'Grade ${i + 1}',
                          ),
                        ),
                        onSelected: (v) => selectedGrade = v!,
                      ),
                      DropdownMenu<String>(
                        initialSelection: level,
                        label: const Text('Learning level'),
                        dropdownMenuEntries: learningLevels
                            .map((l) => DropdownMenuEntry(value: l, label: l))
                            .toList(),
                        onSelected: (v) => level = v!,
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: summary,
                    decoration: const InputDecoration(
                      labelText: 'Short description',
                    ),
                    maxLines: 2,
                  ),
                  const SizedBox(height: 12),
                  if (selectedKind == 'lesson') ...[
                    TextFormField(
                      controller: english,
                      decoration: const InputDecoration(
                        labelText: 'English lesson',
                      ),
                      minLines: 4,
                      maxLines: 9,
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: filipino,
                      decoration: const InputDecoration(
                        labelText: 'Filipino lesson',
                      ),
                      minLines: 4,
                      maxLines: 9,
                    ),
                  ] else ...[
                    Text(materialFormatHint(selectedKind)),
                    const SizedBox(height: 8),
                    TextFormField(
                      controller: content,
                      decoration: const InputDecoration(
                        labelText: 'Learning content',
                      ),
                      minLines: 6,
                      maxLines: 14,
                    ),
                  ],
                  const SizedBox(height: 14),
                  DropdownButtonFormField<String>(
                    initialValue: selectedStatus,
                    decoration: const InputDecoration(
                      labelText: 'Availability',
                    ),
                    items:
                        [
                              'draft',
                              'classroom',
                              'submitted',
                              if (admin) 'published',
                              'archived',
                            ]
                            .map(
                              (s) => DropdownMenuItem(
                                value: s,
                                child: Text(
                                  const {
                                    'draft': 'Draft · adult workspace only',
                                    'classroom': 'Ready for my students',
                                    'submitted':
                                        'Submit for administrator review',
                                    'published': 'Published for all educators',
                                    'archived': 'Archived',
                                  }[s]!,
                                ),
                              ),
                            )
                            .toList(),
                    onChanged: (v) => selectedStatus = v!,
                  ),
                  if (error != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 12),
                      child: Text(
                        error!,
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.error,
                        ),
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
                      final body = selectedKind == 'lesson'
                          ? {'english': english.text, 'filipino': filipino.text}
                          : parseMaterialBody(selectedKind, content.text);
                      await ref.read(learningRepositoryProvider).call(
                        'save_learning_material',
                        {
                          'p_id': initial?['id'],
                          'p_data': {
                            'kind': selectedKind,
                            'title': title.text,
                            'grade_level': selectedGrade,
                            'learning_level': level,
                            'summary': summary.text,
                            'body': body,
                            'status': selectedStatus,
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
            child: Text(saving ? 'Saving…' : 'Save material'),
          ),
        ],
      ),
    ),
  );
  for (final c in [title, summary, english, filipino, content]) {
    c.dispose();
  }
}

String materialFormatHint(String kind) => switch (kind) {
  'quiz' =>
    'One question per line: Question | option 1 | option 2 | correct option number. Example: What means book? | aklat | tubig | 1',
  'story' =>
    'One page per line: English sentence | Filipino sentence | illustration. Illustrations: sun, tree, home, friends, book.',
  _ => 'One pair per line: English | Filipino. Example: book | aklat',
};
Json parseMaterialBody(String kind, String text) {
  final lines = text.split('\n').where((l) => l.trim().isNotEmpty).toList();
  if (lines.isEmpty) throw const FormatException('Add some learning content.');
  if (kind == 'quiz') {
    return {
      'questions': lines.map((line) {
        final parts = line.split('|').map((p) => p.trim()).toList();
        if (parts.length < 4) {
          throw const FormatException(
            'Each quiz line needs a question, at least two options, and the correct option number.',
          );
        }
        final correct = int.tryParse(parts.last);
        final choices = parts.sublist(1, parts.length - 1);
        if (correct == null ||
            correct < 1 ||
            correct > choices.length ||
            choices.length > 4) {
          throw const FormatException(
            'Choose a correct option number from the available 2 to 4 options.',
          );
        }
        final options = choices
            .map((value) => {'id': const Uuid().v4(), 'text': value})
            .toList();
        return {
          'id': const Uuid().v4(),
          'prompt': parts.first,
          'options': options,
          'correct_option_id': options[correct - 1]['id'],
        };
      }).toList(),
    };
  }
  if (kind == 'story') {
    return {
      'pages': lines.map((line) {
        final p = line.split('|').map((v) => v.trim()).toList();
        if (p.length < 2) {
          throw const FormatException(
            'Each story page needs English and Filipino text.',
          );
        }
        return {
          'english': p[0],
          'filipino': p[1],
          'illustration': p.length > 2 ? p[2] : 'book',
        };
      }).toList(),
    };
  }
  return {
    'pairs': lines.map((line) {
      final p = line.split('|').map((v) => v.trim()).toList();
      if (p.length != 2 || p.any((s) => s.isEmpty)) {
        throw const FormatException(
          'Use English | Filipino for each word pair.',
        );
      }
      return {'en': p[0], 'fil': p[1]};
    }).toList(),
  };
}

String formatMaterialBody(String kind, Json body) {
  if (kind == 'quiz') {
    return jsonRows(body['questions'])
        .map((q) {
          final options = jsonRows(q['options']);
          final correct =
              options.indexWhere((o) => o['id'] == q['correct_option_id']) + 1;
          return '${q['prompt']} | ${options.map((o) => o['text']).join(' | ')} | ${correct < 1 ? 1 : correct}';
        })
        .join('\n');
  }
  if (kind == 'story') {
    return jsonRows(body['pages'])
        .map(
          (p) =>
              '${p['english']} | ${p['filipino']} | ${p['illustration'] ?? 'book'}',
        )
        .join('\n');
  }
  return jsonRows(
    body['pairs'],
  ).map((p) => '${p['en']} | ${p['fil']}').join('\n');
}

Future<void> editRecord(
  BuildContext context,
  WidgetRef ref, {
  required String kind,
  Json? initial,
  required List<Json> materials,
  required List<Json> records,
}) async {
  final data = Map<String, dynamic>.from(initial?['data'] as Map? ?? {});
  final form = GlobalKey<FormState>();
  final title = TextEditingController(text: initial?['title'] as String?);
  final details = TextEditingController(text: data['details'] as String?);
  final source = TextEditingController(text: data['source_url'] as String?);
  final license = TextEditingController(text: data['license'] as String?);
  final pairs = TextEditingController(
    text: formatMaterialBody('dictionary', {'pairs': data['pairs']}),
  );
  var state = initial?['status'] as String? ?? 'draft';
  String? selectedDataset = data['dataset_id'] as String?;
  final selectedMaterials = (data['material_ids'] as List? ?? [])
      .cast<String>()
      .toSet();
  String? error;
  bool saving = false;
  await showDialog<void>(
    context: context,
    builder: (dialog) => StatefulBuilder(
      builder: (dialog, setDialog) => AlertDialog(
        title: Text(recordSpecs[kind]![2]),
        content: SizedBox(
          width: 620,
          child: SingleChildScrollView(
            child: Form(
              key: form,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  TextFormField(
                    controller: title,
                    decoration: InputDecoration(
                      labelText: kind == 'session'
                          ? 'Class label / session title'
                          : 'Title',
                    ),
                    validator: (v) =>
                        v == null || v.trim().isEmpty ? 'Enter a title.' : null,
                  ),
                  const SizedBox(height: 12),
                  if (kind == 'curriculum' || kind == 'dataset') ...[
                    TextFormField(
                      controller: source,
                      decoration: const InputDecoration(
                        labelText: 'Source URL or provenance',
                      ),
                      validator: (v) => v == null || v.trim().isEmpty
                          ? 'Record the real source.'
                          : null,
                    ),
                    const SizedBox(height: 12),
                  ],
                  if (kind == 'dataset') ...[
                    TextFormField(
                      controller: license,
                      decoration: const InputDecoration(
                        labelText: 'License / permission to use',
                      ),
                      validator: (v) => v == null || v.trim().isEmpty
                          ? 'Record usage rights.'
                          : null,
                    ),
                    const SizedBox(height: 12),
                    const Text('One English | Filipino pair per line.'),
                    TextFormField(
                      controller: pairs,
                      minLines: 5,
                      maxLines: 10,
                      decoration: const InputDecoration(
                        labelText: 'Parallel text pairs',
                      ),
                    ),
                    const SizedBox(height: 12),
                  ],
                  if (kind == 'training') ...[
                    DropdownButtonFormField<String>(
                      initialValue: selectedDataset,
                      decoration: const InputDecoration(
                        labelText: 'Approved dataset',
                      ),
                      items: records
                          .where(
                            (r) =>
                                r['kind'] == 'dataset' &&
                                r['status'] == 'published',
                          )
                          .map(
                            (r) => DropdownMenuItem(
                              value: r['id'] as String,
                              child: Text('${r['title']}'),
                            ),
                          )
                          .toList(),
                      onChanged: (v) => selectedDataset = v,
                      validator: (v) =>
                          v == null ? 'Select an approved dataset.' : null,
                    ),
                    const SizedBox(height: 12),
                  ],
                  if (kind == 'plan' || kind == 'session') ...[
                    const Text('Materials for this sequence'),
                    ...materials
                        .where((m) => m['status'] != 'archived')
                        .take(30)
                        .map(
                          (m) => CheckboxListTile(
                            value: selectedMaterials.contains(m['id']),
                            title: Text(
                              '${m['title']} · Grade ${m['grade_level']}',
                            ),
                            onChanged: (value) => setDialog(() {
                              if (value == true) {
                                selectedMaterials.add(m['id'] as String);
                              } else {
                                selectedMaterials.remove(m['id']);
                              }
                            }),
                          ),
                        ),
                    const SizedBox(height: 12),
                  ],
                  TextFormField(
                    controller: details,
                    minLines: 4,
                    maxLines: 9,
                    decoration: InputDecoration(
                      labelText: switch (kind) {
                        'plan' =>
                          'Learning objectives, sequence, and reflection',
                        'session' => 'Participation and teaching reflection',
                        'curriculum' =>
                          'Publisher, verification notes, and relevant pages',
                        'announcement' => 'Announcement message',
                        _ => 'Review notes',
                      },
                    ),
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    initialValue: state,
                    decoration: const InputDecoration(labelText: 'Status'),
                    items: ['draft', 'published', 'archived']
                        .map(
                          (s) => DropdownMenuItem(
                            value: s,
                            child: Text(
                              s == 'published'
                                  ? (kind == 'dataset'
                                        ? 'Approved for training'
                                        : kind == 'plan' || kind == 'session'
                                        ? 'Saved / ready'
                                        : 'Published')
                                  : s,
                            ),
                          ),
                        )
                        .toList(),
                    onChanged: (v) => state = v!,
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
                      final content = <String, dynamic>{
                        'details': details.text,
                      };
                      if (source.text.isNotEmpty) {
                        content['source_url'] = source.text;
                      }
                      if (kind == 'dataset') {
                        content['pairs'] = parseMaterialBody(
                          'dictionary',
                          pairs.text,
                        )['pairs'];
                        content['license'] = license.text;
                      }
                      if (kind == 'plan' || kind == 'session') {
                        content['material_ids'] = selectedMaterials.toList();
                      }
                      if (kind == 'training') {
                        final dataset = records.firstWhere(
                          (r) => r['id'] == selectedDataset,
                        );
                        content.addAll({
                          'dataset_id': selectedDataset,
                          'dataset_title': dataset['title'],
                          'dataset': dataset['data'],
                          'instructions':
                              'Prepare leakage-safe bidirectional splits, train, evaluate both directions, and review results before model registration.',
                        });
                      }
                      await ref.read(learningRepositoryProvider).call(
                        'save_workspace_record',
                        {
                          'p_id': initial?['id'],
                          'p_data': {
                            'kind': kind,
                            'title': title.text,
                            'data': content,
                            'status': state,
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
            child: Text(saving ? 'Saving…' : 'Save record'),
          ),
        ],
      ),
    ),
  );
  for (final c in [title, details, source, license, pairs]) {
    c.dispose();
  }
}

String datasetCsv(Json data) {
  String cell(dynamic value) => '"${('$value').replaceAll('"', '""')}"';
  return [
    'english,filipino,source,license',
    ...jsonRows(data['pairs']).map(
      (p) => [
        p['en'],
        p['fil'],
        data['source_url'] ?? '',
        data['license'] ?? '',
      ].map(cell).join(','),
    ),
  ].join('\n');
}

class AdultSettingsPage extends ConsumerWidget {
  const AdultSettingsPage({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) => ref
      .watch(adultPreferencesProvider)
      .when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text(friendlyError(e))),
        data: (prefs) => ListView(
          padding: const EdgeInsets.all(28),
          children: [
            const WorkspaceHeading(
              title: 'Workspace Preferences',
              description:
                  'Save your preferred language, text size, sound, and motion settings on your adult account.',
            ),
            const SizedBox(height: 20),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  children: [
                    DropdownButtonFormField<String>(
                      initialValue: prefs['locale'] as String? ?? 'en',
                      decoration: const InputDecoration(
                        labelText: 'Preferred language',
                      ),
                      items: const [
                        DropdownMenuItem(value: 'en', child: Text('English')),
                        DropdownMenuItem(value: 'fil', child: Text('Filipino')),
                      ],
                      onChanged: (v) => _save(context, ref, {'locale': v}),
                    ),
                    SwitchListTile(
                      title: const Text('Sound and pronunciation'),
                      value: prefs['muted'] != true,
                      onChanged: (v) => _save(context, ref, {'muted': !v}),
                    ),
                    SwitchListTile(
                      title: const Text('Reduce motion'),
                      value: prefs['reduced_motion'] == true,
                      onChanged: (v) =>
                          _save(context, ref, {'reduced_motion': v}),
                    ),
                    const ListTile(title: Text('Text size')),
                    Slider(
                      value: ((prefs['text_scale'] as num? ?? 1).toDouble())
                          .clamp(.8, 2),
                      min: .8,
                      max: 2,
                      divisions: 6,
                      label: '${prefs['text_scale'] ?? 1}×',
                      onChanged: (v) => _save(context, ref, {'text_scale': v}),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 18),
            const StudentPermissionCard(),
          ],
        ),
      );
  Future<void> _save(BuildContext context, WidgetRef ref, Json data) async {
    try {
      await ref.read(learningRepositoryProvider).savePreferences(data);
      ref.invalidate(adultPreferencesProvider);
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(friendlyError(e))));
      }
    }
  }
}
