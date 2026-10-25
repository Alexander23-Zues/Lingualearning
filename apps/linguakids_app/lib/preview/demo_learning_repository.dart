import 'dart:convert';

import 'package:uuid/uuid.dart';

import '../features/learning/learning_data.dart';
import 'animal_collection_data.dart';
import 'grade_collection_data.dart';

class DemoLearningRepository implements LearningRepository, StudentRepository {
  DemoLearningRepository() {
    for (var grade = 1; grade <= 6; grade++) {
      final pairs = [
        {'en': 'sun', 'fil': 'araw'},
        {'en': 'book', 'fil': 'aklat'},
        {'en': 'water', 'fil': 'tubig'},
        {'en': 'tree', 'fil': 'puno'},
      ];
      for (final kind in ['lesson', 'dictionary', 'game', 'story', 'quiz']) {
        final id = const Uuid().v4();
        final q = const Uuid().v4(),
            a = const Uuid().v4(),
            b = const Uuid().v4();
        final body =
            <String, dynamic>{
                  'lesson': {
                    'english':
                        'Hello! We learn together. Say please when you ask for help. Say thank you when someone helps you.',
                    'filipino':
                        'Kumusta! Sabay tayong matuto. Magsabi ng pakiusap kapag humihingi ng tulong. Magsabi ng salamat kapag may tumutulong sa iyo.',
                  },
                  'dictionary': {'pairs': pairs},
                  'game': {'pairs': pairs},
                  'story': {
                    'pages': [
                      {
                        'english': 'The sun is bright. A friend brings a book.',
                        'filipino':
                            'Maliwanag ang araw. May dalang aklat ang isang kaibigan.',
                        'illustration': 'sun',
                      },
                      {
                        'english': 'We read together under a tree.',
                        'filipino': 'Sabay kaming nagbasa sa ilalim ng puno.',
                        'illustration': 'tree',
                      },
                    ],
                  },
                  'quiz': {
                    'questions': [
                      {
                        'id': q,
                        'prompt': 'Which word means book?',
                        'options': [
                          {'id': a, 'text': 'aklat'},
                          {'id': b, 'text': 'tubig'},
                        ],
                      },
                    ],
                  },
                }[kind]
                as Json;
        materials.add({
          'id': id,
          'owner_id': null,
          'kind': kind,
          'title': const {
            'lesson': 'Hello, learning friends!',
            'dictionary': 'My first everyday words',
            'game': 'Match the everyday words',
            'story': 'A book under the tree',
            'quiz': 'Everyday word check',
          }[kind],
          'grade_level': grade,
          'learning_level': 'beginner',
          'summary': 'Original bilingual starter activity.',
          'source_label': 'Demo · original supplemental enrichment',
          'body': body,
          'status': 'published',
          'version': 1,
          'updated_at': DateTime.now().toIso8601String(),
        });
        if (kind == 'quiz') keys[id] = {q: a};
      }
    }
    materials.removeWhere((m) => ['quiz', 'game', 'story'].contains(m['kind']));
    materials.addAll(
      jsonRows(
        jsonDecode(animalPreviewMaterialsJson),
      ).map((m) => {...m, 'updated_at': DateTime.now().toIso8601String()}),
    );
    keys.addAll(
      (jsonDecode(animalPreviewAnswerKeysJson) as Map).map(
        (key, value) =>
            MapEntry(key as String, Map<String, dynamic>.from(value as Map)),
      ),
    );
    materials.addAll(
      jsonRows(
        jsonDecode(gradePreviewMaterialsJson),
      ).map((m) => {...m, 'updated_at': DateTime.now().toIso8601String()}),
    );
    keys.addAll(
      (jsonDecode(gradePreviewAnswerKeysJson) as Map).map(
        (key, value) =>
            MapEntry(key as String, Map<String, dynamic>.from(value as Map)),
      ),
    );
    children.add({
      'id': const Uuid().v4(),
      'adult_id': 'preview-educator',
      'nickname': 'Luna',
      'avatar_key': 'owl',
      'grade_level': 1,
      'learning_level': 'beginner',
      'preferences': {
        'language': 'bilingual',
        'sound': true,
        'reduced_motion': false,
      },
      'active': true,
    });
  }
  final materials = <Json>[],
      records = <Json>[],
      children = <Json>[],
      attempts = <Json>[];
  final keys = <String, Json>{}, sessions = <String, String>{};
  final saved = <String, Set<String>>{};
  final educators = <Json>[
    {
      'id': 'preview-educator',
      'name': 'Preview Educator',
      'email': 'educator@example.invalid',
      'role': 'educator',
      'status': 'active',
    },
    {
      'id': 'preview-administrator',
      'name': 'Preview Administrator',
      'email': 'admin@example.invalid',
      'role': 'administrator',
      'status': 'active',
    },
  ];
  Json prefs = {
    'locale': 'en',
    'text_scale': 1.0,
    'muted': false,
    'reduced_motion': false,
  };
  @override
  bool get isPreview => true;
  @override
  Future<void> close(StudentSession session) async {
    sessions.remove(session.token);
  }

  @override
  Future<Json> snapshot() async =>
      jsonDecode(
            jsonEncode({
              'materials': materials,
              'records': records,
              'children': children,
              'attempts': attempts,
              'educators': educators,
              'models': [],
              'active_model': null,
            }),
          )
          as Json;
  @override
  Future<Json> preferences() async => prefs;
  @override
  Future<void> savePreferences(Json preferences) async {
    prefs = {...prefs, ...preferences};
  }

  @override
  Future<dynamic> call(String name, Json parameters) async {
    switch (name) {
      case 'save_learning_material':
        final id = parameters['p_id'] as String? ?? const Uuid().v4();
        final value = Map<String, dynamic>.from(parameters['p_data'] as Map);
        final body = Map<String, dynamic>.from(value['body'] as Map);
        if (value['kind'] == 'quiz') {
          keys[id] = {
            for (final q in jsonRows(body['questions']))
              q['id'] as String: q['correct_option_id'],
          };
          body['questions'] = jsonRows(body['questions'])
              .map(
                (q) =>
                    Map<String, dynamic>.from(q)..remove('correct_option_id'),
              )
              .toList();
        }
        final previous = materials.where((m) => m['id'] == id).firstOrNull;
        materials.removeWhere((m) => m['id'] == id);
        materials.insert(0, {
          ...value,
          'id': id,
          'body': body,
          'owner_id': previous?['owner_id'] ?? 'preview-educator',
          'version': (previous?['version'] as num? ?? 0) + 1,
          'source_label': 'Demo · original enrichment',
          'updated_at': DateTime.now().toIso8601String(),
        });
        return id;
      case 'learning_material_editor':
        final value =
            jsonDecode(
                  jsonEncode(
                    materials.firstWhere((m) => m['id'] == parameters['p_id']),
                  ),
                )
                as Json;
        if (value['kind'] == 'quiz') {
          final body = value['body'] as Map;
          body['questions'] = jsonRows(body['questions'])
              .map(
                (q) => {...q, 'correct_option_id': keys[value['id']]?[q['id']]},
              )
              .toList();
        }
        return value;
      case 'save_workspace_record':
        final id = parameters['p_id'] as String? ?? const Uuid().v4();
        records.removeWhere((r) => r['id'] == id);
        records.insert(0, {
          ...Map<String, dynamic>.from(parameters['p_data'] as Map),
          'id': id,
          'owner_id': 'preview-educator',
          'updated_at': DateTime.now().toIso8601String(),
        });
        return id;
      case 'save_child_profile':
        final data = Map<String, dynamic>.from(parameters['p_data'] as Map);
        if (data.keys.any(
          (k) => ![
            'nickname',
            'avatar_key',
            'grade_level',
            'learning_level',
            'preferences',
            'active',
          ].contains(k),
        )) {
          throw Exception('Only minimal child profile fields are allowed.');
        }
        final id = parameters['p_id'] as String? ?? const Uuid().v4();
        children.removeWhere((c) => c['id'] == id);
        children.add({...data, 'id': id, 'adult_id': 'preview-educator'});
        return id;
      case 'open_child_session':
        final child = children.firstWhere(
          (c) => c['id'] == parameters['p_child_id'],
        );
        final token = const Uuid().v4();
        sessions[token] = child['id'] as String;
        return {'token': token, 'child': child, 'expires_in': 7200};
      case 'admin_update_educator':
        educators.firstWhere((e) => e['id'] == parameters['p_id'])['status'] =
            parameters['p_status'];
        return null;
      default:
        throw Exception('This action is unavailable in the local preview.');
    }
  }

  @override
  Future<Json> load(StudentSession session) async {
    if (sessions[session.token] != session.id) {
      throw Exception('Reopen this preview profile with an adult.');
    }
    final own = attempts.where((a) => a['child_id'] == session.id).toList();
    final count = own.map((a) => a['material_id']).toSet().length;
    final stars = own.fold<num>(0, (sum, a) => sum + (a['stars'] as num));
    return {
      'child': session.child,
      'materials': materials
          .where(
            (m) =>
                m['grade_level'] == session.child['grade_level'] &&
                ['published', 'classroom'].contains(m['status']),
          )
          .toList(),
      'attempts': own,
      'saved_vocabulary': (saved[session.id] ?? {}).toList(),
      'stars': stars,
      'completed': count,
      'badges': [
        if (count > 0) 'First steps',
        if (count >= 5) 'Learning explorer',
        if (stars >= 15) 'Star collector',
        if ((saved[session.id]?.length ?? 0) >= 3) 'Word collector',
      ],
      'active_model': null,
    };
  }

  @override
  Future<Json> complete(
    StudentSession session,
    Json material,
    Json answers,
  ) async {
    await load(session);
    var correct = 1, total = 1, stars = 1;
    if (material['kind'] == 'quiz') {
      final key = keys[material['id']]!;
      total = key.length;
      correct = key.entries.where((e) => answers[e.key] == e.value).length;
      stars = correct == total
          ? 3
          : correct * 2 >= total
          ? 2
          : 1;
    }
    if (material['kind'] == 'game') {
      final pairs = jsonRows((material['body'] as Map)['pairs']);
      total = pairs.length;
      correct = pairs.where((p) => answers[p['en']] == p['fil']).length;
      if (correct != total) {
        throw Exception('Match every pair before completing the game.');
      }
      stars = 2;
    }
    if (attempts.any(
      (a) => a['child_id'] == session.id && a['material_id'] == material['id'],
    )) {
      stars = 0;
    }
    final result = {
      'id': const Uuid().v4(),
      'child_id': session.id,
      'material_id': material['id'],
      'correct_count': correct,
      'total_count': total,
      'stars': stars,
      'completed_at': DateTime.now().toIso8601String(),
    };
    attempts.insert(0, result);
    return result;
  }

  @override
  Future<void> saveWord(StudentSession session, String materialId) async {
    await load(session);
    saved.putIfAbsent(session.id, () => {}).add(materialId);
  }

  @override
  Future<String> translate(
    StudentSession session,
    String text,
    String source,
  ) async => throw Exception('No trained model is active in the preview.');
}
