import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

final auditRepositoryProvider = Provider<AuditRepository>(
  (ref) => SupabaseAuditRepository(Supabase.instance.client),
);

abstract interface class AuditRepository {
  bool get isPreview;
  Future<List<AuditEntry>> load();
}

class AuditEntry {
  const AuditEntry({
    required this.id,
    required this.action,
    required this.entityType,
    required this.occurredAt,
    required this.actorName,
    required this.actorEmail,
    required this.metadata,
    this.entityId,
  });

  final String id;
  final String action;
  final String entityType;
  final String? entityId;
  final DateTime occurredAt;
  final String actorName;
  final String actorEmail;
  final Map<String, dynamic> metadata;

  factory AuditEntry.fromJson(Map<String, dynamic> json) {
    final actor = json['actor'] as Map<String, dynamic>?;
    return AuditEntry(
      id: '${json['id']}',
      action: json['action'] as String,
      entityType: json['entity_type'] as String,
      entityId: json['entity_id'] as String?,
      occurredAt: DateTime.parse(json['occurred_at'] as String),
      actorName: actor?['name'] as String? ?? 'System setup',
      actorEmail: actor?['email'] as String? ?? '',
      metadata: Map<String, dynamic>.from(json['metadata'] as Map? ?? const {}),
    );
  }
}

class SupabaseAuditRepository implements AuditRepository {
  SupabaseAuditRepository(this.client);
  final SupabaseClient client;

  @override
  bool get isPreview => false;

  @override
  Future<List<AuditEntry>> load() async {
    // The database's RLS permits only active administrators to read these rows.
    final rows = await client
        .from('audit_logs')
        .select(
          'id,action,entity_type,entity_id,metadata,occurred_at,actor:profiles(name,email)',
        )
        .order('occurred_at', ascending: false)
        .limit(200);
    return rows.map(AuditEntry.fromJson).toList();
  }
}

class PreviewAuditRepository implements AuditRepository {
  @override
  bool get isPreview => true;

  @override
  Future<List<AuditEntry>> load() async => const [];
}
