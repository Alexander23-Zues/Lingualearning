import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/config/app_config.dart';
import '../domain/app_user.dart';

abstract interface class AuthRepository {
  Stream<AppUser?> watchUser();
  Stream<bool> watchPasswordRecovery();
  Future<AppUser?> currentUser();
  Future<void> signIn({required String email, required String password});
  Future<void> registerEducator({
    required String name,
    required String email,
    required String password,
    String? schoolName,
    required List<int> gradeLevels,
  });
  Future<void> sendPasswordReset(String email);
  Future<void> resendConfirmation(String email);
  Future<void> updatePassword(String password);
  Future<void> signOut();
  Future<void> reauthenticate(String password);
}

class SupabaseAuthRepository implements AuthRepository {
  SupabaseAuthRepository(this._client, {this.recovering = false});

  final SupabaseClient _client;
  bool recovering;

  @override
  Stream<bool> watchPasswordRecovery() async* {
    yield recovering;
    await for (final event in _client.auth.onAuthStateChange) {
      if (event.event == AuthChangeEvent.passwordRecovery) recovering = true;
      if (event.event == AuthChangeEvent.signedOut) recovering = false;
      yield recovering;
    }
  }

  Future<AppUser?> _profileFor(User? authUser) async {
    if (authUser == null) return null;
    // The database claims only an owner-provisioned, verified email invitation.
    // Client metadata never controls the account's role.
    await _client.rpc('claim_initial_administrator');
    final json = await _client
        .from('profiles')
        .select('id,name,email,role,status,school_name,grade_levels')
        .eq('id', authUser.id)
        .single();
    return AppUser.fromJson(json);
  }

  @override
  Stream<AppUser?> watchUser() async* {
    await for (final event in _client.auth.onAuthStateChange) {
      try {
        yield await _profileFor(event.session?.user);
      } catch (_) {
        // A failed profile read must not permanently close the auth listener.
        // Explicit sign-in reports its error and can be retried.
        yield null;
      }
    }
  }

  @override
  Future<AppUser?> currentUser() => _profileFor(_client.auth.currentUser);

  @override
  Future<void> signIn({required String email, required String password}) async {
    await _client.auth.signInWithPassword(
      email: email.trim(),
      password: password,
    );
    try {
      final profile = await currentUser();
      if (profile == null) {
        throw const AuthException(
          'Your account profile is unavailable. Please try again.',
        );
      }
      if (profile.status == AccountStatus.suspended) {
        throw const AuthException('This educator account is suspended.');
      }
      await _client.rpc(
        'record_account_event',
        params: {'p_event': 'session_started'},
      );
    } catch (_) {
      await _client.auth.signOut();
      rethrow;
    }
  }

  @override
  Future<void> registerEducator({
    required String name,
    required String email,
    required String password,
    String? schoolName,
    required List<int> gradeLevels,
  }) async {
    await _client.auth.signUp(
      email: email.trim(),
      password: password,
      emailRedirectTo: AppConfig.authRedirectUrl.isEmpty
          ? null
          : AppConfig.authRedirectUrl,
      data: {
        'name': name.trim(),
        'school_name': schoolName?.trim(),
        'grade_levels': gradeLevels,
      },
    );
  }

  @override
  Future<void> sendPasswordReset(String email) =>
      _client.auth.resetPasswordForEmail(
        email.trim(),
        redirectTo: AppConfig.authRedirectUrl.isEmpty
            ? null
            : AppConfig.authRedirectUrl,
      );

  @override
  Future<void> resendConfirmation(String email) => _client.auth.resend(
    type: OtpType.signup,
    email: email.trim(),
    emailRedirectTo: AppConfig.authRedirectUrl.isEmpty
        ? null
        : AppConfig.authRedirectUrl,
  );

  @override
  Future<void> updatePassword(String password) =>
      _client.auth.updateUser(UserAttributes(password: password));

  @override
  Future<void> signOut() async {
    try {
      if (_client.auth.currentSession != null) {
        await _client.rpc(
          'record_account_event',
          params: {'p_event': 'session_ended'},
        );
      }
    } finally {
      await _client.auth.signOut();
    }
  }

  @override
  Future<void> reauthenticate(String password) async {
    final email = _client.auth.currentUser?.email;
    if (email == null) throw const AuthException('No active educator session.');
    await _client.auth.signInWithPassword(email: email, password: password);
  }
}
