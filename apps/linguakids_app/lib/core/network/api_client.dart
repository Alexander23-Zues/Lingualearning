import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:supabase_flutter/supabase_flutter.dart';

import '../config/app_config.dart';

class ApiException implements Exception {
  const ApiException(this.message, [this.statusCode]);
  final String message;
  final int? statusCode;
  @override
  String toString() => message;
}

class ApiClient {
  ApiClient({http.Client? client}) : _client = client ?? http.Client();
  final http.Client _client;

  Future<Map<String, String>> _headers() async {
    final session = Supabase.instance.client.auth.currentSession;
    if (session == null) throw const ApiException('Your session has expired.', 401);
    return {
      'Authorization': 'Bearer ${session.accessToken}',
      'Content-Type': 'application/json',
    };
  }

  Future<dynamic> get(String path, {Map<String, String> headers = const {}}) async {
    final requestHeaders = await _headers();
    requestHeaders.addAll(headers);
    final response = await _client
        .get(Uri.parse('${AppConfig.apiBaseUrl}$path'), headers: requestHeaders)
        .timeout(const Duration(seconds: 15));
    return _decode(response);
  }

  Future<dynamic> post(
    String path,
    Map<String, dynamic> body, {
    Map<String, String> headers = const {},
  }) async {
    final requestHeaders = await _headers();
    requestHeaders.addAll(headers);
    final response = await _client
        .post(
          Uri.parse('${AppConfig.apiBaseUrl}$path'),
          headers: requestHeaders,
          body: jsonEncode(body),
        )
        .timeout(const Duration(seconds: 20));
    return _decode(response);
  }

  dynamic _decode(http.Response response) {
    final decoded = response.body.isEmpty ? null : jsonDecode(response.body);
    if (response.statusCode >= 400) {
      throw ApiException(
        decoded is Map ? decoded['detail']?.toString() ?? 'Request failed.' : 'Request failed.',
        response.statusCode,
      );
    }
    return decoded;
  }
}
