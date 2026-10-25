import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';
import 'features/auth/presentation/auth_controller.dart';
import 'features/workspace/presentation/feature_pages.dart';
import 'preview/preview_services.dart';
import 'preview/preview_controls.dart';
import 'features/audit/audit_repository.dart';
import 'features/learning/learning_data.dart';
import 'preview/demo_learning_repository.dart';

/// Local UI preview. This entry point never initializes Supabase.
void main() {
  WidgetsFlutterBinding.ensureInitialized();
  final demo = DemoLearningRepository();
  runApp(
    ProviderScope(
      overrides: [
        previewModeProvider.overrideWithValue(true),
        authRepositoryProvider.overrideWith((ref) {
          final repository = PreviewAuthRepository();
          ref.onDispose(repository.dispose);
          return repository;
        }),
        apiClientProvider.overrideWith((ref) => PreviewApiClient()),
        auditRepositoryProvider.overrideWith((ref) => PreviewAuditRepository()),
        learningRepositoryProvider.overrideWith((ref) => demo),
        studentRepositoryProvider.overrideWith((ref) => demo),
      ],
      child: const LinguaKidsApp(previewControls: PreviewControls()),
    ),
  );
}
