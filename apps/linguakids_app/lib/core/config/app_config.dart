class AppConfig {
  const AppConfig._();

  static const supabaseUrl = String.fromEnvironment('SUPABASE_URL');
  static const supabasePublishableKey = String.fromEnvironment(
    'SUPABASE_PUBLISHABLE_KEY',
  );
  static const _apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://127.0.0.1:8000',
  );
  static const _authRedirectUrl = String.fromEnvironment('AUTH_REDIRECT_URL');
  // An empty API_BASE_URL in the hosted web build uses the deployed origin.
  // Local launchers can still provide their separate local API address.
  static String get apiBaseUrl =>
      _apiBaseUrl.isEmpty ? _webOrigin : _apiBaseUrl;
  static String get authRedirectUrl =>
      _authRedirectUrl.isEmpty ? _webOrigin : _authRedirectUrl;
  static String get _webOrigin =>
      ['http', 'https'].contains(Uri.base.scheme) ? Uri.base.origin : '';
  static const adminSetupEmail = String.fromEnvironment('ADMIN_SETUP_EMAIL');

  static bool get hasSupabase =>
      supabaseUrl.isNotEmpty && supabasePublishableKey.isNotEmpty;
}
