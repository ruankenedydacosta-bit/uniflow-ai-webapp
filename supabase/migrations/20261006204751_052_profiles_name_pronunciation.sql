begin;

-- Como o nome da pessoa soa, escrito do jeito que se lê em português
-- (ex.: "jo-NA-tas"). A Uni grava quando a pessoa corrige a pronúncia na
-- conversa por voz, e a Edge Function uni-voice-realtime-session põe nas
-- instruções de toda conversa nova. Nulo: a Uni lê o nome como está escrito.

alter table public.profiles
  add column if not exists name_pronunciation text;

alter table public.profiles
  drop constraint if exists profiles_name_pronunciation_check;

-- Vai para as instruções do modelo: curto e numa linha só.
alter table public.profiles
  add constraint profiles_name_pronunciation_check
  check (
    name_pronunciation is null
    or (char_length(name_pronunciation) between 1 and 60 and name_pronunciation !~ '[[:cntrl:]]')
  );

revoke update (name_pronunciation) on public.profiles from public, anon;
grant update (name_pronunciation) on public.profiles to authenticated;

comment on column public.profiles.name_pronunciation is
  'Pronúncia do nome escrita como se lê em português, gravada pela Uni na conversa por voz. Nulo: lê como está escrito.';

commit;
