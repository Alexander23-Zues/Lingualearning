import 'dart:async';

import '../core/network/api_client.dart';
import '../features/auth/data/auth_repository.dart';
import '../features/auth/domain/app_user.dart';

const previewMessage =
    'This is a local preview. Connect Supabase and the API to use accounts, '
    'save records, or translate with an approved model.';

class PreviewAuthRepository implements AuthRepository {
  @override
  Stream<bool> watchPasswordRecovery() => Stream.value(false);

  @override
  Future<void> resendConfirmation(String email) async =>
      throw const ApiException(previewMessage);
  final _changes = StreamController<AppUser?>.broadcast(sync: true);
  AppUser? _user;

  void showRole(AccountRole? role) {
    _user = role == null
        ? null
        : AppUser(
            id: 'preview-${role.name}',
            name: role == AccountRole.educator
                ? 'Preview Educator'
                : 'Preview Administrator',
            email: 'preview@example.invalid',
            role: role,
            status: AccountStatus.active,
            gradeLevels: const [1, 2, 3, 4, 5, 6],
          );
    _changes.add(_user);
  }

  void dispose() => _changes.close();

  @override
  Future<AppUser?> currentUser() async => _user;

  @override
  Stream<AppUser?> watchUser() => _changes.stream;

  @override
  Future<void> signOut() async => showRole(null);

  @override
  Future<void> signIn({
    required String email,
    required String password,
  }) async => throw const ApiException(previewMessage);

  @override
  Future<void> registerEducator({
    required String name,
    required String email,
    required String password,
    String? schoolName,
    required List<int> gradeLevels,
  }) async => throw const ApiException(previewMessage);

  @override
  Future<void> sendPasswordReset(String email) async =>
      throw const ApiException(previewMessage);

  @override
  Future<void> updatePassword(String password) async =>
      throw const ApiException(previewMessage);

  @override
  Future<void> reauthenticate(String password) async =>
      throw const ApiException(previewMessage);
}

class PreviewApiClient extends ApiClient {
  @override
  Future<dynamic> get(
    String path, {
    Map<String, String> headers = const {},
  }) async => throw const ApiException(previewMessage);

  @override
  Future<dynamic> post(
    String path,
    Map<String, dynamic> body, {
    Map<String, String> headers = const {},
  }) async => throw const ApiException(previewMessage);
}
