import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:linguakids_app/features/learning/learning_data.dart';
import 'package:linguakids_app/features/learning/material_reader.dart';
import 'package:linguakids_app/features/learning/story_art.dart';
import 'package:linguakids_app/preview/demo_learning_repository.dart';

void main() {
  Future<StudentSession> sessionFor(DemoLearningRepository demo) async {
    final opened = await demo.call('open_child_session', {
      'p_child_id': demo.children.first['id'],
    });
    final child = Map<String, dynamic>.from(opened['child'] as Map);
    child['preferences'] = {
      'language': 'bilingual',
      'sound': false,
      'reduced_motion': true,
    };
    return StudentSession(token: opened['token'] as String, child: child);
  }

  Future<void> mount(
    WidgetTester tester,
    DemoLearningRepository demo,
    Json material,
    StudentSession session,
  ) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [studentRepositoryProvider.overrideWith((ref) => demo)],
        child: MaterialApp(
          home: MaterialReader(material: material, session: session),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  Finder button(String text) => find.widgetWithText(FilledButton, text);
  test(
    'all six grades have four ten-page illustrated books, four A–D quizzes, and four games',
    () {
      final demo = DemoLearningRepository();
      for (var grade = 1; grade <= 6; grade++) {
        final materials = demo.materials
            .where(
              (m) =>
                  m['grade_level'] == grade &&
                  '${m['source_label']}'.contains('animal adventures'),
            )
            .toList();
        for (final kind in ['story', 'quiz', 'game']) {
          expect(materials.where((m) => m['kind'] == kind).length, 4);
        }
        for (final story in materials.where((m) => m['kind'] == 'story')) {
          final pages = jsonRows((story['body'] as Map)['pages']);
          expect(pages.length, 10);
          expect(pages.map((p) => p['scene']).toSet().length, 4);
          for (final page in pages) {
            expect(
              (page['english'] as String).split(' ').length,
              greaterThan(20),
            );
            expect(
              (page['filipino'] as String).split(' ').length,
              greaterThan(20),
            );
          }
        }
        for (final quiz in materials.where((m) => m['kind'] == 'quiz')) {
          final questions = jsonRows((quiz['body'] as Map)['questions']);
          expect(questions.length, 6);
          final positions = <int>{};
          for (final q in questions) {
            final options = jsonRows(q['options']);
            expect(options.length, 4);
            expect(options.map((o) => o['text']).toSet().length, 4);
            expect(q.containsKey('correct_option_id'), isFalse);
            positions.add(
              options.indexWhere(
                (o) => o['id'] == demo.keys[quiz['id']]![q['id']],
              ),
            );
          }
          expect(positions.length, 4);
        }
      }
    },
  );
  testWidgets(
    'large A–D choices keep answers when moving back and submit a six-question quiz',
    (tester) async {
      final demo = DemoLearningRepository();
      final ownSession = await sessionFor(demo);
      final quiz = demo.materials.firstWhere(
        (m) => m['kind'] == 'quiz' && m['grade_level'] == 1,
      );
      await mount(tester, demo, quiz, ownSession);
      expect(
        tester.widget<FilledButton>(button('Next question')).onPressed,
        isNull,
      );
      final qs = jsonRows((quiz['body'] as Map)['questions']);
      for (var index = 0; index < qs.length; index++) {
        expect(find.text('Question ${index + 1} of 6'), findsOneWidget);
        final options = jsonRows(qs[index]['options']);
        final correct = options.firstWhere(
          (o) => o['id'] == demo.keys[quiz['id']]![qs[index]['id']],
        );
        final choice = find.byWidgetPredicate(
          (w) => w is KidChoiceButton && w.text == correct['text'],
        );
        await Scrollable.ensureVisible(tester.element(choice), alignment: .35);
        await tester.pumpAndSettle();
        await tester.tap(choice);
        await tester.pumpAndSettle();
        if (index == 0) {
          expect(find.byType(KidChoiceButton), findsNWidgets(4));
        }
        if (index < qs.length - 1) {
          await tester.tap(button('Next question'));
          await tester.pumpAndSettle();
        }
      }
      await tester.tap(find.widgetWithText(OutlinedButton, 'Back'));
      await tester.pumpAndSettle();
      expect(
        tester
            .widgetList<KidChoiceButton>(find.byType(KidChoiceButton))
            .where((w) => w.selected)
            .length,
        1,
      );
      await tester.tap(button('Next question'));
      await tester.pumpAndSettle();
      await tester.tap(button('Check answers'));
      await tester.pumpAndSettle();
      expect(find.textContaining('6 of 6 correct!'), findsOneWidget);
      expect(demo.attempts.single['stars'], 3);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'games use buttons, encourage retry, and unlock the next match only after a correct pair',
    (tester) async {
      final demo = DemoLearningRepository();
      final session = await sessionFor(demo);
      final game = demo.materials.firstWhere(
        (m) => m['kind'] == 'game' && m['grade_level'] == 1,
      );
      await mount(tester, demo, game, session);
      expect(find.byType(DropdownButtonFormField<String>), findsNothing);
      final pairs = jsonRows((game['body'] as Map)['pairs']);
      final wrong = find
          .byWidgetPredicate(
            (w) => w is KidChoiceButton && w.text != pairs.first['fil'],
          )
          .first;
      await Scrollable.ensureVisible(tester.element(wrong), alignment: .35);
      await tester.pumpAndSettle();
      await tester.tap(wrong);
      await tester.pumpAndSettle();
      expect(
        tester.widget<FilledButton>(button('Next match')).onPressed,
        isNull,
      );
      expect(
        tester
            .widgetList<KidChoiceButton>(find.byType(KidChoiceButton))
            .any((w) => w.selected),
        isFalse,
      );
      for (var i = 0; i < pairs.length; i++) {
        final choice = find.byWidgetPredicate(
          (w) => w is KidChoiceButton && w.text == pairs[i]['fil'],
        );
        await Scrollable.ensureVisible(tester.element(choice), alignment: .35);
        await tester.pumpAndSettle();
        await tester.tap(choice);
        await tester.pumpAndSettle();
        if (i < pairs.length - 1) {
          await tester.tap(button('Next match'));
          await tester.pumpAndSettle();
        }
      }
      await tester.tap(button('Finish activity'));
      await tester.pumpAndSettle();
      expect(demo.attempts.single['stars'], 2);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'storybook has ten illustrated bilingual pages and cannot finish early',
    (tester) async {
      final demo = DemoLearningRepository();
      final session = await sessionFor(demo);
      final story = demo.materials.firstWhere(
        (m) => m['kind'] == 'story' && m['grade_level'] == 1,
      );
      await mount(tester, demo, story, session);
      expect(find.byType(AnimalScene), findsOneWidget);
      expect(find.text('Finish story'), findsNothing);
      for (var i = 0; i < 9; i++) {
        expect(find.text('Page ${i + 1} of 10'), findsOneWidget);
        await tester.tap(button('Next page'));
        await tester.pumpAndSettle();
      }
      expect(find.text('Page 10 of 10'), findsOneWidget);
      await tester.tap(button('Finish story'));
      await tester.pumpAndSettle();
      expect(demo.attempts.single['stars'], 1);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'colorful book covers keep their full title and open button on a narrow screen',
    (tester) async {
      final story = DemoLearningRepository().materials.firstWhere(
        (m) => m['kind'] == 'story',
      );
      var opened = false;
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: StoryBookCover(
                  material: story,
                  onOpen: () => opened = true,
                ),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('${story['title']}'), findsOneWidget);
      await tester.ensureVisible(find.text('Read this book'));
      await tester.tap(find.text('Read this book'));
      expect(opened, isTrue);
      expect(tester.takeException(), isNull);
    },
  );
  test(
    'public content asset and live entry do not expose preview answer keys',
    () {
      final demo = DemoLearningRepository();
      final publicMaterials = demo.materials
          .map((m) => jsonDecode(jsonEncode(m)))
          .toList();
      expect(jsonEncode(publicMaterials), isNot(contains('correct_option_id')));
      expect(jsonEncode(publicMaterials), isNot(contains('answer_key')));
    },
  );
}
