import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import 'audit_repository.dart';

class AuditLogPage extends ConsumerStatefulWidget {
  const AuditLogPage({super.key});

  @override
  ConsumerState<AuditLogPage> createState() => _AuditLogPageState();
}

class _AuditLogPageState extends ConsumerState<AuditLogPage> {
  late Future<List<AuditEntry>> _entries;
  String _query = '';

  @override
  void initState() {
    super.initState();
    _entries = ref.read(auditRepositoryProvider).load();
  }

  void _refresh() =>
      setState(() => _entries = ref.read(auditRepositoryProvider).load());

  @override
  Widget build(BuildContext context) {
    final preview = ref.watch(auditRepositoryProvider).isPreview;
    return ListView(
      padding: const EdgeInsets.all(28),
      children: [
        Wrap(
          alignment: WrapAlignment.spaceBetween,
          spacing: 16,
          runSpacing: 16,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Audit Logs',
                  style: Theme.of(context).textTheme.headlineMedium,
                ),
                const SizedBox(height: 8),
                const Text(
                  'Latest 200 events · administrator access only · read-only records',
                ),
              ],
            ),
            FilledButton.icon(
              onPressed: _refresh,
              icon: const Icon(Icons.refresh),
              label: const Text('Refresh'),
            ),
          ],
        ),
        const SizedBox(height: 20),
        TextField(
          onChanged: (value) =>
              setState(() => _query = value.toLowerCase().trim()),
          decoration: const InputDecoration(
            prefixIcon: Icon(Icons.search),
            hintText: 'Search actions, people, or details',
          ),
        ),
        const SizedBox(height: 20),
        if (preview)
          const Card(
            child: Padding(
              padding: EdgeInsets.all(24),
              child: Text(
                'Local preview does not create audit records. Open the connected app and log in as administrator to see live events.',
              ),
            ),
          )
        else
          FutureBuilder<List<AuditEntry>>(
            future: _entries,
            builder: (context, snapshot) {
              if (snapshot.connectionState != ConnectionState.done) {
                return const Center(
                  child: Padding(
                    padding: EdgeInsets.all(32),
                    child: CircularProgressIndicator(),
                  ),
                );
              }
              if (snapshot.hasError) {
                return Card(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Audit records could not be loaded. Check your connection and administrator access.',
                        ),
                        const SizedBox(height: 12),
                        TextButton(
                          onPressed: _refresh,
                          child: const Text('Try again'),
                        ),
                      ],
                    ),
                  ),
                );
              }
              final entries = (snapshot.data ?? [])
                  .where(
                    (entry) =>
                        '${entry.action} ${entry.actorName} ${entry.actorEmail} ${entry.entityType} ${entry.metadata}'
                            .toLowerCase()
                            .contains(_query),
                  )
                  .toList();
              if (entries.isEmpty) {
                return Card(
                  child: Padding(
                    padding: const EdgeInsets.all(32),
                    child: Text(
                      _query.isEmpty
                          ? 'No audit events yet.'
                          : 'No matching audit events.',
                    ),
                  ),
                );
              }
              return Column(
                children: entries
                    .map(
                      (entry) => Card(
                        child: ExpansionTile(
                          leading: const Icon(Icons.history_rounded),
                          title: Text(entry.action.replaceAll('_', ' ')),
                          subtitle: Text(
                            '${DateFormat.yMMMd().add_jm().format(entry.occurredAt.toLocal())}\n'
                            '${entry.actorName}${entry.actorEmail.isEmpty ? '' : ' · ${entry.actorEmail}'}',
                          ),
                          childrenPadding: const EdgeInsets.fromLTRB(
                            24,
                            0,
                            24,
                            20,
                          ),
                          expandedCrossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Record ${entry.id} · ${entry.entityType.replaceAll('_', ' ')}',
                            ),
                            if (entry.entityId != null)
                              SelectableText(
                                'Affected record: ${entry.entityId}',
                              ),
                            ...entry.metadata.entries.map(
                              (field) => Padding(
                                padding: const EdgeInsets.only(top: 6),
                                child: SelectableText(
                                  '${field.key.replaceAll('_', ' ')}: ${field.value}',
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    )
                    .toList(),
              );
            },
          ),
      ],
    );
  }
}
