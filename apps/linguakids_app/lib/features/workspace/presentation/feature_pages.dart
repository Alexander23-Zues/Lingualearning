import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../../core/audio/pronunciation_service.dart';
import '../../audit/audit_log_page.dart';
import '../../learning/workspace_pages.dart';
import '../../learning/learning_data.dart';

final apiClientProvider = Provider<ApiClient>((ref) => ApiClient());

class FeaturePage extends ConsumerWidget {
  const FeaturePage({required this.section, super.key});
  final String section;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (section == 'audit') return const AuditLogPage();
    if (section == 'translator') {
      return Column(
        children: [
          if (ref
                  .watch(workspaceSnapshotProvider)
                  .asData
                  ?.value['active_model'] ==
              null)
            const Notice(
              'No trained translation model is active yet. Translation requires an approved model and a connection.',
            ),
          const Expanded(child: TranslatorPage()),
        ],
      );
    }
    return LearningWorkspace(section: section);
  }
}

class TranslatorPage extends ConsumerStatefulWidget {
  const TranslatorPage({super.key});
  @override
  ConsumerState<TranslatorPage> createState() => _TranslatorPageState();
}

class _TranslatorPageState extends ConsumerState<TranslatorPage> {
  final input = TextEditingController();
  String source = 'en';
  String result = '';
  bool loading = false;
  final pronunciation = PronunciationService();

  @override
  void dispose() {
    pronunciation.stop();
    input.dispose();
    super.dispose();
  }

  Future<void> translate() async {
    if (input.text.trim().isEmpty) return;
    setState(() => loading = true);
    try {
      final response =
          await ref.read(apiClientProvider).post('/v1/translation', {
                'text': input.text.trim(),
                'source_language': source,
                'target_language': source == 'en' ? 'fil' : 'en',
              })
              as Map<String, dynamic>;
      setState(() => result = response['translation'] as String);
    } on ApiException catch (error) {
      setState(() => result = error.message);
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> listen({bool slow = false}) async {
    try {
      await pronunciation.speak(
        text: result,
        language: source == 'en' ? 'fil' : 'en',
        slow: slow,
      );
    } on PronunciationUnavailable catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(error.message)));
      }
    }
  }

  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.all(28),
    children: [
      Text('Translator', style: Theme.of(context).textTheme.headlineMedium),
      const SizedBox(height: 6),
      const Text(
        'Review every machine translation before using it as teaching material. Translation requires a connection.',
      ),
      const SizedBox(height: 24),
      Card(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      source == 'en' ? 'English' : 'Filipino',
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                  ),
                  IconButton(
                    tooltip: 'Swap languages',
                    onPressed: () =>
                        setState(() => source = source == 'en' ? 'fil' : 'en'),
                    icon: const Icon(Icons.swap_horiz_rounded),
                  ),
                  Expanded(
                    child: Text(
                      source == 'en' ? 'Filipino' : 'English',
                      textAlign: TextAlign.right,
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              TextField(
                controller: input,
                maxLength: 300,
                minLines: 5,
                maxLines: 8,
                decoration: const InputDecoration(
                  hintText: 'Enter a short sentence…',
                ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  TextButton(
                    onPressed: () => setState(() {
                      input.clear();
                      result = '';
                    }),
                    child: const Text('Clear'),
                  ),
                  const Spacer(),
                  FilledButton.icon(
                    onPressed: loading ? null : translate,
                    icon: loading
                        ? const SizedBox.square(
                            dimension: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.translate_rounded),
                    label: const Text('Translate'),
                  ),
                ],
              ),
              if (result.isNotEmpty) ...[
                const Divider(height: 36),
                Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    result,
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                ),
                const SizedBox(height: 12),
                const Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    'Educator review required before classroom use.',
                    style: TextStyle(fontWeight: FontWeight.w700),
                  ),
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  children: [
                    TextButton.icon(
                      onPressed: () async {
                        await Clipboard.setData(ClipboardData(text: result));
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text('Translation copied.'),
                            ),
                          );
                        }
                      },
                      icon: const Icon(Icons.copy_rounded),
                      label: const Text('Copy'),
                    ),
                    TextButton.icon(
                      onPressed: listen,
                      icon: const Icon(Icons.volume_up_rounded),
                      label: const Text('Listen'),
                    ),
                    TextButton.icon(
                      onPressed: () => listen(slow: true),
                      icon: const Icon(Icons.slow_motion_video_rounded),
                      label: const Text('Slower'),
                    ),
                    TextButton.icon(
                      onPressed: pronunciation.stop,
                      icon: const Icon(Icons.stop_rounded),
                      label: const Text('Stop'),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    ],
  );
}
