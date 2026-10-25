# Verified dependency baseline

Checked against official documentation and package registries on 2026-10-25:

- Flutter stable 3.47 release line: https://docs.flutter.dev/release/release-notes
- `go_router` 18.1.1: https://pub.dev/packages/go_router
- `flutter_riverpod` 3.4.3: https://pub.dev/packages/flutter_riverpod
- `supabase_flutter` 2.18.3: https://pub.dev/packages/supabase_flutter/versions
- `sqflite` 2.4.5: https://pub.dev/packages/sqflite/versions
- `pdf` 3.13.1 and `printing` 5.15.1: https://pub.dev/packages/pdf and https://pub.dev/packages/printing
- `flutter_tts` 4.2.5: https://pub.dev/packages/flutter_tts/versions
- FastAPI 0.162.0: https://pypi.org/project/fastapi/
- Supabase RLS guidance: https://supabase.com/docs/guides/database/postgres/row-level-security
- `google/mt5-small` model card and Apache-2.0 license: https://huggingface.co/google/mt5-small

Package versions are pinned for reproducibility. Re-verify release notes before a future upgrade, especially Dart SDK constraints and ML checkpoint compatibility.

The local browser preview was built and tested with the existing Flutter 3.44.4 / Dart 3.12.2 installation. Dependency resolution required `http` 1.6.0 and `shared_preferences` 2.5.5 to satisfy `supabase_flutter` 2.18.3. The resolved application dependencies are recorded in `apps/linguakids_app/pubspec.lock`.
