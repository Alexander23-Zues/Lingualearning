begin;
select plan(19);

select has_type('public', 'account_role', 'account role enum exists');
select enum_has_labels('public', 'account_role', array['administrator', 'educator'], 'exactly two account roles');
select has_table('public', 'profiles', 'profiles exist');
select has_table('public', 'classroom_sessions', 'class sessions exist');
select hasnt_table('public', 'students', 'no students table');
select hasnt_table('public', 'student_profiles', 'no student profiles table');
select hasnt_table('public', 'parents', 'no parent table');
select hasnt_table('public', 'guardians', 'no guardian table');
select has_function('public', 'sync_classroom_session', array['uuid','uuid','jsonb'], 'duplicate-safe sync function exists');
select has_function('public', 'activate_model_version', array['uuid','text','uuid'], 'atomic model activation exists');
select has_policy('public', 'resources', 'resources_read', 'resource read policy exists');
select has_policy('public', 'resources', 'resources_owner_insert', 'resource ownership policy exists');
select has_policy('public', 'translation_datasets', 'translation_datasets_admin', 'dataset policy is administrator-scoped');
select has_policy('public', 'teaching_plans', 'teaching_plans_owner', 'teaching plan ownership policy exists');
select has_policy('public', 'teaching_plans', 'active_account_gate', 'suspension gate protects private records');
select has_function('public', 'rollback_model_activation', array['uuid'], 'atomic model rollback exists');
select has_table('public', 'child_profiles', 'minimal adult-created child profiles exist without child auth accounts');
select hasnt_table('public', 'student_accounts', 'no student account table exists');
select has_function('public', 'student_complete_material', array['text','uuid','integer','uuid','jsonb'], 'scoped server-scored student submission exists');

select * from finish();
rollback;
