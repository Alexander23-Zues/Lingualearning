enum AccountRole { administrator, educator }

enum AccountStatus { active, suspended }

class AppUser {
  const AppUser({
    required this.id,
    required this.name,
    required this.email,
    required this.role,
    required this.status,
    this.schoolName,
    this.gradeLevels = const [],
  });

  final String id;
  final String name;
  final String email;
  final AccountRole role;
  final AccountStatus status;
  final String? schoolName;
  final List<int> gradeLevels;

  factory AppUser.fromJson(Map<String, dynamic> json) => AppUser(
    id: json['id'] as String,
    name: json['name'] as String? ?? 'Educator',
    email: json['email'] as String? ?? '',
    role: AccountRole.values.byName(json['role'] as String),
    status: AccountStatus.values.byName(json['status'] as String),
    schoolName: json['school_name'] as String?,
    gradeLevels: (json['grade_levels'] as List<dynamic>? ?? const [])
        .map((value) => value as int)
        .toList(),
  );
}
