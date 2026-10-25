import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:linguakids_app/app.dart';
import 'package:linguakids_app/core/routing/app_router.dart';
import 'package:linguakids_app/features/auth/presentation/auth_controller.dart';
import 'package:linguakids_app/features/auth/presentation/auth_pages.dart';
import 'package:linguakids_app/features/auth/domain/app_user.dart';
import 'package:linguakids_app/features/learning/learning_data.dart';
import 'package:linguakids_app/preview/demo_learning_repository.dart';
import 'package:linguakids_app/preview/preview_services.dart';

class AccountFixture extends PreviewAuthRepository {
  bool fail = true;
  int registrations = 0, resets = 0, confirmations = 0;
  final recovery = StreamController<bool>.broadcast(sync: true);
  @override
  Stream<bool> watchPasswordRecovery() => recovery.stream;
  @override
  Future<void> signIn({required String email, required String password}) async {
    if (fail) {
      throw const AuthException(
        'Invalid login credentials',
        code: 'invalid_credentials',
      );
    }
    showRole(AccountRole.educator);
  }

  @override
  Future<void> registerEducator({
    required String name,
    required String email,
    required String password,
    String? schoolName,
    required List<int> gradeLevels,
  }) async {
    registrations++;
    if (fail) {
      throw const AuthException(
        'Too many requests',
        code: 'over_email_send_rate_limit',
      );
    }
  }

  @override
  Future<void> sendPasswordReset(String email) async {
    resets++;
  }

  @override
  Future<void> resendConfirmation(String email) async {
    confirmations++;
  }

  @override
  void dispose() {
    recovery.close();
    super.dispose();
  }
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  Future<ProviderContainer> mount(
    WidgetTester tester,
    AccountFixture auth, {
    bool preview = false,
  }) async {
    tester.view.physicalSize = const Size(1100, 1600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authRepositoryProvider.overrideWithValue(auth),
          previewModeProvider.overrideWithValue(preview),
          learningRepositoryProvider.overrideWith(
            (ref) => DemoLearningRepository(),
          ),
        ],
        child: const LinguaKidsApp(),
      ),
    );
    await tester.pumpAndSettle();
    final container = ProviderScope.containerOf(
      tester.element(find.byType(LinguaKidsApp)),
    );
    container.read(appRouterProvider).go('/login');
    await tester.pumpAndSettle();
    addTearDown(() async {
      await tester.pumpWidget(const SizedBox());
      auth.dispose();
    });
    return container;
  }

  testWidgets(
    'login and registration fit a phone screen and expose password visibility',
    (tester) async {
      final auth = AccountFixture();
      final container = await mount(tester, auth);
      tester.view.physicalSize = const Size(390, 844);
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      final show = find.byTooltip('Show password');
      await tester.ensureVisible(show);
      await tester.tap(show);
      await tester.pumpAndSettle();
      expect(
        tester.widget<TextField>(find.byType(TextField).at(1)).obscureText,
        isFalse,
      );
      container.read(appRouterProvider).go('/register');
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Create educator account'));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'login error keeps router, page and input; successful retry reaches workspace',
    (tester) async {
      final auth = AccountFixture();
      final container = await mount(tester, auth);
      final router = container.read(appRouterProvider);
      await tester.enterText(
        find.byType(TextFormField).at(0),
        'adult@example.test',
      );
      await tester.enterText(find.byType(TextFormField).at(1), 'secret');
      await tester.tap(find.widgetWithText(FilledButton, 'Log in'));
      await tester.pumpAndSettle();
      expect(container.read(appRouterProvider), same(router));
      expect(router.routeInformationProvider.value.uri.path, '/login');
      expect(
        find.textContaining('email or password is incorrect'),
        findsOneWidget,
      );
      expect(find.text('adult@example.test'), findsOneWidget);
      auth.fail = false;
      await tester.tap(find.widgetWithText(FilledButton, 'Log in'));
      await tester.pumpAndSettle();
      expect(router.routeInformationProvider.value.uri.path, '/workspace/home');
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'registration preserves form on failure and shows email confirmation on success',
    (tester) async {
      final auth = AccountFixture();
      final container = await mount(tester, auth);
      container.read(appRouterProvider).go('/register');
      await tester.pumpAndSettle();
      final fields = find.byType(TextFormField);
      await tester.enterText(fields.at(0), 'Teacher');
      await tester.enterText(fields.at(1), 'teacher@example.test');
      await tester.enterText(fields.at(3), 'a-new-password');
      await tester.enterText(fields.at(4), 'a-new-password');
      await tester.tap(find.text('Grade 3'));
      await tester.tap(find.byType(CheckboxListTile));
      final submit = find.widgetWithText(
        FilledButton,
        'Create educator account',
      );
      await tester.ensureVisible(submit);
      await tester.tap(submit);
      await tester.pumpAndSettle();
      expect(find.textContaining('Too many requests'), findsOneWidget);
      expect(find.text('teacher@example.test'), findsOneWidget);
      auth.fail = false;
      await tester.ensureVisible(submit);
      await tester.tap(submit);
      await tester.pumpAndSettle();
      expect(auth.registrations, 2);
      expect(find.text('Check your email'), findsOneWidget);
      await tester.ensureVisible(find.text('Go to login'));
      await tester.tap(find.text('Go to login'));
      await tester.pumpAndSettle();
      expect(find.byType(AlertDialog), findsNothing);
      expect(find.byType(LoginPage), findsOneWidget);
    },
  );
  testWidgets('reset and resend validate email and show successful feedback', (
    tester,
  ) async {
    final auth = AccountFixture();
    await mount(tester, auth);
    await tester.tap(find.text('Forgot password?'));
    await tester.pumpAndSettle();
    expect(auth.resets, 0);
    expect(find.text('Enter your email address above first.'), findsOneWidget);
    await tester.enterText(
      find.byType(TextFormField).first,
      'adult@example.test',
    );
    await tester.tap(find.text('Forgot password?'));
    await tester.pumpAndSettle();
    expect(auth.resets, 1);
    expect(
      find.textContaining('password reset link has been sent'),
      findsOneWidget,
    );
    await tester.tap(find.text('Resend confirmation email'));
    await tester.pumpAndSettle();
    expect(auth.confirmations, 1);
    expect(
      find.textContaining('confirmation email has been sent'),
      findsOneWidget,
    );
  });
  testWidgets(
    'preview login shows real account links and does not collect passwords',
    (tester) async {
      await mount(tester, AccountFixture(), preview: true);
      expect(find.byType(TextFormField), findsNothing);
      expect(find.text('Open real login'), findsOneWidget);
      expect(find.text('Open real registration'), findsOneWidget);
    },
  );
  testWidgets('password recovery routes signed-in adult to the password form', (
    tester,
  ) async {
    final auth = AccountFixture();
    final container = await mount(tester, auth);
    auth.showRole(AccountRole.educator);
    await tester.pumpAndSettle();
    auth.recovery.add(true);
    await tester.pumpAndSettle();
    expect(
      container.read(appRouterProvider).routeInformationProvider.value.uri.path,
      '/reset-password',
    );
    expect(find.text('Choose a new password'), findsOneWidget);
  });
}
