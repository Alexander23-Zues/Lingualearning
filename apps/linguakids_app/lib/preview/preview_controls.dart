import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/routing/app_router.dart';
import '../features/auth/domain/app_user.dart';
import '../features/auth/presentation/auth_controller.dart';
import 'preview_services.dart';

class PreviewControls extends ConsumerWidget {
  const PreviewControls({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    void show(AccountRole? role) {
      (ref.read(authRepositoryProvider) as PreviewAuthRepository).showRole(
        role,
      );
      ref
          .read(appRouterProvider)
          .go(
            role == null
                ? '/'
                : role == AccountRole.educator
                ? '/workspace/home'
                : '/workspace/overview',
          );
    }

    return Material(
      color: const Color(0xFFFFE7A3),
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
          child: Wrap(
            spacing: 8,
            runSpacing: 4,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              const Text(
                'LOCAL PREVIEW · Demo changes last until refresh',
                style: TextStyle(fontWeight: FontWeight.w700),
              ),
              TextButton(
                onPressed: () => show(null),
                child: const Text('Landing page'),
              ),
              TextButton(
                onPressed: () => show(AccountRole.educator),
                child: const Text('Educator preview'),
              ),
              TextButton(
                onPressed: () => show(AccountRole.administrator),
                child: const Text('Admin preview'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
