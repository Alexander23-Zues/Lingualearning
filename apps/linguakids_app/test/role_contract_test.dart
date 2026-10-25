import 'package:flutter_test/flutter_test.dart';
import 'package:linguakids_app/features/auth/domain/app_user.dart';
import 'package:linguakids_app/features/workspace/presentation/workspace_page.dart';

void main() {
  test('system exposes exactly two authenticated roles', () {
    expect(AccountRole.values, [
      AccountRole.administrator,
      AccountRole.educator,
    ]);
  });

  test('educator workspace does not expose parent or guardian accounts', () {
    final labels = educatorItems
        .map((item) => item.label.toLowerCase())
        .join(' ');
    expect(labels, isNot(contains('parent')));
    expect(labels, isNot(contains('guardian')));
  });
}
