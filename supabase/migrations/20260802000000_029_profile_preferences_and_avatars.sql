begin;

-- Preferencias pessoais editaveis do perfil. O e-mail continua pertencendo
-- exclusivamente ao Supabase Auth e nao e duplicado nesta tabela.
alter table public.profiles
  add column if not exists preferred_name text,
  add column if not exists treatment_preference text not null default 'voce',
  add column if not exists custom_treatment text,
  add column if not exists birth_date date,
  add column if not exists locale text not null default 'pt-BR',
  add column if not exists text_size text not null default 'standard',
  add column if not exists avatar_path text;

alter table public.profiles
  drop constraint if exists profiles_preferred_name_length_check,
  drop constraint if exists profiles_treatment_preference_check,
  drop constraint if exists profiles_custom_treatment_check,
  drop constraint if exists profiles_birth_date_check,
  drop constraint if exists profiles_locale_check,
  drop constraint if exists profiles_text_size_check,
  drop constraint if exists profiles_avatar_path_own_check;

alter table public.profiles
  add constraint profiles_preferred_name_length_check
    check (preferred_name is null or length(btrim(preferred_name)) between 1 and 60),
  add constraint profiles_treatment_preference_check
    check (treatment_preference in (
      'voce', 'senhor', 'senhora', 'senhorita', 'doutor', 'doutora',
      'prefer_not_to_say', 'other'
    )),
  add constraint profiles_custom_treatment_check
    check (
      (
        treatment_preference = 'other'
        and custom_treatment is not null
        and length(btrim(custom_treatment)) between 1 and 40
      )
      or (treatment_preference <> 'other' and custom_treatment is null)
    ),
  add constraint profiles_birth_date_check
    check (birth_date is null or birth_date >= date '1900-01-01'),
  add constraint profiles_locale_check
    check (locale = 'pt-BR'),
  add constraint profiles_text_size_check
    check (text_size in ('small', 'standard', 'large')),
  add constraint profiles_avatar_path_own_check
    check (avatar_path is null or avatar_path like id::text || '/%');

revoke update (
  preferred_name,
  treatment_preference,
  custom_treatment,
  birth_date,
  locale,
  text_size,
  avatar_path
) on public.profiles from public, anon;

grant update (
  preferred_name,
  treatment_preference,
  custom_treatment,
  birth_date,
  locale,
  text_size,
  avatar_path
) on public.profiles to authenticated;

comment on column public.profiles.preferred_name is
  'Nome curto ou forma escolhida pelo usuario para comunicacao.';
comment on column public.profiles.treatment_preference is
  'Preferencia declarada de tratamento; nunca inferida pelo aplicativo.';
comment on column public.profiles.custom_treatment is
  'Forma curta de tratamento informada quando treatment_preference = other.';
comment on column public.profiles.birth_date is
  'Data de nascimento opcional, sem calculo automatico de idade.';
comment on column public.profiles.locale is
  'Locale efetivamente suportado pela interface.';
comment on column public.profiles.text_size is
  'Preferencia de escala textual no shell simplificado.';
comment on column public.profiles.avatar_path is
  'Caminho privado no bucket profile-avatars, sempre prefixado pelo auth.uid().';

-- Bucket privado. Signed URLs curtas sao geradas pelo cliente autenticado;
-- nenhum objeto e publicado e cada usuario acessa somente a propria pasta.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'profile-avatars',
  'profile-avatars',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists profile_avatars_select_own on storage.objects;
drop policy if exists profile_avatars_insert_own on storage.objects;
drop policy if exists profile_avatars_delete_own on storage.objects;

create policy profile_avatars_select_own
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'profile-avatars'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

create policy profile_avatars_insert_own
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'profile-avatars'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

create policy profile_avatars_delete_own
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'profile-avatars'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

commit;
