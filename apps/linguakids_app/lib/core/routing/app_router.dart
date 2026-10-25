import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter/foundation.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/domain/app_user.dart';
import '../../features/auth/presentation/auth_controller.dart';
import '../../features/auth/presentation/auth_pages.dart';
import '../../features/auth/presentation/admin_setup_page.dart';
import '../../features/presentation/presentation_mode_page.dart';
import '../../features/public/presentation/landing_page.dart';
import '../../features/workspace/presentation/feature_pages.dart';
import '../../features/workspace/presentation/workspace_page.dart';
import '../../features/learning/learning_data.dart';
import '../../features/learning/child_pages.dart';

final appRouterProvider = Provider<GoRouter>((ref) {
  final refresh = ValueNotifier(0);
  ref.listen(authControllerProvider, (_, _) => refresh.value++);
  ref.listen(adultLockProvider, (_, _) => refresh.value++);
  ref.listen(studentSessionProvider, (_, _) => refresh.value++);
  ref.listen(passwordRecoveryProvider, (_, _) => refresh.value++);
  final router = GoRouter(
    refreshListenable: refresh,
    initialLocation: '/',
    redirect: (context, state) {
      final path = state.uri.path;
      final auth = ref.read(authControllerProvider);
      final user = auth.value;
      final locked = ref.read(adultLockProvider);
      final child = ref.read(studentSessionProvider);
      if (locked) {
        if (path == '/adult-unlock') return null;
        if (child == null) return '/adult-unlock';
        return path == '/student' ? null : '/student';
      }
      if (path == '/student' || path == '/adult-unlock') {
        return user == null
            ? '/login'
            : user.role == AccountRole.administrator
            ? '/workspace/overview'
            : '/workspace/home';
      }
      final public =
          path == '/' ||
          path == '/login' ||
          path == '/register' ||
          path == '/reset-password' ||
          path == '/admin-setup';
      if (auth.isLoading) return null;
      if (ref.read(passwordRecoveryProvider).value == true && user != null) {
        return path == '/reset-password' ? null : '/reset-password';
      }
      if (user == null) return public ? null : '/login';
      if (user.status == AccountStatus.suspended) return '/login';
      if (public && path != '/reset-password') {
        return user.role == AccountRole.administrator
            ? '/workspace/overview'
            : '/workspace/home';
      }
      if (path == '/presentation' && user.role != AccountRole.educator) {
        return '/workspace/overview';
      }
      final slug = state.pathParameters['section'];
      if (slug != null) {
        final allowed =
            (user.role == AccountRole.administrator
                    ? administratorItems
                    : educatorItems)
                .any((item) => item.slug == slug);
        if (!allowed) {
          return user.role == AccountRole.administrator
              ? '/workspace/overview'
              : '/workspace/home';
        }
      }
      return null;
    },
    routes: [
      GoRoute(path: '/', builder: (_, _) => const LandingPage()),
      GoRoute(path: '/student', builder: (_, _) => const StudentLearningPage()),
      GoRoute(
        path: '/adult-unlock',
        builder: (_, _) => const AdultUnlockPage(),
      ),
      GoRoute(path: '/login', builder: (_, _) => const LoginPage()),
      GoRoute(path: '/register', builder: (_, _) => const RegisterPage()),
      GoRoute(path: '/admin-setup', builder: (_, _) => const AdminSetupPage()),
      GoRoute(
        path: '/reset-password',
        builder: (_, _) => const ResetPasswordPage(),
      ),
      GoRoute(
        path: '/presentation',
        builder: (_, _) => const PresentationModePage(),
      ),
      GoRoute(
        path: '/workspace/:section',
        builder: (_, state) {
          final section = state.pathParameters['section']!;
          return WorkspacePage(
            section: section,
            child: FeaturePage(section: section),
          );
        },
      ),
    ],
  );
  ref.onDispose(() {
    router.dispose();
    refresh.dispose();
  });
  return router;
});
