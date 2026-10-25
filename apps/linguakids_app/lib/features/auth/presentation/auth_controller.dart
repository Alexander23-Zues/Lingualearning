import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../data/auth_repository.dart';
import '../domain/app_user.dart';

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  return SupabaseAuthRepository(Supabase.instance.client);
});

final previewModeProvider = Provider<bool>((ref) => false);

final passwordRecoveryProvider = StreamProvider<bool>((ref) {
  return ref.watch(authRepositoryProvider).watchPasswordRecovery();
});

final authControllerProvider = AsyncNotifierProvider<AuthController, AppUser?>(
  AuthController.new,
);

class AuthController extends AsyncNotifier<AppUser?> {
  StreamSubscription<AppUser?>? _subscription;

  AuthRepository get _repository => ref.read(authRepositoryProvider);

  @override
  Future<AppUser?> build() async {
    ref.onDispose(() => _subscription?.cancel());
    _subscription = _repository.watchUser().listen(
      (user) => state = AsyncData(user),
      onError: (Object error, StackTrace stack) =>
          state = AsyncError(error, stack),
    );
    return _repository.currentUser();
  }

  Future<void> signIn(String email, String password) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      await _repository.signIn(email: email, password: password);
      return _repository.currentUser();
    });
  }

  Future<void> register({
    required String name,
    required String email,
    required String password,
    String? schoolName,
    required List<int> gradeLevels,
  }) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      await _repository.registerEducator(
        name: name,
        email: email,
        password: password,
        schoolName: schoolName,
        gradeLevels: gradeLevels,
      );
      return _repository.currentUser();
    });
  }

  Future<void> signOut() => _repository.signOut();
}
