import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../auth/domain/app_user.dart';
import '../../auth/presentation/auth_controller.dart';

class WorkspaceItem {
  const WorkspaceItem(this.slug, this.label, this.icon);
  final String slug;
  final String label;
  final IconData icon;
}

const administratorItems = [
  WorkspaceItem('overview', 'Overview', Icons.dashboard_rounded),
  WorkspaceItem('educators', 'Educator Management', Icons.group_rounded),
  WorkspaceItem(
    'curriculum',
    'Curriculum References',
    Icons.account_balance_rounded,
  ),
  WorkspaceItem('resources', 'Teaching Resources', Icons.library_books_rounded),
  WorkspaceItem('dictionary', 'Dictionary', Icons.spellcheck_rounded),
  WorkspaceItem('activities', 'Activities and Games', Icons.extension_rounded),
  WorkspaceItem('quizzes', 'Quizzes and Worksheets', Icons.quiz_rounded),
  WorkspaceItem('stories', 'Stories and Media', Icons.auto_stories_rounded),
  WorkspaceItem('datasets', 'Translation Datasets', Icons.table_chart_rounded),
  WorkspaceItem('training', 'Training Packages', Icons.model_training_rounded),
  WorkspaceItem('models', 'Model Registry', Icons.hub_rounded),
  WorkspaceItem('reports', 'Reports', Icons.insights_rounded),
  WorkspaceItem('announcements', 'Announcements', Icons.campaign_rounded),
  WorkspaceItem('settings', 'Settings', Icons.settings_rounded),
  WorkspaceItem('audit', 'Audit Logs', Icons.policy_rounded),
  WorkspaceItem('students', 'Child Profiles', Icons.emoji_people_rounded),
  WorkspaceItem(
    'student-submissions',
    'Student Submissions',
    Icons.fact_check_rounded,
  ),
];

const educatorItems = [
  WorkspaceItem('home', 'Home', Icons.home_rounded),
  WorkspaceItem('lessons', 'Curriculum and Lessons', Icons.menu_book_rounded),
  WorkspaceItem('plans', 'My Teaching Plans', Icons.event_note_rounded),
  WorkspaceItem('dictionary', 'Dictionary', Icons.spellcheck_rounded),
  WorkspaceItem('translator', 'Translator', Icons.translate_rounded),
  WorkspaceItem('activities', 'Activities and Games', Icons.extension_rounded),
  WorkspaceItem('stories', 'Stories', Icons.auto_stories_rounded),
  WorkspaceItem('quizzes', 'Quiz and Worksheet Builder', Icons.quiz_rounded),
  WorkspaceItem('sessions', 'Classroom Sessions', Icons.co_present_rounded),
  WorkspaceItem('students', 'Child Profiles', Icons.emoji_people_rounded),
  WorkspaceItem('resources', 'My Resources', Icons.folder_copy_rounded),
  WorkspaceItem('downloads', 'Downloads', Icons.download_for_offline_rounded),
  WorkspaceItem('reports', 'Reports', Icons.insights_rounded),
  WorkspaceItem('settings', 'Settings', Icons.settings_rounded),
];

class WorkspacePage extends ConsumerWidget {
  const WorkspacePage({required this.section, required this.child, super.key});
  final String section;
  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authControllerProvider).value;
    if (user == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    final items = user.role == AccountRole.administrator
        ? administratorItems
        : educatorItems;
    final wide = MediaQuery.sizeOf(context).width >= 900;
    final selectedIndex = items
        .indexWhere((item) => item.slug == section)
        .clamp(0, items.length - 1);

    void open(int index) => context.go('/workspace/${items[index].slug}');
    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: !wide,
        title: const Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircleAvatar(child: Text('L')),
            SizedBox(width: 10),
            Flexible(
              child: Text(
                'LinguaKids',
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontWeight: FontWeight.w800),
              ),
            ),
          ],
        ),
        actions: [
          if (user.role == AccountRole.educator &&
              MediaQuery.sizeOf(context).width < 650)
            IconButton(
              onPressed: () => context.go('/presentation'),
              icon: const Icon(Icons.fullscreen_rounded),
              tooltip: 'Presentation mode',
            )
          else if (user.role == AccountRole.educator)
            FilledButton.tonalIcon(
              onPressed: () => context.go('/presentation'),
              icon: const Icon(Icons.fullscreen_rounded),
              label: const Text('Present'),
            ),
          const SizedBox(width: 8),
          PopupMenuButton<String>(
            tooltip: 'Account menu',
            onSelected: (value) {
              if (value == 'logout') {
                ref.read(authControllerProvider.notifier).signOut();
              }
            },
            itemBuilder: (_) => [
              PopupMenuItem(
                enabled: false,
                child: Text('${user.name}\n${user.role.name}'),
              ),
              const PopupMenuItem(value: 'logout', child: Text('Log out')),
            ],
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: CircleAvatar(
                child: Text(
                  user.name.isEmpty ? '?' : user.name[0].toUpperCase(),
                ),
              ),
            ),
          ),
        ],
      ),
      drawer: wide
          ? null
          : NavigationDrawer(
              selectedIndex: selectedIndex,
              onDestinationSelected: (index) {
                Navigator.pop(context);
                open(index);
              },
              children: [
                const SizedBox(height: 16),
                ...items.map(
                  (item) => NavigationDrawerDestination(
                    icon: Icon(item.icon),
                    label: Text(item.label),
                  ),
                ),
              ],
            ),
      body: Row(
        children: [
          if (wide)
            NavigationRail(
              scrollable: true,
              extended: MediaQuery.sizeOf(context).width >= 1180,
              selectedIndex: selectedIndex,
              onDestinationSelected: open,
              destinations: items
                  .map(
                    (item) => NavigationRailDestination(
                      icon: Icon(item.icon),
                      label: Text(item.label),
                    ),
                  )
                  .toList(),
            ),
          Expanded(
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 320),
              switchInCurve: Curves.easeOutCubic,
              switchOutCurve: Curves.easeInCubic,
              transitionBuilder: (page, animation) => FadeTransition(
                opacity: animation,
                child: SlideTransition(
                  position: Tween(
                    begin: const Offset(.025, 0),
                    end: Offset.zero,
                  ).animate(animation),
                  child: page,
                ),
              ),
              child: KeyedSubtree(key: ValueKey(section), child: child),
            ),
          ),
        ],
      ),
    );
  }
}
