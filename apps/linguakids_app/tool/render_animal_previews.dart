import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:linguakids_app/core/theme/app_theme.dart';
import 'package:linguakids_app/features/learning/learning_data.dart';
import 'package:linguakids_app/features/learning/material_reader.dart';
import 'package:linguakids_app/features/learning/story_art.dart';
import 'package:linguakids_app/preview/demo_learning_repository.dart';
import 'package:linguakids_app/preview/preview_services.dart';
import 'package:linguakids_app/features/auth/presentation/auth_controller.dart';
import 'package:linguakids_app/features/auth/presentation/auth_pages.dart';

void main() {
  setUpAll(() async {
    final loader = FontLoader('PreviewText');
    for (final path in [
      'C:/Windows/Fonts/arial.ttf',
      'C:/Windows/Fonts/arialbd.ttf',
    ]) {
      final bytes = await File(path).readAsBytes();
      loader.addFont(Future.value(ByteData.view(bytes.buffer)));
    }
    await loader.load();
    final icons = FontLoader('MaterialIcons');
    final iconBytes = await File(
      'build/web_preview/assets/fonts/MaterialIcons-Regular.otf',
    ).readAsBytes();
    icons.addFont(Future.value(ByteData.view(iconBytes.buffer)));
    await icons.load();
  });
  Future<void> capture(
    WidgetTester tester,
    Widget child,
    String name, {
    Size size = const Size(1100, 1050),
    bool accounts = false,
  }) async {
    tester.view.physicalSize = size;
    tester.view.devicePixelRatio = 1;
    final key = GlobalKey();
    final theme = AppTheme.light();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          if (accounts)
            authRepositoryProvider.overrideWith((ref) {
              final auth = PreviewAuthRepository();
              ref.onDispose(auth.dispose);
              return auth;
            }),
        ],
        child: MaterialApp(
          debugShowCheckedModeBanner: false,
          theme: theme.copyWith(
            textTheme: theme.textTheme.apply(fontFamily: 'PreviewText'),
            primaryTextTheme: theme.primaryTextTheme.apply(
              fontFamily: 'PreviewText',
            ),
          ),
          home: RepaintBoundary(key: key, child: child),
        ),
      ),
    );
    await tester.pumpAndSettle();
    if (accounts) {
      final container = ProviderScope.containerOf(
        tester.element(find.byType(child.runtimeType)),
      );
      final state = container.read(authControllerProvider);
      expect(state.hasError, isFalse, reason: '${state.error}');
    }
    await tester.runAsync(() async {
      await precacheImage(
        const AssetImage('assets/images/animal-story-atlas.png'),
        key.currentContext!,
      );
    });
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    final boundary =
        key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
    await tester.runAsync(() async {
      final image = await boundary.toImage(pixelRatio: 1);
      final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
      await File(
        '../../.preview/$name.png',
      ).writeAsBytes(bytes!.buffer.asUint8List());
      image.dispose();
    });
    await tester.pumpWidget(const SizedBox());
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  }

  testWidgets('render actual storybook cover components', (tester) async {
    final books = DemoLearningRepository().materials
        .where((m) => m['kind'] == 'story' && m['grade_level'] == 1)
        .toList();
    await capture(
      tester,
      Scaffold(
        backgroundColor: const Color(0xFFFFF9E9),
        body: SingleChildScrollView(
          child: Padding(
            padding: const EdgeInsets.all(30),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'The Animal Adventure Bookshelf',
                  style: TextStyle(fontSize: 36, fontWeight: FontWeight.w900),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Choose a book. Meet a friend. Discover a story.  •  10 bilingual pages in every book',
                  style: TextStyle(fontSize: 18),
                ),
                const SizedBox(height: 26),
                Wrap(
                  spacing: 20,
                  runSpacing: 15,
                  children: books
                      .map(
                        (m) => SizedBox(
                          width: 500,
                          child: StoryBookCover(material: m, onOpen: () {}),
                        ),
                      )
                      .toList(),
                ),
              ],
            ),
          ),
        ),
      ),
      'animal-bookshelf',
      size: const Size(1100, 1350),
    );
  });
  testWidgets('render login and registration forms', (tester) async {
    await capture(
      tester,
      const LoginPage(),
      'account-login',
      size: const Size(650, 1200),
      accounts: true,
    );
    await capture(
      tester,
      const RegisterPage(),
      'account-register',
      size: const Size(650, 1580),
      accounts: true,
    );
  });
  testWidgets('render Grade 6 lesson', (tester) async {
    final lesson = DemoLearningRepository().materials.firstWhere(
      (m) =>
          m['kind'] == 'lesson' &&
          m['grade_level'] == 6 &&
          '${m['source_label']}'.contains('grade pathways'),
    );
    await capture(
      tester,
      MaterialReader(
        material: lesson,
        session: StudentSession(
          token: 'render-only',
          child: {
            'id': 'render-only',
            'preferences': {'sound': false},
          },
        ),
      ),
      'grade-six-lesson',
    );
  });
  testWidgets('render actual A–D quiz controls', (tester) async {
    final demo = DemoLearningRepository();
    final quiz = demo.materials.firstWhere(
      (m) => m['kind'] == 'quiz' && m['grade_level'] == 1,
    );
    await capture(
      tester,
      MaterialReader(
        material: quiz,
        session: StudentSession(
          token: 'render-only',
          child: {
            'id': 'render-only',
            'preferences': {'sound': false},
          },
        ),
      ),
      'animal-quiz',
    );
  });
  testWidgets('render actual illustrated bilingual story reader', (
    tester,
  ) async {
    final story = DemoLearningRepository().materials.firstWhere(
      (m) => m['kind'] == 'story' && m['grade_level'] == 1,
    );
    await capture(
      tester,
      MaterialReader(
        material: story,
        session: StudentSession(
          token: 'render-only',
          child: {
            'id': 'render-only',
            'preferences': {'sound': false},
          },
        ),
      ),
      'animal-story',
    );
  });
}
