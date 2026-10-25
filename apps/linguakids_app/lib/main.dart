import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'app.dart';
import 'core/config/app_config.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'features/learning/learning_data.dart';
import 'features/auth/data/auth_repository.dart';
import 'features/auth/presentation/auth_controller.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  if (!AppConfig.hasSupabase) {
    runApp(const _ConfigurationErrorApp());
    return;
  }
  bool recovering = false;
  StreamSubscription<AuthState>? startupAuth;
  await Supabase.initialize(
    url: AppConfig.supabaseUrl,
    publishableKey: AppConfig.supabasePublishableKey,
    authOptions: FlutterAuthClientOptions(
      detectSessionInUriPredicate: (uri) {
        // Capture recovery before initialization finishes exchanging the link.
        // PKCE recovery links carry a code, not necessarily type=recovery.
        startupAuth ??= Supabase.instance.client.auth.onAuthStateChange.listen((
          state,
        ) {
          if (state.event == AuthChangeEvent.passwordRecovery) {
            recovering = true;
          }
        }, onError: (Object _) {});
        final fragment = Uri.splitQueryString(uri.fragment);
        return ['access_token', 'code', 'error'].any(
          (key) =>
              uri.queryParameters.containsKey(key) || fragment.containsKey(key),
        );
      },
    ),
  );
  await startupAuth?.cancel();
  final locked =
      (await SharedPreferences.getInstance()).getBool(
        'linguakids.adult_locked',
      ) ??
      false;
  runApp(
    ProviderScope(
      overrides: [
        authRepositoryProvider.overrideWith(
          (ref) => SupabaseAuthRepository(
            Supabase.instance.client,
            recovering: recovering,
          ),
        ),
        adultLockProvider.overrideWith(
          () => AdultLockController(initial: locked),
        ),
      ],
      child: const LinguaKidsApp(),
    ),
  );
}

class _ConfigurationErrorApp extends StatelessWidget {
  const _ConfigurationErrorApp();

  @override
  Widget build(BuildContext context) => MaterialApp(
    home: Scaffold(
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 520),
          child: const Padding(
            padding: EdgeInsets.all(32),
            child: Text(
              'LinguaKids needs SUPABASE_URL and '
              'SUPABASE_PUBLISHABLE_KEY supplied with --dart-define.',
              textAlign: TextAlign.center,
            ),
          ),
        ),
      ),
    ),
  );
}
