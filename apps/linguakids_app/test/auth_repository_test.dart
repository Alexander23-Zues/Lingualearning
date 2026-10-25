import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:linguakids_app/features/auth/data/auth_repository.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  const id = '00000000-0000-4000-8000-000000000001';
  final user = {
    'id': id,
    'aud': 'authenticated',
    'email': 'adult@example.test',
    'created_at': '2026-01-01T00:00:00Z',
    'app_metadata': {},
    'user_metadata': {},
  };
  SupabaseClient clientFor(
    Future<http.Response> Function(http.Request) handler,
  ) {
    final client = SupabaseClient(
      'https://example.supabase.co',
      'public-test-key',
      authOptions: AuthClientOptions(
        autoRefreshToken: false,
        pkceAsyncStorage: SharedPreferencesGotrueAsyncStorage(),
      ),
      httpClient: MockClient(handler),
    );
    addTearDown(client.dispose);
    return client;
  }

  test(
    'registration sends trimmed adult metadata and never requests an admin role',
    () async {
      late Map body;
      final client = clientFor((request) async {
        expect(request.url.path, '/auth/v1/signup');
        body = jsonDecode(request.body) as Map;
        return http.Response(
          jsonEncode(user),
          200,
          headers: {'content-type': 'application/json'},
        );
      });
      await SupabaseAuthRepository(client).registerEducator(
        name: ' Teacher ',
        email: ' adult@example.test ',
        password: 'new-password',
        schoolName: ' School ',
        gradeLevels: [2, 3],
      );
      expect(body['email'], 'adult@example.test');
      expect(body['data'], {
        'name': 'Teacher',
        'school_name': 'School',
        'grade_levels': [2, 3],
      });
      expect(client.auth.currentSession, isNull);
    },
  );
  test(
    'recovery and resend use supported auth endpoints without appending a hash-incompatible path',
    () async {
      final requests = <http.Request>[];
      final client = clientFor((request) async {
        requests.add(request);
        return http.Response(
          '{}',
          200,
          headers: {'content-type': 'application/json'},
        );
      });
      final repo = SupabaseAuthRepository(client);
      await repo.sendPasswordReset(' adult@example.test ');
      await repo.resendConfirmation(' adult@example.test ');
      expect(requests.map((r) => r.url.path), [
        '/auth/v1/recover',
        '/auth/v1/resend',
      ]);
      for (final request in requests) {
        expect(
          (jsonDecode(request.body) as Map)['email'],
          'adult@example.test',
        );
        expect(request.url.toString().contains('/reset-password'), isFalse);
      }
      expect((jsonDecode(requests.last.body) as Map)['type'], 'signup');
    },
  );
  test(
    'SDK login loads the scoped profile and records a session audit event',
    () async {
      final events = <String>[];
      final client = clientFor((request) async {
        final path = request.url.path;
        Object? response;
        if (path == '/auth/v1/token') {
          response = {
            'access_token':
                '${base64UrlEncode(utf8.encode('{"alg":"HS256","typ":"JWT"}')).replaceAll('=', '')}.${base64UrlEncode(utf8.encode(jsonEncode({'sub': id, 'role': 'authenticated', 'exp': DateTime.now().millisecondsSinceEpoch ~/ 1000 + 3600}))).replaceAll('=', '')}.test-signature',
            'refresh_token': 'test-refresh-token',
            'token_type': 'bearer',
            'expires_in': 3600,
            'user': user,
          };
        } else if (path == '/rest/v1/profiles') {
          response = {
            'id': id,
            'name': 'Teacher',
            'email': 'adult@example.test',
            'role': 'educator',
            'status': 'active',
            'grade_levels': [1, 2],
          };
        } else if (path == '/rest/v1/rpc/record_account_event') {
          events.add((jsonDecode(request.body) as Map)['p_event'] as String);
        } else if (path == '/auth/v1/logout') {
          response = {};
        } else {
          expect(path, '/rest/v1/rpc/claim_initial_administrator');
        }
        return http.Response(
          jsonEncode(response),
          200,
          request: request,
          headers: {'content-type': 'application/json'},
        );
      });
      final repo = SupabaseAuthRepository(client);
      await repo.signIn(email: 'adult@example.test', password: 'new-password');
      expect((await repo.currentUser())!.email, 'adult@example.test');
      expect(events, ['session_started']);
    },
  );
}
