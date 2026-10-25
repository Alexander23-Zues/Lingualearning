import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/routing/app_router.dart';
import 'core/theme/app_theme.dart';
import 'l10n/app_localizations.dart';
import 'features/learning/learning_data.dart';
import 'features/learning/workspace_pages.dart';
import 'features/auth/presentation/auth_controller.dart';

class LinguaKidsApp extends ConsumerWidget {
  const LinguaKidsApp({this.previewControls, super.key});

  final Widget? previewControls;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(appRouterProvider);
    final locked = ref.watch(adultLockProvider);
    final user = ref.watch(authControllerProvider).value;
    final prefs = user == null
        ? <String, dynamic>{}
        : ref.watch(adultPreferencesProvider).asData?.value ??
              <String, dynamic>{};
    return MaterialApp.router(
      title: 'LinguaKids',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      locale: Locale(prefs['locale'] as String? ?? 'en'),
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context).copyWith(
          textScaler: TextScaler.linear(
            (prefs['text_scale'] as num? ?? 1).toDouble(),
          ),
          disableAnimations: prefs['reduced_motion'] == true,
        ),
        child: previewControls != null && !locked
            ? Column(
                children: [
                  previewControls!,
                  Expanded(child: child!),
                ],
              )
            : child!,
      ),
      routerConfig: router,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: const [Locale('en'), Locale('fil')],
    );
  }
}
