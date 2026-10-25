import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/config/app_config.dart';
import 'auth_controller.dart';
import 'auth_pages.dart';

class AdminSetupPage extends ConsumerStatefulWidget {
  const AdminSetupPage({this.email = AppConfig.adminSetupEmail, super.key});

  final String email;

  @override
  ConsumerState<AdminSetupPage> createState() => _AdminSetupPageState();
}

class _AdminSetupPageState extends ConsumerState<AdminSetupPage> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _password = TextEditingController();
  final _confirmation = TextEditingController();
  bool _submitted = false;

  @override
  void dispose() {
    _name.dispose();
    _password.dispose();
    _confirmation.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    await ref
        .read(authControllerProvider.notifier)
        .register(
          name: _name.text.trim(),
          email: widget.email,
          password: _password.text,
          gradeLevels: const [],
        );
    if (mounted && !ref.read(authControllerProvider).hasError) {
      _password.clear();
      _confirmation.clear();
      setState(() => _submitted = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('LinguaKids administrator setup')),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 540),
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(28),
                child: ref.watch(previewModeProvider)
                    ? Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Text(
                            'Create your administrator account in the connected app.',
                          ),
                          const SizedBox(height: 20),
                          FilledButton(
                            onPressed: () =>
                                openAccountPage(context, 'admin-setup'),
                            child: const Text('Open administrator setup'),
                          ),
                        ],
                      )
                    : widget.email.isEmpty
                    ? const Text('Administrator setup has not been configured.')
                    : _submitted
                    ? Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Check your email',
                            style: Theme.of(context).textTheme.headlineMedium,
                          ),
                          const SizedBox(height: 16),
                          Text(
                            'Open the confirmation email sent to ${widget.email}. '
                            'After verifying your email, log in with the password you chose. '
                            'Your verified invitation activates the administrator account.',
                          ),
                          const SizedBox(height: 20),
                          FilledButton(
                            onPressed: () => context.go('/login'),
                            child: const Text('Go to login'),
                          ),
                        ],
                      )
                    : Form(
                        key: _form,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Text(
                              'Create your admin login',
                              style: Theme.of(context).textTheme.headlineMedium,
                            ),
                            const SizedBox(height: 12),
                            const Text(
                              'Choose a new account password. Use a different password from your database password. '
                              'Administrator access is activated only for the verified email invitation.',
                            ),
                            const SizedBox(height: 24),
                            TextFormField(
                              initialValue: widget.email,
                              readOnly: true,
                              decoration: const InputDecoration(
                                labelText: 'Administrator email',
                              ),
                            ),
                            const SizedBox(height: 14),
                            TextFormField(
                              controller: _name,
                              decoration: const InputDecoration(
                                labelText: 'Your name',
                              ),
                              validator: (value) =>
                                  value == null || value.trim().isEmpty
                                  ? 'Enter your name.'
                                  : null,
                            ),
                            const SizedBox(height: 14),
                            TextFormField(
                              controller: _password,
                              obscureText: true,
                              autofillHints: const [AutofillHints.newPassword],
                              decoration: const InputDecoration(
                                labelText: 'New account password',
                              ),
                              validator: (value) => (value?.length ?? 0) < 12
                                  ? 'Use at least 12 characters.'
                                  : null,
                            ),
                            const SizedBox(height: 14),
                            TextFormField(
                              controller: _confirmation,
                              obscureText: true,
                              decoration: const InputDecoration(
                                labelText: 'Confirm account password',
                              ),
                              validator: (value) => value != _password.text
                                  ? 'Passwords do not match.'
                                  : null,
                            ),
                            const SizedBox(height: 20),
                            if (auth.hasError) ...[
                              Text(
                                accountError(auth.error),
                                style: TextStyle(
                                  color: Theme.of(context).colorScheme.error,
                                ),
                              ),
                              const SizedBox(height: 12),
                            ],
                            FilledButton(
                              onPressed: auth.isLoading ? null : _submit,
                              child: Text(
                                auth.isLoading
                                    ? 'Creating account…'
                                    : 'Create account and verify email',
                              ),
                            ),
                            TextButton(
                              onPressed: () => context.go('/login'),
                              child: const Text('Already registered? Log in'),
                            ),
                          ],
                        ),
                      ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
