begin;

alter table public.profiles
  add column if not exists voice_provider text not null default 'native';

alter table public.profiles
  drop constraint if exists profiles_voice_provider_check;

alter table public.profiles
  add constraint profiles_voice_provider_check
  check (voice_provider in ('native', 'elevenlabs'));

revoke update (voice_provider) on public.profiles from public, anon;
grant update (voice_provider) on public.profiles to authenticated;

comment on column public.profiles.voice_provider is
  'Provider de sintese de voz escolhido pelo usuario: native ou elevenlabs.';

commit;
