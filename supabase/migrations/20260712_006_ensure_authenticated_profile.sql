begin;

-- Contas criadas antes do trigger de profiles podem autenticar sem possuir a
-- linha correspondente. Esta RPC cria somente o profile do proprio usuario e
-- nao concede INSERT direto na tabela ao frontend.
create or replace function public.ensure_own_profile()
returns table (
  id uuid,
  full_name text,
  phone text,
  user_mode text,
  current_workspace_id uuid,
  onboarding_completed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authenticated user is required';
  end if;

  insert into public.profiles (id, full_name)
  select
    auth_user.id,
    nullif(
      btrim(
        coalesce(
          auth_user.raw_user_meta_data ->> 'full_name',
          auth_user.raw_user_meta_data ->> 'name',
          ''
        )
      ),
      ''
    )
  from auth.users as auth_user
  where auth_user.id = current_user_id
  on conflict (id) do nothing;

  return query
  select
    profile.id,
    profile.full_name,
    profile.phone,
    profile.user_mode,
    profile.current_workspace_id,
    profile.onboarding_completed
  from public.profiles as profile
  where profile.id = current_user_id;

  if not found then
    raise exception 'Profile could not be ensured';
  end if;
end;
$$;

revoke all on function public.ensure_own_profile()
  from public, anon, authenticated;
grant execute on function public.ensure_own_profile()
  to authenticated;

comment on function public.ensure_own_profile() is
  'Garante somente o profile do usuario autenticado, sem liberar INSERT direto ao frontend.';

commit;
