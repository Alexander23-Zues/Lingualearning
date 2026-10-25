import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:linguakids_app/features/learning/learning_data.dart';
import 'package:linguakids_app/features/learning/material_reader.dart';
import 'package:linguakids_app/preview/demo_learning_repository.dart';

void main() {
  test(
    'six different grade pathways contain linked complete lessons, quizzes and games',
    () {
      final demo = DemoLearningRepository();
      final all = demo.materials
          .where((m) => '${m['source_label']}'.contains('grade pathways'))
          .toList();
      expect(all.length, 54);
      expect(all.map((m) => m['title']).toSet().length, 54);
      for (var grade = 1; grade <= 6; grade++) {
        final group = all.where((m) => m['grade_level'] == grade);
        for (final kind in ['lesson', 'quiz', 'game']) {
          expect(group.where((m) => m['kind'] == kind).length, 3);
        }
        for (final m in group) {
          final body = m['body'] as Map;
          if (m['kind'] == 'lesson') {
            final pages = jsonRows(body['pages']);
            expect(pages.length, 4);
            for (final p in pages) {
              expect(p['english'], isNotEmpty);
              expect(p['filipino'], isNotEmpty);
            }
          } else if (m['kind'] == 'quiz') {
            final questions = jsonRows(body['questions']);
            expect(questions.length, 6);
            for (final q in questions) {
              final options = jsonRows(q['options']);
              expect(options.length, 4);
              expect(options.map((o) => o['text']).toSet().length, 4);
              expect(
                options.any((o) => o['id'] == demo.keys[m['id']]![q['id']]),
                isTrue,
              );
            }
          } else {
            expect(jsonRows(body['pairs']).length, 4);
          }
        }
      }
      final public = jsonDecode(
        File('assets/content/grade_collection.json').readAsStringSync(),
      );
      expect(jsonEncode(public).contains('answer_key'), isFalse);
      expect(jsonEncode(public).contains('correct_option_id'), isFalse);
    },
  );
  testWidgets('lesson pages advance to the final practice before completion', (
    tester,
  ) async {
    final demo = DemoLearningRepository();
    final lesson = demo.materials.firstWhere(
      (m) =>
          m['kind'] == 'lesson' &&
          '${m['source_label']}'.contains('grade pathways'),
    );
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(home: MaterialReader(material: lesson)),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Page 1 of 4'), findsOneWidget);
    expect(find.text('Finish lesson'), findsNothing);
    for (var i = 0; i < 3; i++) {
      await tester.tap(find.text('Next page'));
      await tester.pumpAndSettle();
    }
    expect(find.text('Page 4 of 4'), findsOneWidget);
    expect(find.text('Finish lesson'), findsOneWidget);
    await tester.tap(find.text('Back'));
    await tester.pumpAndSettle();
    expect(find.text('Page 3 of 4'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
