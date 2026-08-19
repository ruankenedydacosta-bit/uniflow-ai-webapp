begin;

-- PUSH1: fundação de Web Push (Fase 1) -- só a tabela que guarda UM
-- PushSubscription por dispositivo/browser autorizado. Nenhuma automação
-- de Agenda, nenhuma notificação recorrente -- isso é responsabilidade de
-- uma fase futura. Aqui só precisamos provar que o pipe funciona:
-- usuário autoriza -> subscription salva -> backend envia UM push de
-- teste -> dispositivo recebe -> toque abre a UniFlow.

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- PUSH1: opcional (nulo = subscription não amarrada a um workspace
  -- específico) -- mesmo padrão de notifications.workspace_id (migration
  -- 020). Um dispositivo pertence ao USUÁRIO, não a um workspace; o mesmo
  -- celular continua recebendo push independente de qual workspace o
  -- usuário tem aberto no momento.
  workspace_id uuid references public.workspaces(id) on delete cascade,
  -- Endpoint é o identificador que o próprio push service (FCM para
  -- Chrome/Android, APNs web push para Safari/iOS 16.4+) atribui à
  -- subscription -- globalmente único por definição do protocolo (nunca
  -- duas subscriptions reais compartilham o mesmo endpoint). Usado como
  -- chave de idempotência: reativar notificações no MESMO
  -- dispositivo/browser deve atualizar a linha existente, nunca duplicar.
  endpoint text not null,
  -- Chaves públicas da subscription (nunca segredos do servidor) --
  -- necessárias para o backend criptografar o payload por RFC 8291.
  p256dh text not null,
  auth text not null,
  -- PUSH1: livre (nunca vindo de User-Agent sniffing no backend -- o
  -- cliente já resolveu isso via feature detection antes de enviar).
  platform text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz,
  -- PUSH1: soft-revoke, nunca DELETE físico -- mesma lição da correção de
  -- notifications (migration 041): o backend de envio precisa conseguir
  -- marcar um endpoint que voltou 404/410 como inválido sem perder o
  -- histórico, e "desativar notificações" no dispositivo é reversível
  -- (reativar reaproveita a mesma linha via upsert por endpoint).
  revoked_at timestamptz,
  constraint push_subscriptions_endpoint_key unique (endpoint)
);

comment on table public.push_subscriptions is
  'PUSH1: um PushSubscription por dispositivo/browser autorizado a receber Web Push. O mesmo usuário pode ter várias linhas (um dispositivo cada). endpoint é globalmente único (garantia do próprio protocolo Push API) e usado como chave de upsert -- nunca duplica ao reativar no mesmo dispositivo.';
comment on column public.push_subscriptions.endpoint is
  'URL única atribuída pelo push service (FCM/APNs web push) a esta subscription específica -- chave de idempotência via upsert on_conflict(endpoint).';
comment on column public.push_subscriptions.revoked_at is
  'Preenchido quando o usuário desativa notificações OU quando um envio real recebe 404/410 do push service (endpoint morto). NULL = subscription ativa. Nunca DELETE físico -- reativar no mesmo dispositivo reaproveita a linha.';

create index push_subscriptions_user_active_idx
  on public.push_subscriptions (user_id)
  where revoked_at is null;

alter table public.push_subscriptions enable row level security;

-- PUSH1: isolamento por usuário -- mesmo padrão de notifications
-- (auth.uid() = user_id em toda policy). Nunca aceita user_id arbitrário
-- do corpo da requisição -- é sempre a identidade da própria sessão
-- autenticada.
create policy push_subscriptions_select_own
  on public.push_subscriptions
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy push_subscriptions_insert_own
  on public.push_subscriptions
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- PUSH1: cobre tanto o upsert de reativação (on_conflict(endpoint) exige
-- UPDATE na linha existente) quanto o próprio backend de teste marcando
-- revoked_at após um 404/410 -- em ambos os casos USING garante que só o
-- DONO da linha (nunca outro usuário, mesmo sabendo o endpoint de
-- terceiro) pode alterá-la, e WITH CHECK impede que o UPDATE troque o
-- user_id para outra pessoa.
create policy push_subscriptions_update_own
  on public.push_subscriptions
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- PUSH1: nenhuma policy de DELETE -- mesma decisão já validada em
-- notifications (migration 041): "desativar" é sempre soft-revoke
-- (revoked_at), nunca exclusão física.
revoke all on table public.push_subscriptions from anon, authenticated;
grant select, insert on table public.push_subscriptions to authenticated;
grant update (p256dh, auth, platform, updated_at, last_seen_at, revoked_at)
  on table public.push_subscriptions to authenticated;

commit;
