import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../auth/presentation/auth_controller.dart';
import '../../preview/preview_services.dart';

class PresentationModePage extends ConsumerStatefulWidget {
  const PresentationModePage({super.key});
  @override
  ConsumerState<PresentationModePage> createState() =>
      _PresentationModePageState();
}

class _PresentationModePageState extends ConsumerState<PresentationModePage> {
  int page = 0;
  bool muted = false;
  final slides = const [
    ('Hello!', 'Kumusta!', Icons.waving_hand_rounded),
    ('Thank you!', 'Salamat!', Icons.favorite_rounded),
    ('Let us learn together.', 'Sabay tayong matuto.', Icons.groups_rounded),
  ];

  Future<void> exit() async {
    if (ref.read(authRepositoryProvider) is PreviewAuthRepository) {
      context.go('/workspace/home');
      return;
    }
    final password = TextEditingController();
    final approved = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        title: const Text('Educator verification'),
        content: TextField(
          controller: password,
          obscureText: true,
          decoration: const InputDecoration(labelText: 'Password'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Stay in presentation'),
          ),
          FilledButton(
            onPressed: () async {
              try {
                await ref
                    .read(authRepositoryProvider)
                    .reauthenticate(password.text);
                if (context.mounted) Navigator.pop(context, true);
              } catch (_) {
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Verification failed. Try again.'),
                    ),
                  );
                }
              }
            },
            child: const Text('Exit'),
          ),
        ],
      ),
    );
    password.dispose();
    if (approved == true && mounted) context.go('/workspace/home');
  }

  @override
  Widget build(BuildContext context) {
    final slide = slides[page];
    return PopScope(
      canPop: false,
      child: Scaffold(
        backgroundColor: const Color(0xFFFFF8E8),
        body: SafeArea(
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  children: [
                    IconButton(
                      onPressed: () => setState(() => muted = !muted),
                      icon: Icon(
                        muted
                            ? Icons.volume_off_rounded
                            : Icons.volume_up_rounded,
                      ),
                      tooltip: muted ? 'Unmute' : 'Mute',
                    ),
                    const Spacer(),
                    Text(
                      'Page ${page + 1} of ${slides.length}',
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                    const Spacer(),
                    FilledButton.tonalIcon(
                      onPressed: exit,
                      icon: const Icon(Icons.lock_rounded),
                      label: const Text('Educator controls'),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: Center(
                  child: Padding(
                    padding: const EdgeInsets.all(28),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          slide.$3,
                          size: 150,
                          color: Theme.of(context).colorScheme.secondary,
                        ),
                        const SizedBox(height: 30),
                        Text(
                          slide.$1,
                          textAlign: TextAlign.center,
                          style: Theme.of(
                            context,
                          ).textTheme.displayLarge?.copyWith(fontSize: 64),
                        ),
                        const SizedBox(height: 14),
                        Text(
                          slide.$2,
                          textAlign: TextAlign.center,
                          style: Theme.of(
                            context,
                          ).textTheme.headlineMedium?.copyWith(fontSize: 42),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(24),
                child: Row(
                  children: [
                    Expanded(
                      child: FilledButton.tonalIcon(
                        onPressed: page == 0
                            ? null
                            : () => setState(() => page--),
                        icon: const Icon(Icons.arrow_back_rounded),
                        label: const Text('Previous'),
                      ),
                    ),
                    const SizedBox(width: 20),
                    Expanded(
                      child: FilledButton.icon(
                        onPressed: page == slides.length - 1
                            ? null
                            : () => setState(() => page++),
                        icon: const Icon(Icons.arrow_forward_rounded),
                        label: const Text('Next'),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
