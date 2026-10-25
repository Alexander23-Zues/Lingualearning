import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:linguakids_app/app.dart';
import 'package:linguakids_app/core/network/api_client.dart';
import 'package:linguakids_app/features/auth/domain/app_user.dart';
import 'package:linguakids_app/features/auth/presentation/auth_controller.dart';
import 'package:linguakids_app/preview/preview_controls.dart';
import 'package:linguakids_app/preview/preview_services.dart';
import 'package:linguakids_app/preview/demo_learning_repository.dart';
import 'package:linguakids_app/features/learning/learning_data.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  test('preview refuses real credentials and API calls', () async {
    final auth = PreviewAuthRepository();
    addTearDown(auth.dispose);
    expect(await auth.currentUser(), isNull);
    await expectLater(
      auth.signIn(email: 'test@example.invalid', password: 'test'),
      throwsA(isA<ApiException>()),
    );
    await expectLater(
      PreviewApiClient().get('/v1/me'),
      throwsA(isA<ApiException>()),
    );
    auth.showRole(AccountRole.administrator);
    expect((await auth.currentUser())!.role, AccountRole.administrator);
    await auth.signOut();
    expect(await auth.currentUser(), isNull);
  });

  testWidgets(
    'preview navigates landing, educator, and administrator screens',
    (tester) async {
      tester.view.physicalSize = const Size(1440, 1000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final repository = PreviewAuthRepository();
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            authRepositoryProvider.overrideWith((ref) => repository),
            learningRepositoryProvider.overrideWith(
              (ref) => DemoLearningRepository(),
            ),
          ],
          child: const LinguaKidsApp(previewControls: PreviewControls()),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Bring every word\nto life.'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.tap(find.text('Educator preview'));
      await tester.pumpAndSettle();
      expect(find.text('Good day, Preview Educator'), findsOneWidget);
      await tester.tap(find.text('Admin preview'));
      await tester.pumpAndSettle();
      expect(find.text('Good day, Preview Administrator'), findsOneWidget);
      await tester.tap(find.text('Landing page'));
      await tester.pumpAndSettle();
      expect(find.text('Bring every word\nto life.'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
      repository.dispose();
    },
  );

  testWidgets('landing page fits a narrow screen', (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final repository = PreviewAuthRepository();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authRepositoryProvider.overrideWith((ref) => repository),
          learningRepositoryProvider.overrideWith(
            (ref) => DemoLearningRepository(),
          ),
        ],
        child: const LinguaKidsApp(previewControls: PreviewControls()),
      ),
    );
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
    repository.dispose();
  });
}
