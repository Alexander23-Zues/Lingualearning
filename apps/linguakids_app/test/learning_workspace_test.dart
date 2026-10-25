import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:linguakids_app/app.dart';
import 'package:linguakids_app/core/routing/app_router.dart';
import 'package:linguakids_app/features/audit/audit_repository.dart';
import 'package:linguakids_app/features/auth/domain/app_user.dart';
import 'package:linguakids_app/features/auth/presentation/auth_controller.dart';
import 'package:linguakids_app/features/learning/learning_data.dart';
import 'package:linguakids_app/features/workspace/presentation/workspace_page.dart';
import 'package:linguakids_app/preview/demo_learning_repository.dart';
import 'package:linguakids_app/preview/preview_controls.dart';
import 'package:linguakids_app/preview/preview_services.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  testWidgets(
    'child profiles and adult controls fit a narrow screen without collecting contact details',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final auth = PreviewAuthRepository(), demo = DemoLearningRepository();
      demo.children.first['nickname'] =
          'A friendly learning owl with a long name';
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            authRepositoryProvider.overrideWith((ref) => auth),
            learningRepositoryProvider.overrideWith((ref) => demo),
            studentRepositoryProvider.overrideWith((ref) => demo),
          ],
          child: const LinguaKidsApp(previewControls: PreviewControls()),
        ),
      );
      await tester.pumpAndSettle();
      auth.showRole(AccountRole.educator);
      await tester.pumpAndSettle();
      final container = ProviderScope.containerOf(
        tester.element(find.byType(LinguaKidsApp)),
      );
      container.read(appRouterProvider).go('/workspace/students');
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      await tester.ensureVisible(find.text('Create child profile'));
      await tester.tap(find.text('Create child profile'));
      await tester.pumpAndSettle();
      expect(find.text('Nickname'), findsOneWidget);
      expect(find.text('Student PIN'), findsNothing);
      expect(find.text('Email'), findsNothing);
      expect(find.text('Phone number'), findsNothing);
      expect(find.text('Date of birth'), findsNothing);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
      auth.dispose();
    },
  );
  testWidgets(
    'every admin and educator destination renders meaningful content',
    (tester) async {
      tester.view.physicalSize = const Size(1440, 1100);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final auth = PreviewAuthRepository(), demo = DemoLearningRepository();
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            authRepositoryProvider.overrideWith((ref) => auth),
            learningRepositoryProvider.overrideWith((ref) => demo),
            studentRepositoryProvider.overrideWith((ref) => demo),
            auditRepositoryProvider.overrideWith(
              (ref) => PreviewAuditRepository(),
            ),
          ],
          child: const LinguaKidsApp(previewControls: PreviewControls()),
        ),
      );
      await tester.pumpAndSettle();
      final container = ProviderScope.containerOf(
        tester.element(find.byType(LinguaKidsApp)),
      );
      for (final role in AccountRole.values) {
        auth.showRole(role);
        await tester.pumpAndSettle();
        for (final item
            in role == AccountRole.administrator
                ? administratorItems
                : educatorItems) {
          container.read(appRouterProvider).go('/workspace/${item.slug}');
          await tester.pumpAndSettle();
          expect(
            tester.takeException(),
            isNull,
            reason: '${role.name}/${item.slug}',
          );
          expect(
            find.text('Use the action above to create or import a record.'),
            findsNothing,
          );
        }
      }
      await tester.pumpWidget(const SizedBox());
      auth.dispose();
    },
  );

  testWidgets(
    'student mode locks adult routes and has only its own learning area',
    (tester) async {
      tester.view.physicalSize = const Size(1440, 1100);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final auth = PreviewAuthRepository(), demo = DemoLearningRepository();
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            authRepositoryProvider.overrideWith((ref) => auth),
            learningRepositoryProvider.overrideWith((ref) => demo),
            studentRepositoryProvider.overrideWith((ref) => demo),
          ],
          child: const LinguaKidsApp(previewControls: PreviewControls()),
        ),
      );
      await tester.pumpAndSettle();
      auth.showRole(AccountRole.educator);
      await tester.pumpAndSettle();
      final container = ProviderScope.containerOf(
        tester.element(find.byType(LinguaKidsApp)),
      );
      container.read(appRouterProvider).go('/workspace/students');
      await tester.pumpAndSettle();
      expect(find.text('Nickname'), findsNothing);
      await tester.ensureVisible(find.text('Start learning'));
      await tester.tap(find.text('Start learning'));
      await tester.pumpAndSettle();
      expect(find.text('Hi, Luna!'), findsOneWidget);
      expect(container.read(adultLockProvider), isTrue);
      expect(find.text('Admin preview'), findsNothing);
      container.read(appRouterProvider).go('/workspace/educators');
      await tester.pumpAndSettle();
      expect(find.text('Hi, Luna!'), findsOneWidget);
      expect(find.text('Educator Management'), findsNothing);
      await tester.tap(find.text('Adult controls'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Return to preview'));
      await tester.pumpAndSettle();
      expect(container.read(adultLockProvider), isFalse);
      expect(container.read(studentSessionProvider), isNull);
      await tester.pumpWidget(const SizedBox());
      auth.dispose();
    },
  );

  test(
    'student HTTP carries no adult JWT and no selectable child identity',
    () async {
      final session = StudentSession(
        token: 'a' * 64,
        child: {'id': 'child-one'},
      );
      final repository = ScopedStudentRepository(
        supabaseUrl: 'https://example.supabase.co',
        publishableKey: 'publishable-test',
        client: MockClient((request) async {
          expect(request.headers.containsKey('Authorization'), isFalse);
          expect(request.headers['apikey'], 'publishable-test');
          expect(jsonDecode(request.body), {'p_token': 'a' * 64});
          return http.Response(
            '{"child":{"id":"child-one"},"materials":[],"attempts":[],"saved_vocabulary":[]}',
            200,
            request: request,
          );
        }),
      );
      expect((await repository.load(session))['child'], {'id': 'child-one'});
    },
  );

  test(
    'offline completion queues answers without awarding local stars or saving the session token',
    () async {
      final session = StudentSession(
        token: 'a' * 64,
        child: {'id': 'child-one'},
      );
      final repository = ScopedStudentRepository(
        supabaseUrl: 'https://example.supabase.co',
        publishableKey: 'publishable-test',
        client: MockClient(
          (request) async => throw http.ClientException('offline'),
        ),
      );
      final result = await repository.complete(
        session,
        {'id': 'material-one', 'version': 1},
        {'question-one': 'option-one'},
      );
      expect(result, {'pending': true});
      final queued = await LearningCache.read('pending.child-one');
      expect(jsonEncode(queued), isNot(contains(session.token)));
      expect(jsonRows(queued?['items']).single['p_answers'], {
        'question-one': 'option-one',
      });
    },
  );
}
