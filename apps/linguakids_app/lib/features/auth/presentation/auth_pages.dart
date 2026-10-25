import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

import 'auth_controller.dart';
import '../../../core/config/app_config.dart';
import '../../learning/story_art.dart';

String accountError(Object? error) {
  if (error is AuthException) {
    return switch (error.code) {
      'invalid_credentials' =>
        'The email or password is incorrect. New here? Create an account first.',
      'email_not_confirmed' =>
        'Verify your email before logging in. Check your inbox and spam folder, or resend the confirmation below.',
      'user_already_exists' || 'email_exists' =>
        'This email is already registered. Log in or reset your password.',
      'over_email_send_rate_limit' || 'over_request_rate_limit' =>
        'Too many requests. Please wait a few minutes before trying again.',
      'email_address_not_authorized' =>
        'Email delivery is restricted for this project. The administrator needs to configure an email provider.',
      'weak_password' =>
        'Choose a stronger password with at least 10 characters.',
      _ => error.message,
    };
  }
  return 'Could not connect to your account. Check your internet connection and try again.';
}

String? validAccountEmail(String? value) =>
    RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(value?.trim() ?? '')
    ? null
    : 'Enter a valid email address.';

class AccountPasswordField extends StatefulWidget {
  const AccountPasswordField({
    required this.controller,
    required this.label,
    this.validator,
    this.onSubmitted,
    this.isNew = false,
    super.key,
  });
  final TextEditingController controller;
  final String label;
  final FormFieldValidator<String>? validator;
  final ValueChanged<String>? onSubmitted;
  final bool isNew;
  @override
  State<AccountPasswordField> createState() => _AccountPasswordFieldState();
}

class _AccountPasswordFieldState extends State<AccountPasswordField> {
  bool hidden = true;
  @override
  Widget build(BuildContext context) => TextFormField(
    controller: widget.controller,
    obscureText: hidden,
    autocorrect: false,
    enableSuggestions: false,
    autofillHints: [
      widget.isNew ? AutofillHints.newPassword : AutofillHints.password,
    ],
    textInputAction: widget.onSubmitted == null
        ? TextInputAction.next
        : TextInputAction.done,
    onFieldSubmitted: widget.onSubmitted,
    validator: widget.validator,
    decoration: InputDecoration(
      labelText: widget.label,
      suffixIcon: IconButton(
        tooltip: hidden
            ? 'Show ${widget.label.toLowerCase()}'
            : 'Hide ${widget.label.toLowerCase()}',
        onPressed: () => setState(() => hidden = !hidden),
        icon: Icon(
          hidden ? Icons.visibility_outlined : Icons.visibility_off_outlined,
        ),
      ),
    ),
  );
}

Future<void> openAccountPage(BuildContext context, String path) async {
  final opened = await launchUrl(
    Uri.parse('http://localhost:3000/#/$path'),
    webOnlyWindowName: '_self',
  );
  if (!opened && context.mounted) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text(
          'Open the LinguaKids App launcher, then choose Log in or Register.',
        ),
      ),
    );
  }
}

class LoginPage extends ConsumerStatefulWidget {
  const LoginPage({super.key});
  @override
  ConsumerState<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends ConsumerState<LoginPage> {
  final email = TextEditingController();
  final password = TextEditingController();
  final formKey = GlobalKey<FormState>();
  bool emailBusy = false;
  String? emailMessage;

  @override
  void dispose() {
    email.dispose();
    password.dispose();
    super.dispose();
  }

  Future<void> submit() async {
    if (ref.read(authControllerProvider).isLoading) return;
    if (!formKey.currentState!.validate()) return;
    await ref
        .read(authControllerProvider.notifier)
        .signIn(email.text, password.text);
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(authControllerProvider);
    return _AuthScaffold(
      title: 'Welcome back',
      subtitle:
          'Use one secure login for your educator or administrator workspace.',
      child: Form(
        key: formKey,
        child: Column(
          children: [
            const Text(
              'For educators and authorized adults. Children learn through a child profile.',
            ),
            const SizedBox(height: 18),
            TextFormField(
              controller: email,
              keyboardType: TextInputType.emailAddress,
              decoration: const InputDecoration(labelText: 'Email'),
              autofillHints: const [AutofillHints.username],
              textInputAction: TextInputAction.next,
              autocorrect: false,
              validator: validAccountEmail,
            ),
            const SizedBox(height: 14),
            AccountPasswordField(
              controller: password,
              label: 'Password',
              onSubmitted: (_) => submit(),
              validator: (value) => value != null && value.isNotEmpty
                  ? null
                  : 'Enter your password.',
            ),
            const SizedBox(height: 10),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: () => _showReset(context),
                child: const Text('Forgot password?'),
              ),
            ),
            if (state.hasError)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Text(
                  accountError(state.error),
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
              ),
            FilledButton(
              onPressed: state.isLoading ? null : submit,
              child: state.isLoading
                  ? const SizedBox.square(
                      dimension: 22,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Log in'),
            ),
            const SizedBox(height: 8),
            TextButton(
              onPressed: () => context.go('/register'),
              child: const Text('Register as an educator'),
            ),
            TextButton(
              onPressed: emailBusy ? null : () => _emailAction(reset: false),
              child: const Text('Resend confirmation email'),
            ),
            if (emailMessage != null)
              Semantics(
                liveRegion: true,
                child: Text(emailMessage!, textAlign: TextAlign.center),
              ),
            if (AppConfig.adminSetupEmail.isNotEmpty)
              TextButton(
                onPressed: () => context.go('/admin-setup'),
                child: const Text('Set up the administrator account'),
              ),
          ],
        ),
      ),
    );
  }

  Future<void> _showReset(BuildContext context) async {
    await _emailAction(reset: true);
  }

  Future<void> _emailAction({required bool reset}) async {
    if (emailBusy) return;
    if (validAccountEmail(email.text) != null) {
      setState(() => emailMessage = 'Enter your email address above first.');
      return;
    }
    setState(() {
      emailBusy = true;
      emailMessage = null;
    });
    try {
      final repository = ref.read(authRepositoryProvider);
      if (reset) {
        await repository.sendPasswordReset(email.text);
      } else {
        await repository.resendConfirmation(email.text);
      }
      if (mounted) {
        setState(
          () => emailMessage = reset
              ? 'If an account exists, a password reset link has been sent. Check your inbox and spam folder.'
              : 'If your account needs verification, a confirmation email has been sent. Check your inbox and spam folder.',
        );
      }
    } catch (error) {
      if (mounted) setState(() => emailMessage = accountError(error));
    } finally {
      if (mounted) {
        setState(() => emailBusy = false);
      }
    }
  }
}

class RegisterPage extends ConsumerStatefulWidget {
  const RegisterPage({super.key});
  @override
  ConsumerState<RegisterPage> createState() => _RegisterPageState();
}

class ResetPasswordPage extends ConsumerStatefulWidget {
  const ResetPasswordPage({super.key});
  @override
  ConsumerState<ResetPasswordPage> createState() => _ResetPasswordPageState();
}

class _ResetPasswordPageState extends ConsumerState<ResetPasswordPage> {
  final password = TextEditingController();
  final confirmation = TextEditingController();
  final formKey = GlobalKey<FormState>();
  bool saving = false;

  @override
  void dispose() {
    password.dispose();
    confirmation.dispose();
    super.dispose();
  }

  Future<void> submit() async {
    if (!formKey.currentState!.validate()) return;
    setState(() => saving = true);
    try {
      await ref.read(authRepositoryProvider).updatePassword(password.text);
      await ref.read(authRepositoryProvider).signOut();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Password updated. Log in again.')),
        );
        context.go('/login');
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('$error')));
      }
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  @override
  Widget build(BuildContext context) => _AuthScaffold(
    title: 'Choose a new password',
    subtitle:
        'Open this page from the secure recovery link sent to your email.',
    child: Form(
      key: formKey,
      child: Column(
        children: [
          TextFormField(
            controller: password,
            obscureText: true,
            decoration: const InputDecoration(labelText: 'New password'),
            validator: (value) => (value?.length ?? 0) >= 10
                ? null
                : 'Use at least 10 characters.',
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: confirmation,
            obscureText: true,
            decoration: const InputDecoration(
              labelText: 'Confirm new password',
            ),
            validator: (value) =>
                value == password.text ? null : 'Passwords do not match.',
          ),
          const SizedBox(height: 20),
          FilledButton(
            onPressed: saving ? null : submit,
            child: const Text('Update password'),
          ),
        ],
      ),
    ),
  );
}

class _RegisterPageState extends ConsumerState<RegisterPage> {
  final formKey = GlobalKey<FormState>();
  final name = TextEditingController();
  final email = TextEditingController();
  final school = TextEditingController();
  final password = TextEditingController();
  final confirmation = TextEditingController();
  final grades = <int>{};
  bool accepted = false;
  bool registered = false;

  @override
  void dispose() {
    for (final controller in [name, email, school, password, confirmation]) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> submit() async {
    if (ref.read(authControllerProvider).isLoading) return;
    if (!formKey.currentState!.validate()) return;
    if (!accepted || grades.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Select at least one grade and accept the terms and privacy information.',
          ),
        ),
      );
      return;
    }
    await ref
        .read(authControllerProvider.notifier)
        .register(
          name: name.text,
          email: email.text,
          password: password.text,
          schoolName: school.text.isEmpty ? null : school.text,
          gradeLevels: grades.toList()..sort(),
        );
    if (mounted && !ref.read(authControllerProvider).hasError) {
      password.clear();
      confirmation.clear();
      setState(() => registered = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(authControllerProvider);
    return _AuthScaffold(
      title: 'Create an educator account',
      subtitle:
          'Administrator access is never available through public registration.',
      child: registered
          ? Column(
              children: [
                const Icon(Icons.mark_email_read_outlined, size: 64),
                const SizedBox(height: 16),
                const Text(
                  'Check your email',
                  style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 12),
                Text(
                  'Check ${email.text.trim()} and your spam folder for the verification link. If this email is already registered, log in or reset your password.',
                ),
                const SizedBox(height: 20),
                FilledButton(
                  onPressed: () => context.go('/login'),
                  child: const Text('Go to login'),
                ),
              ],
            )
          : Form(
              key: formKey,
              child: Column(
                children: [
                  TextFormField(
                    controller: name,
                    decoration: const InputDecoration(labelText: 'Name'),
                    validator: _required,
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: email,
                    keyboardType: TextInputType.emailAddress,
                    autofillHints: const [AutofillHints.email],
                    autocorrect: false,
                    decoration: const InputDecoration(labelText: 'Email'),
                    validator: validAccountEmail,
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: school,
                    decoration: const InputDecoration(
                      labelText: 'School name (optional)',
                    ),
                  ),
                  const SizedBox(height: 12),
                  AccountPasswordField(
                    controller: password,
                    label: 'Password (at least 10 characters)',
                    isNew: true,
                    validator: (value) => (value?.length ?? 0) >= 10
                        ? null
                        : 'Use at least 10 characters.',
                  ),
                  const SizedBox(height: 12),
                  AccountPasswordField(
                    controller: confirmation,
                    label: 'Confirm password',
                    isNew: true,
                    onSubmitted: (_) => submit(),
                    validator: (value) => value == password.text
                        ? null
                        : 'Passwords do not match.',
                  ),
                  const SizedBox(height: 18),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: Text(
                      'Grade levels taught',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                  ),
                  Wrap(
                    spacing: 8,
                    children: List.generate(6, (index) {
                      final grade = index + 1;
                      return FilterChip(
                        label: Text('Grade $grade'),
                        selected: grades.contains(grade),
                        onSelected: (selected) => setState(
                          () => selected
                              ? grades.add(grade)
                              : grades.remove(grade),
                        ),
                      );
                    }),
                  ),
                  CheckboxListTile(
                    contentPadding: EdgeInsets.zero,
                    value: accepted,
                    onChanged: (value) =>
                        setState(() => accepted = value ?? false),
                    title: const Text(
                      'I accept the account terms and privacy information.',
                    ),
                    controlAffinity: ListTileControlAffinity.leading,
                  ),
                  if (state.hasError)
                    Text(
                      accountError(state.error),
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.error,
                      ),
                    ),
                  const SizedBox(height: 8),
                  FilledButton(
                    onPressed: state.isLoading ? null : submit,
                    child: Text(
                      state.isLoading
                          ? 'Creating account…'
                          : 'Create educator account',
                    ),
                  ),
                  TextButton(
                    onPressed: () => context.go('/login'),
                    child: const Text('Already registered? Log in'),
                  ),
                ],
              ),
            ),
    );
  }

  String? _required(String? value) =>
      value == null || value.trim().isEmpty ? 'Required.' : null;
}

class _AuthScaffold extends ConsumerWidget {
  const _AuthScaffold({
    required this.title,
    required this.subtitle,
    required this.child,
  });
  final String title;
  final String subtitle;
  final Widget child;
  @override
  Widget build(BuildContext context, WidgetRef ref) => Scaffold(
    appBar: AppBar(
      title: TextButton(
        onPressed: () => context.go('/'),
        child: const Text('← LinguaKids'),
      ),
    ),
    body: Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 520),
          child: Card(
            child: Padding(
              padding: const EdgeInsets.all(30),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const AnimalWelcome(
                    title: 'A little learning, a big adventure',
                    message: 'Welcome to LinguaKids',
                    scene: 12,
                  ),
                  const SizedBox(height: 22),
                  Text(
                    title,
                    style: Theme.of(context).textTheme.headlineMedium,
                  ),
                  const SizedBox(height: 8),
                  Text(subtitle),
                  const SizedBox(height: 26),
                  if (ref.watch(previewModeProvider)) ...[
                    const Text(
                      'You are viewing the demo. Open the connected app to log in or create a real account.',
                    ),
                    const SizedBox(height: 20),
                    FilledButton(
                      onPressed: () => openAccountPage(context, 'login'),
                      child: const Text('Open real login'),
                    ),
                    const SizedBox(height: 12),
                    OutlinedButton(
                      onPressed: () => openAccountPage(context, 'register'),
                      child: const Text('Open real registration'),
                    ),
                  ] else
                    child,
                ],
              ),
            ),
          ),
        ),
      ),
    ),
  );
}
