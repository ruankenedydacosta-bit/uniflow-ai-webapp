begin;

alter table public.profiles
  add column if not exists onboarding_data jsonb,
  add column if not exists onboarding_completed_at timestamptz;

revoke all on table public.profiles from anon, authenticated;

grant select on table public.profiles to authenticated;

grant update (
  full_name,
  avatar_url,
  phone,
  user_mode,
  current_workspace_id,
  onboarding_completed,
  onboarding_data,
  onboarding_completed_at
) on public.profiles to authenticated;

commit;
