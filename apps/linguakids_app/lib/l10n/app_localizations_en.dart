// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appName => 'LinguaKids';

  @override
  String get welcome => 'Teach language with confidence';

  @override
  String get login => 'Log in';

  @override
  String get register => 'Educator registration';

  @override
  String get logout => 'Log out';

  @override
  String get offline => 'Offline';

  @override
  String get presentationMode => 'Presentation mode';
}
