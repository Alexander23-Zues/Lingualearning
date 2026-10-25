import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:uuid/uuid.dart';

import '../../core/config/app_config.dart';
import '../auth/presentation/auth_controller.dart';

typedef Json = Map<String, dynamic>;
List<Json> jsonRows(dynamic value) => (value as List? ?? [])
    .map((e) => Map<String, dynamic>.from(e as Map))
    .toList();

// Once the expanded original collection is installed, its shelves supersede the
// three early sample cards. No database records or learning history are removed.
List<Json> learningShelfMaterials(dynamic value) {
  final rows = jsonRows(value);
  return rows.where((m) {
    final old =
        m['owner_id'] == null &&
        m['source_label'] ==
            'LinguaKids original starter · supplemental enrichment' &&
        [
          'A book under the tree',
          'Everyday word check',
          'Match the everyday words',
        ].contains(m['title']);
    return !old ||
        !rows.any(
          (newItem) =>
              newItem['kind'] == m['kind'] &&
              newItem['grade_level'] == m['grade_level'] &&
              '${newItem['source_label']}'.contains('animal adventures'),
        );
  }).toList();
}

const learningKinds = [
  'lesson',
  'dictionary',
  'game',
  'quiz',
  'story',
  'vocabulary',
];
const avatarKeys = ['tarsier', 'owl', 'turtle', 'butterfly', 'cat', 'star'];
const learningLevels = ['beginner', 'developing', 'independent'];
const avatarIcons = <String, IconData>{
  'tarsier': Icons.pets_rounded,
  'owl': Icons.school_rounded,
  'turtle': Icons.nature_rounded,
  'butterfly': Icons.flutter_dash_rounded,
  'cat': Icons.pets_rounded,
  'star': Icons.star_rounded,
};
const materialIcons = <String, IconData>{
  'lesson': Icons.menu_book_rounded,
  'dictionary': Icons.spellcheck_rounded,
  'game': Icons.extension_rounded,
  'quiz': Icons.quiz_rounded,
  'story': Icons.auto_stories_rounded,
  'vocabulary': Icons.style_rounded,
};

final learningRepositoryProvider = Provider<LearningRepository>(
  (ref) => SupabaseLearningRepository(Supabase.instance.client),
);
final workspaceSnapshotProvider = FutureProvider<Json>((ref) {
  ref.watch(authControllerProvider.select((value) => value.value?.id));
  return ref.watch(learningRepositoryProvider).snapshot();
});
final studentRepositoryProvider = Provider<StudentRepository>(
  (ref) => ScopedStudentRepository(),
);
final studentSessionProvider =
    NotifierProvider<StudentSessionController, StudentSession?>(
      StudentSessionController.new,
    );
final adultLockProvider = NotifierProvider<AdultLockController, bool>(
  AdultLockController.new,
);

abstract interface class LearningRepository {
  bool get isPreview;
  Future<Json> snapshot();
  Future<dynamic> call(String name, Json parameters);
  Future<Json> preferences();
  Future<void> savePreferences(Json preferences);
}

class SupabaseLearningRepository implements LearningRepository {
  SupabaseLearningRepository(this.client);
  final SupabaseClient client;
  @override
  bool get isPreview => false;
  @override
  Future<Json> snapshot() async {
    final viewerId = client.auth.currentUser?.id;
    if (viewerId == null) {
      throw const AuthException('Log in to open your workspace.');
    }
    try {
      final result = Map<String, dynamic>.from(
        await client.rpc('workspace_snapshot') as Map,
      );
      final materials = jsonRows(result['materials']);
      await LearningCache.save('adult.$viewerId', {
        'materials': materials,
        'records': [],
        'children': [],
        'attempts': [],
        'educators': [],
        'models': [],
        'offline': true,
      });
      return result;
    } on http.ClientException {
      return _offline(viewerId);
    } catch (error) {
      if (error.toString().contains('Failed to fetch') ||
          error.toString().contains('SocketException')) {
        return _offline(viewerId);
      }
      rethrow;
    }
  }

  Future<Json> _offline(String viewerId) async =>
      await LearningCache.read('adult.$viewerId') ??
      (throw Exception('Connect to load your workspace for the first time.'));
  @override
  Future<dynamic> call(String name, Json parameters) =>
      client.rpc(name, params: parameters);
  @override
  Future<Json> preferences() async => Map<String, dynamic>.from(
    await client
        .from('educator_preferences')
        .select()
        .eq('educator_id', client.auth.currentUser!.id)
        .single(),
  );
  @override
  Future<void> savePreferences(Json preferences) async {
    await client
        .from('educator_preferences')
        .update(preferences)
        .eq('educator_id', client.auth.currentUser!.id);
  }
}

class LearningCache {
  static Future<void> save(String scope, Json value) async {
    await (await SharedPreferences.getInstance()).setString(
      'linguakids.content.$scope',
      jsonEncode(value),
    );
  }

  static Future<Json?> read(String scope) async {
    final raw = (await SharedPreferences.getInstance()).getString(
      'linguakids.content.$scope',
    );
    return raw == null
        ? null
        : Map<String, dynamic>.from(jsonDecode(raw) as Map);
  }

  static Future<void> clear(String scope) async =>
      (await SharedPreferences.getInstance()).remove(
        'linguakids.content.$scope',
      );
}

class StudentSession {
  const StudentSession({required this.token, required this.child});
  final String token;
  final Json child;
  String get id => child['id'] as String;
}

class StudentSessionController extends Notifier<StudentSession?> {
  @override
  StudentSession? build() => null;
  void open(Json result) => state = StudentSession(
    token: result['token'] as String,
    child: Map<String, dynamic>.from(result['child'] as Map),
  );
  void clear() => state = null;
}

class AdultLockController extends Notifier<bool> {
  AdultLockController({this.initial = false});
  final bool initial;
  @override
  bool build() => initial;
  Future<void> setLocked(bool locked) async {
    await (await SharedPreferences.getInstance()).setBool(
      'linguakids.adult_locked',
      locked,
    );
    state = locked;
  }
}

abstract interface class StudentRepository {
  Future<void> close(StudentSession session);
  Future<Json> load(StudentSession session);
  Future<Json> complete(StudentSession session, Json material, Json answers);
  Future<void> saveWord(StudentSession session, String materialId);
  Future<String> translate(StudentSession session, String text, String source);
}

class StudentSessionExpired implements Exception {
  @override
  String toString() => 'Ask an adult to reopen your learning profile.';
}

class ScopedStudentRepository implements StudentRepository {
  ScopedStudentRepository({
    http.Client? client,
    String? supabaseUrl,
    String? publishableKey,
  }) : _client = client ?? http.Client(),
       _baseUrl = supabaseUrl ?? AppConfig.supabaseUrl,
       _publishableKey = publishableKey ?? AppConfig.supabasePublishableKey;
  final http.Client _client;
  final String _baseUrl, _publishableKey;
  @override
  Future<void> close(StudentSession session) async {
    await _rpc('close_child_session', {'p_token': session.token});
  }

  // Child requests deliberately carry only the scoped learning token, never the adult's JWT.
  Future<dynamic> _rpc(String name, Json body) async {
    final response = await _client
        .post(
          Uri.parse('$_baseUrl/rest/v1/rpc/$name'),
          headers: {
            'apikey': _publishableKey,
            'Content-Type': 'application/json',
          },
          body: jsonEncode(body),
        )
        .timeout(const Duration(seconds: 20));
    final result = response.body.isEmpty ? null : jsonDecode(response.body);
    if (response.statusCode == 401 || response.statusCode == 403) {
      throw StudentSessionExpired();
    }
    if (response.statusCode >= 400) {
      throw Exception(
        result is Map
            ? result['message'] ?? 'Please ask an adult for help.'
            : 'Please ask an adult for help.',
      );
    }
    return result;
  }

  @override
  Future<Json> load(StudentSession session) async {
    final data = Map<String, dynamic>.from(
      await _rpc('student_learning_state', {'p_token': session.token}) as Map,
    );
    final pending = await LearningCache.read('pending.${session.id}');
    if (pending != null) {
      final remaining = <Json>[];
      for (final submission in jsonRows(pending['items'])) {
        try {
          await _rpc('student_complete_material', {
            'p_token': session.token,
            ...submission,
          });
        } catch (_) {
          remaining.add(submission);
        }
      }
      await LearningCache.save('pending.${session.id}', {'items': remaining});
      if (remaining.length != jsonRows(pending['items']).length) {
        return Map<String, dynamic>.from(
          await _rpc('student_learning_state', {'p_token': session.token})
              as Map,
        );
      }
    }
    return data;
  }

  @override
  Future<Json> complete(
    StudentSession session,
    Json material,
    Json answers,
  ) async {
    final submission = {
      'p_material_id': material['id'],
      'p_version': material['version'],
      'p_submission_id': const Uuid().v4(),
      'p_answers': answers,
    };
    try {
      return Map<String, dynamic>.from(
        await _rpc('student_complete_material', {
              'p_token': session.token,
              ...submission,
            })
            as Map,
      );
    } on http.ClientException {
      return _queue(session, submission);
    } catch (error) {
      if (error.toString().contains('Failed to fetch') ||
          error.toString().contains('SocketException')) {
        return _queue(session, submission);
      }
      rethrow;
    }
  }

  Future<Json> _queue(StudentSession session, Json submission) async {
    final pending = await LearningCache.read('pending.${session.id}');
    await LearningCache.save('pending.${session.id}', {
      'items': [...jsonRows(pending?['items']), submission],
    });
    return {'pending': true};
  }

  @override
  Future<void> saveWord(StudentSession session, String materialId) async {
    await _rpc('student_save_vocabulary', {
      'p_token': session.token,
      'p_material_id': materialId,
    });
  }

  @override
  Future<String> translate(
    StudentSession session,
    String text,
    String source,
  ) async {
    final response = await _client
        .post(
          Uri.parse('${AppConfig.apiBaseUrl}/v1/student-translation'),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({
            'student_token': session.token,
            'text': text,
            'source_language': source,
            'target_language': source == 'en' ? 'fil' : 'en',
          }),
        )
        .timeout(const Duration(seconds: 25));
    final result = jsonDecode(response.body) as Map;
    if (response.statusCode >= 400) {
      throw Exception(result['detail'] ?? 'Translation is unavailable.');
    }
    return result['translation'] as String;
  }
}

String friendlyError(Object error) => error is PostgrestException
    ? error.message
    : error.toString().replaceFirst('Exception: ', '');
