import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:path/path.dart' as path;
import 'package:path_provider/path_provider.dart';
import 'package:sqflite/sqflite.dart';
import 'package:uuid/uuid.dart';

class OfflineRepository {
  Database? _database;

  Future<Database> get database async {
    if (kIsWeb) {
      throw UnsupportedError('SQLite offline downloads are available in the Android application.');
    }
    return _database ??= await _open();
  }

  Future<Database> _open() async {
    final directory = await getApplicationSupportDirectory();
    return openDatabase(
      path.join(directory.path, 'linguakids_offline.db'),
      version: 1,
      onConfigure: (database) => database.execute('PRAGMA foreign_keys = ON'),
      onCreate: (database, version) async {
        await database.execute('''
          CREATE TABLE offline_resources (
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            content_version TEXT NOT NULL,
            payload TEXT NOT NULL,
            checksum_sha256 TEXT NOT NULL,
            downloaded_at TEXT NOT NULL,
            PRIMARY KEY (entity_type, entity_id)
          )
        ''');
        await database.execute('''
          CREATE TABLE sync_queue (
            event_id TEXT PRIMARY KEY,
            payload TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            attempt_count INTEGER NOT NULL DEFAULT 0,
            last_error TEXT,
            created_at TEXT NOT NULL
          )
        ''');
      },
    );
  }

  Future<void> saveVerifiedResource({
    required String entityType,
    required String entityId,
    required String contentVersion,
    required Uint8List bytes,
    required String expectedChecksum,
  }) async {
    final actualChecksum = sha256.convert(bytes).toString();
    if (actualChecksum != expectedChecksum.toLowerCase()) {
      throw const FormatException('Downloaded resource failed its integrity check.');
    }
    final db = await database;
    await db.insert(
      'offline_resources',
      {
        'entity_type': entityType,
        'entity_id': entityId,
        'content_version': contentVersion,
        'payload': base64Encode(bytes),
        'checksum_sha256': actualChecksum,
        'downloaded_at': DateTime.now().toUtc().toIso8601String(),
      },
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<void> cancelDownload(String entityType, String entityId) async {
    final db = await database;
    await db.delete(
      'offline_resources',
      where: 'entity_type = ? AND entity_id = ?',
      whereArgs: [entityType, entityId],
    );
  }

  Future<String> queueSession(Map<String, dynamic> session) async {
    final db = await database;
    final eventId = const Uuid().v4();
    await db.insert('sync_queue', {
      'event_id': eventId,
      'payload': jsonEncode({...session, 'event_id': eventId}),
      'created_at': DateTime.now().toUtc().toIso8601String(),
    });
    return eventId;
  }

  Future<List<Map<String, dynamic>>> pendingSyncEvents() async {
    final db = await database;
    final rows = await db.query(
      'sync_queue',
      where: "status IN ('pending', 'failed')",
      orderBy: 'created_at ASC',
      limit: 100,
    );
    return rows
        .map((row) => {
              'event_id': row['event_id'],
              ...(jsonDecode(row['payload']! as String) as Map<String, dynamic>),
            })
        .toList();
  }

  Future<void> markSynced(Iterable<String> eventIds) async {
    final db = await database;
    await db.transaction((transaction) async {
      for (final eventId in eventIds) {
        await transaction.delete('sync_queue', where: 'event_id = ?', whereArgs: [eventId]);
      }
    });
  }

  Future<void> markFailed(String eventId, Object error) async {
    final db = await database;
    await db.rawUpdate(
      'UPDATE sync_queue SET status = ?, attempt_count = attempt_count + 1, last_error = ? WHERE event_id = ?',
      ['failed', error.toString(), eventId],
    );
  }
}
