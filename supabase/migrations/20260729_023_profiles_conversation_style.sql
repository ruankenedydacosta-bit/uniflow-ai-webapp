begin;

alter table public.profiles
  add column if not exists conversation_style text;

update public.profiles
set conversation_style = 'simple'
where conversation_style is null
   or conversation_style not in ('simple', 'normal', 'detailed');

alter table public.profiles
  alter column conversation_style set default 'simple',
  alter column conversation_style set not null;

alter table public.profiles
  drop constraint if exists profiles_conversation_style_check;

alter table public.profiles
  add constraint profiles_conversation_style_check
  check (conversation_style in ('simple', 'normal', 'detailed'));

revoke update (conversation_style) on public.profiles from public, anon;
grant update (conversation_style) on public.profiles to authenticated;

comment on column public.profiles.conversation_style is
  'Preferencia de extensao das respostas da Uni: simple, normal ou detailed.';

commit;
