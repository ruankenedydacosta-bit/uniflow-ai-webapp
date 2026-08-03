begin;

select plan(12);

select has_column('public', 'profiles', 'preferred_name');
select has_column('public', 'profiles', 'treatment_preference');
select has_column('public', 'profiles', 'custom_treatment');
select has_column('public', 'profiles', 'birth_date');
select has_column('public', 'profiles', 'locale');
select has_column('public', 'profiles', 'text_size');
select has_column('public', 'profiles', 'avatar_path');

select policies_are(
  'storage',
  'objects',
  array[
    'profile_avatars_delete_own',
    'profile_avatars_insert_own',
    'profile_avatars_select_own'
  ]
);

select results_eq(
  $$ select public from storage.buckets where id = 'profile-avatars' $$,
  array[false],
  'profile-avatars permanece privado'
);

select results_eq(
  $$ select file_size_limit from storage.buckets where id = 'profile-avatars' $$,
  array[5242880::bigint],
  'bucket limita avatar a 5 MB'
);

select results_eq(
  $$ select has_table_privilege('anon', 'public.profiles', 'update') $$,
  array[false],
  'anon nao atualiza profiles'
);

select results_eq(
  $$ select has_column_privilege('authenticated', 'public.profiles', 'preferred_name', 'update') $$,
  array[true],
  'authenticated atualiza apenas preferencias autorizadas'
);

select * from finish();
rollback;
