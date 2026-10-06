begin;

-- Épico #116 / #114: três níveis de assinatura com cota de minutos de voz.
--
-- plan_id continua 'pro' para todo assinante: ele é o direito de acesso que
-- access.js, a navegação e o índice "uma assinatura corrente por workspace"
-- (migration 025) já entendem. O que muda entre os níveis é o preço e a cota
-- de voz, e isso fica em subscription_tiers, ligado por subscriptions.tier_id.
-- Ver docs/00-master/PLANO_INTEGRACAO_ASAAS.md (Plano Pessoal = 'pro').

create table if not exists public.subscription_tiers (
  id text primary key,
  name text not null,
  price_brl numeric(10, 2) not null,
  voice_seconds_per_cycle integer not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint subscription_tiers_id_check check (id in ('essencial', 'uni_voz', 'uni_voz_plus')),
  constraint subscription_tiers_price_check check (price_brl > 0),
  constraint subscription_tiers_voice_seconds_check check (voice_seconds_per_cycle >= 0)
);

insert into public.subscription_tiers (id, name, price_brl, voice_seconds_per_cycle, sort_order)
values
  ('essencial', 'Essencial', 14.90, 1200, 1),
  ('uni_voz', 'Uni Voz', 29.90, 3600, 2),
  ('uni_voz_plus', 'Uni Voz Plus', 69.90, 10800, 3)
on conflict (id) do nothing;

alter table public.subscription_tiers enable row level security;

-- Catálogo público, como plans: a página de venda mostra os preços antes do
-- login. Escrita só por migration.
drop policy if exists subscription_tiers_select_active on public.subscription_tiers;
create policy subscription_tiers_select_active
on public.subscription_tiers
for select
to anon, authenticated
using (active = true);

revoke all on table public.subscription_tiers from anon, authenticated;
grant select on table public.subscription_tiers to anon, authenticated;

comment on table public.subscription_tiers is
  'Níveis do Plano Pessoal (plan_id pro): preço mensal e cota de voz por ciclo de cobrança, em segundos.';
comment on column public.subscription_tiers.voice_seconds_per_cycle is
  'Minutos de conversa por voz em tempo real liberados a cada cobrança paga, em segundos.';

-- Quem já assina hoje paga R$ 29,90: passa para Uni Voz, o mesmo preço, e
-- nada muda na Asaas. O default mantém os caminhos de criação de assinatura
-- que ainda não mandam o nível.
alter table public.subscriptions
  add column if not exists tier_id text references public.subscription_tiers(id) on delete restrict,
  add column if not exists pending_tier_id text references public.subscription_tiers(id) on delete restrict;

update public.subscriptions
  set tier_id = 'uni_voz'
  where tier_id is null;

alter table public.subscriptions
  alter column tier_id set default 'uni_voz',
  alter column tier_id set not null;

comment on column public.subscriptions.tier_id is
  'Nível cobrado nesta assinatura (subscription_tiers). Define o preço e a cota de voz do ciclo.';
comment on column public.subscriptions.pending_tier_id is
  'Nível que passa a valer na próxima cobrança paga (troca de plano agendada). Nulo quando não há troca.';

commit;
