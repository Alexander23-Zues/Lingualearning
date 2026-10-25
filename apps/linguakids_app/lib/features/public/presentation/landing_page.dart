import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_theme.dart';
import '../../auth/presentation/auth_controller.dart';
import '../../auth/presentation/auth_pages.dart';

class LandingPage extends ConsumerWidget {
  const LandingPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final wide = MediaQuery.sizeOf(context).width >= 850;
    void goAccount(String path) {
      if (ref.read(previewModeProvider)) {
        openAccountPage(context, path.substring(1));
      } else {
        context.go(path);
      }
    }

    return Scaffold(
      backgroundColor: const Color(0xFFFFFCF5),
      body: SelectionArea(
        child: CustomScrollView(
          slivers: [
            SliverAppBar(
              pinned: true,
              backgroundColor: const Color(0xFFFFFCF5).withValues(alpha: .94),
              title: const _Brand(),
              actions: [
                if (wide) ...[
                  TextButton(
                    onPressed: () => goAccount('/login'),
                    child: const Text('Log in'),
                  ),
                  const SizedBox(width: 8),
                  Padding(
                    padding: const EdgeInsets.only(right: 20),
                    child: FilledButton(
                      onPressed: () => goAccount('/register'),
                      child: const Text('Educator registration'),
                    ),
                  ),
                ] else
                  PopupMenuButton<String>(
                    tooltip: 'Account options',
                    icon: const Icon(Icons.menu_rounded),
                    onSelected: goAccount,
                    itemBuilder: (_) => const [
                      PopupMenuItem(value: '/login', child: Text('Log in')),
                      PopupMenuItem(
                        value: '/register',
                        child: Text('Educator registration'),
                      ),
                    ],
                  ),
              ],
            ),
            SliverToBoxAdapter(
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 1200),
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(24, 64, 24, 32),
                    child: Flex(
                      direction: wide ? Axis.horizontal : Axis.vertical,
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        Expanded(
                          flex: wide ? 6 : 0,
                          child: Column(
                            crossAxisAlignment: wide
                                ? CrossAxisAlignment.start
                                : CrossAxisAlignment.center,
                            children: [
                              const _Pill('FOR GRADES 1–6 EDUCATORS'),
                              const SizedBox(height: 20),
                              Text(
                                'Bring every word\nto life.',
                                textAlign: wide
                                    ? TextAlign.left
                                    : TextAlign.center,
                                style: Theme.of(context).textTheme.displayLarge
                                    ?.copyWith(
                                      fontSize: wide ? 68 : 48,
                                      color: AppTheme.navy,
                                    ),
                              ),
                              const SizedBox(height: 20),
                              Text(
                                'A bilingual teaching workspace for English–Filipino lessons, '
                                'stories, classroom games, quizzes, and educator-reviewed translation.',
                                textAlign: wide
                                    ? TextAlign.left
                                    : TextAlign.center,
                                style: Theme.of(context).textTheme.titleLarge
                                    ?.copyWith(
                                      color: const Color(0xFF52677A),
                                      fontWeight: FontWeight.w500,
                                      height: 1.5,
                                    ),
                              ),
                            ],
                          ),
                        ),
                        SizedBox(width: wide ? 48 : 0, height: wide ? 0 : 40),
                        if (wide)
                          const Expanded(flex: 5, child: _HeroVisual())
                        else
                          const _HeroVisual(),
                      ],
                    ),
                  ),
                ),
              ),
            ),
            SliverToBoxAdapter(
              child: Container(
                color: Colors.white,
                padding: const EdgeInsets.symmetric(
                  horizontal: 24,
                  vertical: 72,
                ),
                child: Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 1120),
                    child: Column(
                      children: [
                        Text(
                          'One workspace. Six grade levels.',
                          style: Theme.of(context).textTheme.headlineMedium,
                        ),
                        const SizedBox(height: 12),
                        const Text(
                          'Select verified curriculum references, prepare materials, teach in a '
                          'privacy-safe presentation mode, and record class-level reflections.',
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 32),
                        const Wrap(
                          spacing: 16,
                          runSpacing: 16,
                          children: [
                            _Feature(
                              icon: Icons.menu_book_rounded,
                              title: 'Lessons & stories',
                              body:
                                  'Bilingual, age-appropriate resources with guided practice.',
                            ),
                            _Feature(
                              icon: Icons.extension_rounded,
                              title: 'Games & quizzes',
                              body:
                                  'Supervised activities using published or educator-owned content.',
                            ),
                            _Feature(
                              icon: Icons.translate_rounded,
                              title: 'Reviewed translation',
                              body:
                                  'A separately deployed model with honest availability states.',
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
            const SliverToBoxAdapter(child: _Footer()),
          ],
        ),
      ),
    );
  }
}

class _Brand extends StatelessWidget {
  const _Brand();
  @override
  Widget build(BuildContext context) => const Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      CircleAvatar(
        backgroundColor: AppTheme.sun,
        child: Text(
          'L',
          style: TextStyle(fontWeight: FontWeight.w900, color: AppTheme.navy),
        ),
      ),
      SizedBox(width: 10),
      Text(
        'LinguaKids',
        style: TextStyle(fontWeight: FontWeight.w900, color: AppTheme.navy),
      ),
    ],
  );
}

class _Pill extends StatelessWidget {
  const _Pill(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(
      color: const Color(0xFFE2F6F4),
      borderRadius: BorderRadius.circular(40),
    ),
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
      child: Text(
        text,
        style: const TextStyle(
          color: AppTheme.teal,
          fontWeight: FontWeight.w800,
        ),
      ),
    ),
  );
}

class _HeroVisual extends StatelessWidget {
  const _HeroVisual();
  @override
  Widget build(BuildContext context) => AspectRatio(
    aspectRatio: 1.1,
    child: DecoratedBox(
      decoration: BoxDecoration(
        color: const Color(0xFFE9F7F6),
        borderRadius: BorderRadius.circular(40),
      ),
      child: Stack(
        children: [
          const Center(
            child: Icon(
              Icons.auto_stories_rounded,
              size: 170,
              color: AppTheme.teal,
            ),
          ),
          Positioned(
            top: 28,
            left: 28,
            child: _bubble('Hello!', AppTheme.coral),
          ),
          Positioned(
            bottom: 34,
            right: 28,
            child: _bubble('Kumusta!', AppTheme.navy),
          ),
          const Positioned(
            right: 36,
            top: 42,
            child: Icon(Icons.star_rounded, color: AppTheme.sun, size: 54),
          ),
        ],
      ),
    ),
  );

  Widget _bubble(String text, Color color) => DecoratedBox(
    decoration: BoxDecoration(
      color: color,
      borderRadius: BorderRadius.circular(20),
    ),
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
      child: Text(
        text,
        style: const TextStyle(
          color: Colors.white,
          fontSize: 20,
          fontWeight: FontWeight.w800,
        ),
      ),
    ),
  );
}

class _Feature extends StatelessWidget {
  const _Feature({required this.icon, required this.title, required this.body});
  final IconData icon;
  final String title;
  final String body;
  @override
  Widget build(BuildContext context) => SizedBox(
    width: 340,
    child: Card(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: AppTheme.coral, size: 34),
            const SizedBox(height: 16),
            Text(title, style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            Text(body),
          ],
        ),
      ),
    ),
  );
}

class _Footer extends StatelessWidget {
  const _Footer();
  @override
  Widget build(BuildContext context) => Container(
    color: AppTheme.navy,
    padding: const EdgeInsets.all(32),
    child: const Wrap(
      alignment: WrapAlignment.spaceBetween,
      spacing: 24,
      runSpacing: 12,
      children: [
        Text(
          'LinguaKids • Educator-led language learning',
          style: TextStyle(color: Colors.white),
        ),
        Text(
          'About  •  Contact  •  Privacy',
          style: TextStyle(color: Color(0xFFCFDCE8)),
        ),
      ],
    ),
  );
}
