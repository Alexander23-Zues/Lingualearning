import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:linguakids_app/features/audit/audit_log_page.dart';
import 'package:linguakids_app/features/audit/audit_repository.dart';
import 'package:linguakids_app/features/auth/presentation/admin_setup_page.dart';
import 'package:linguakids_app/features/auth/presentation/auth_controller.dart';
import 'package:linguakids_app/preview/preview_services.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class TestAuditRepository implements AuditRepository {
  @override
  bool get isPreview => false;
  @override
  Future<List<AuditEntry>> load() async => [
    AuditEntry(
      id: '1',
      action: 'initial_administrator_created',
      entityType: 'profile',
      occurredAt: DateTime.utc(2026, 10, 25),
      actorName: 'Test Admin',
      actorEmail: 'admin@example.invalid',
      metadata: const {'method': 'verified_email_invitation'},
    ),
  ];
}

void main() {
  testWidgets('admin setup requires a strong matching password before signup', (
    tester,
  ) async {
    final auth = PreviewAuthRepository();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [authRepositoryProvider.overrideWith((ref) => auth)],
        child: const MaterialApp(
          home: AdminSetupPage(email: 'admin@example.invalid'),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('admin@example.invalid'), findsOneWidget);
    await tester.ensureVisible(find.text('Create account and verify email'));
    await tester.tap(find.text('Create account and verify email'));
    await tester.pumpAndSettle();
    expect(find.text('Enter your name.'), findsOneWidget);
    expect(find.text('Use at least 12 characters.'), findsOneWidget);
    expect(await auth.currentUser(), isNull);
    await tester.pumpWidget(const SizedBox());
    auth.dispose();
  });

  testWidgets('audit screen displays and searches stored events', (
    tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          auditRepositoryProvider.overrideWith((ref) => TestAuditRepository()),
        ],
        child: const MaterialApp(home: Scaffold(body: AuditLogPage())),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('initial administrator created'), findsOneWidget);
    expect(find.textContaining('Test Admin'), findsOneWidget);
    await tester.enterText(find.byType(TextField), 'nonexistent action');
    await tester.pumpAndSettle();
    expect(find.text('No matching audit events.'), findsOneWidget);
  });

  test(
    'audit repository requests a bounded ordered read, without a privileged key',
    () async {
      var requests = 0;
      final client = SupabaseClient(
        'https://example.supabase.co',
        'test-publishable-key',
        httpClient: MockClient((request) async {
          requests++;
          expect(request.method, 'GET');
          expect(request.url.path, '/rest/v1/audit_logs');
          expect(request.url.queryParameters['limit'], '200');
          expect(request.url.queryParameters['order'], startsWith('occurred_at.desc'));
          expect(request.headers['apikey'], 'test-publishable-key');
          return http.Response(
            '[{"id":1,"action":"session_started","entity_type":"profile",'
            '"occurred_at":"2026-10-25T00:00:00Z","metadata":{},"actor":{"name":"Admin","email":"admin@example.invalid"}}]',
            200,
            headers: {'content-type': 'application/json'},
            request: request,
          );
        }),
      );
      final entries = await SupabaseAuditRepository(client).load();
      expect(requests, 1);
      expect(entries.single.actorName, 'Admin');
      await client.dispose();
    },
  );
}
