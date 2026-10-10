begin;

-- Épico #98 (Google Agenda), issue #100: itens criados no app vão para o
-- Google Agenda de quem os criou. Contrato no comentário do épico:
-- https://github.com/jonatasoc/uniflow-ai-webapp/issues/98#issuecomment-6042251103
--
-- Fluxo: triggers em agenda_items enfileiram em calendar_export_queue; o
-- pg_cron chama a Edge Function google-calendar-export a cada minuto, só
-- quando há trabalho. Falha do Google não impede salvar no app: a linha
-- volta para a fila com espera crescente.
--
-- Não altera as tabelas da 055.

-- ---------------------------------------------------------------------------
-- Fila de exportação
-- ---------------------------------------------------------------------------

-- Uma linha pendente por item: editar de novo antes do worker passar só
-- troca a operação e soma 1 em versao. O worker lê o item ao vivo e conclui
-- com a versao que reservou; se ela mudou no meio, a linha volta para a fila.
-- agenda_item_id sem FK: a linha de delete sobrevive ao item apagado.
create table if not exists public.calendar_export_queue (
  id bigint generated always as identity primary key,
  agenda_item_id uuid not null,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'google',
  operacao text not null,
  calendar_id text,
  external_id text,
  versao integer not null default 1,
  tentativas integer not null default 0,
  proxima_tentativa_em timestamptz not null default now(),
  bloqueada_ate timestamptz,
  ultimo_erro text,
  concluida_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_export_queue_provider_check check (provider in ('google')),
  constraint calendar_export_queue_operacao_check check (operacao in ('upsert', 'delete'))
);

create unique index if not exists calendar_export_queue_pendente_key
  on public.calendar_export_queue (agenda_item_id, provider)
  where concluida_em is null;

create index if not exists calendar_export_queue_proxima_idx
  on public.calendar_export_queue (proxima_tentativa_em)
  where concluida_em is null;

comment on table public.calendar_export_queue is
  'Fila de exportação de agenda_items para o Google Agenda (#100). Só service_role. Linhas concluídas saem depois de 7 dias.';

drop trigger if exists calendar_export_queue_set_updated_at on public.calendar_export_queue;
create trigger calendar_export_queue_set_updated_at
before update on public.calendar_export_queue
for each row execute function public.set_updated_at();

alter table public.calendar_export_queue enable row level security;
revoke all on table public.calendar_export_queue from anon, authenticated;
grant all on table public.calendar_export_queue to service_role;

-- ---------------------------------------------------------------------------
-- Enfileiramento
-- ---------------------------------------------------------------------------

create or replace function private.enfileirar_exportacao_google(
  p_agenda_item_id uuid,
  p_workspace_id uuid,
  p_user_id uuid,
  p_operacao text,
  p_calendar_id text,
  p_external_id text
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.calendar_export_queue
    (agenda_item_id, workspace_id, user_id, operacao, calendar_id, external_id)
  values
    (p_agenda_item_id, p_workspace_id, p_user_id, p_operacao, p_calendar_id, p_external_id)
  on conflict (agenda_item_id, provider) where concluida_em is null
  do update set
    operacao = excluded.operacao,
    calendar_id = coalesce(excluded.calendar_id, public.calendar_export_queue.calendar_id),
    external_id = coalesce(excluded.external_id, public.calendar_export_queue.external_id),
    versao = public.calendar_export_queue.versao + 1,
    tentativas = 0,
    proxima_tentativa_em = now(),
    ultimo_erro = null;
$$;

revoke all on function private.enfileirar_exportacao_google(uuid, uuid, uuid, text, text, text) from public, anon, authenticated;

-- Regras:
-- - uniflow.agenda_sync_origem = 'google' (importação do #101) não enfileira.
-- - Só item com created_by e com conexão ativa de quem criou no espaço.
-- - Item que veio do Google (vínculo com origin = 'provider') não é exportado.
-- - Editar só conta se mudou um campo que vai para o evento.
-- - Cancelar ou excluir enfileira um delete com o evento do vínculo. O delete
--   roda BEFORE DELETE: depois, o cascade já levou o vínculo.
-- - O item novo vai para o Google mesmo se for de um dia passado.
create or replace function public.agenda_items_enfileirar_google()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.agenda_items;
  v_link public.agenda_item_links;
  v_retorno public.agenda_items;
begin
  if tg_op = 'DELETE' then
    v_item := old;
    v_retorno := old;
  else
    v_item := new;
    v_retorno := new;
  end if;

  if coalesce(current_setting('uniflow.agenda_sync_origem', true), '') = 'google' then
    return v_retorno;
  end if;

  if v_item.created_by is null then
    return v_retorno;
  end if;

  -- Espaço apagado: o cascade já levou o espaço e a conexão. Enfileirar
  -- quebraria a FK e impediria apagar o espaço.
  if tg_op = 'DELETE' and not exists (
    select 1 from public.workspaces as espaco where espaco.id = v_item.workspace_id
  ) then
    return v_retorno;
  end if;

  if tg_op = 'UPDATE' and (
    new.title, new.description, new.location, new.starts_at, new.ends_at,
    new.is_all_day, new.has_explicit_time, new.item_type, new.status
  ) is not distinct from (
    old.title, old.description, old.location, old.starts_at, old.ends_at,
    old.is_all_day, old.has_explicit_time, old.item_type, old.status
  ) then
    return v_retorno;
  end if;

  if tg_op = 'INSERT' and v_item.status = 'cancelled' then
    return v_retorno;
  end if;

  if not exists (
    select 1
    from public.calendar_connections as conexao
    where conexao.user_id = v_item.created_by
      and conexao.workspace_id = v_item.workspace_id
      and conexao.provider = 'google'
      and conexao.status = 'active'
  ) then
    return v_retorno;
  end if;

  select * into v_link
  from public.agenda_item_links as link
  where link.agenda_item_id = v_item.id
    and link.provider = 'google';

  if found and v_link.origin = 'provider' then
    return v_retorno;
  end if;

  perform private.enfileirar_exportacao_google(
    v_item.id,
    v_item.workspace_id,
    v_item.created_by,
    case when tg_op = 'DELETE' or v_item.status = 'cancelled' then 'delete' else 'upsert' end,
    v_link.calendar_id,
    v_link.external_id
  );

  return v_retorno;
end;
$$;

revoke execute on function public.agenda_items_enfileirar_google() from public, anon, authenticated;

drop trigger if exists agenda_items_enfileirar_google on public.agenda_items;
create trigger agenda_items_enfileirar_google
after insert or update on public.agenda_items
for each row execute function public.agenda_items_enfileirar_google();

drop trigger if exists agenda_items_enfileirar_google_delete on public.agenda_items;
create trigger agenda_items_enfileirar_google_delete
before delete on public.agenda_items
for each row execute function public.agenda_items_enfileirar_google();

-- ---------------------------------------------------------------------------
-- RPCs do worker (só service_role)
-- ---------------------------------------------------------------------------

-- Reserva até p_limite linhas vencidas por 5 minutos, folga para uma
-- execução inteira do worker. Aproveita para apagar
-- as concluídas há mais de 7 dias.
create or replace function public.google_calendar_export_reservar(p_limite integer default 50)
returns setof public.calendar_export_queue
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.calendar_export_queue
  where concluida_em < now() - interval '7 days';

  return query
  update public.calendar_export_queue as fila
  set bloqueada_ate = now() + interval '5 minutes',
      tentativas = fila.tentativas + 1
  where fila.id in (
    select candidata.id
    from public.calendar_export_queue as candidata
    where candidata.concluida_em is null
      and candidata.proxima_tentativa_em <= now()
      and (candidata.bloqueada_ate is null or candidata.bloqueada_ate < now())
    order by candidata.proxima_tentativa_em, candidata.id
    limit greatest(1, least(coalesce(p_limite, 50), 200))
    for update skip locked
  )
  returning fila.*;
end;
$$;

-- Sem p_tentar_de_novo_em: conclui, se a versao ainda é a reservada. Se o
-- item mudou no meio, solta a linha para o próximo ciclo e devolve false.
-- Com p_tentar_de_novo_em: devolve a linha para a fila nessa hora, se a
-- versao ainda é a reservada; uma edição nova no meio já marcou a linha para
-- agora e não pode esperar a espera da falha anterior.
create or replace function public.google_calendar_export_concluir(
  p_id bigint,
  p_versao integer,
  p_erro text default null,
  p_tentar_de_novo_em timestamptz default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_tentar_de_novo_em is not null then
    update public.calendar_export_queue
    set proxima_tentativa_em = p_tentar_de_novo_em,
        ultimo_erro = left(p_erro, 200),
        bloqueada_ate = null
    where id = p_id and versao = p_versao and concluida_em is null;
    if not found then
      update public.calendar_export_queue
      set bloqueada_ate = null
      where id = p_id and concluida_em is null;
    end if;
    return false;
  end if;

  update public.calendar_export_queue
  set concluida_em = now(),
      ultimo_erro = left(p_erro, 200),
      bloqueada_ate = null
  where id = p_id and versao = p_versao and concluida_em is null;
  if found then
    return true;
  end if;

  update public.calendar_export_queue
  set bloqueada_ate = null
  where id = p_id and concluida_em is null;
  return false;
end;
$$;

-- Exportação inicial: na primeira passada por uma conexão ativa, enfileira
-- os itens futuros (a partir de hoje, no fuso de São Paulo) criados pelo
-- dono, com ou sem vínculo: a reconexão zera exportacao_inicial_em e assim
-- reenvia o que mudou enquanto a conexão estava com erro. Item que veio do
-- Google fica de fora. Grava a data para não repetir.
create or replace function public.google_calendar_export_inicial(p_connection_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conexao public.calendar_connections;
  v_quantidade integer := 0;
begin
  update public.calendar_connections
  set exportacao_inicial_em = now()
  where id = p_connection_id
    and status = 'active'
    and exportacao_inicial_em is null
  returning * into v_conexao;

  if not found then
    return 0;
  end if;

  insert into public.calendar_export_queue (agenda_item_id, workspace_id, user_id, operacao)
  select item.id, item.workspace_id, item.created_by, 'upsert'
  from public.agenda_items as item
  where item.workspace_id = v_conexao.workspace_id
    and item.created_by = v_conexao.user_id
    and item.status = 'scheduled'
    and item.starts_at >= ((now() at time zone 'America/Sao_Paulo')::date)::timestamp at time zone 'America/Sao_Paulo'
    and not exists (
      select 1
      from public.agenda_item_links as link
      where link.agenda_item_id = item.id
        and link.provider = 'google'
        and link.origin = 'provider'
    )
  on conflict (agenda_item_id, provider) where concluida_em is null do nothing;

  get diagnostics v_quantidade = row_count;
  return v_quantidade;
end;
$$;

revoke all on function public.google_calendar_export_reservar(integer) from public, anon, authenticated;
revoke all on function public.google_calendar_export_concluir(bigint, integer, text, timestamptz) from public, anon, authenticated;
revoke all on function public.google_calendar_export_inicial(uuid) from public, anon, authenticated;
grant execute on function public.google_calendar_export_reservar(integer) to service_role;
grant execute on function public.google_calendar_export_concluir(bigint, integer, text, timestamptz) to service_role;
grant execute on function public.google_calendar_export_inicial(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Segredo do cron, um só para os workers do épico (#100 e #101)
-- ---------------------------------------------------------------------------

create schema if not exists private;
revoke all on schema private from anon, authenticated;

create table if not exists private.google_calendar_dispatch_secret (
  id boolean primary key default true,
  secret text not null default encode(extensions.gen_random_bytes(32), 'hex'),
  constraint google_calendar_dispatch_secret_singleton check (id)
);

insert into private.google_calendar_dispatch_secret default values
on conflict (id) do nothing;

create or replace function public.verify_google_calendar_dispatch_secret(candidate text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.google_calendar_dispatch_secret where secret = candidate
  );
$$;

revoke all on function public.verify_google_calendar_dispatch_secret(text) from public, anon, authenticated;
grant execute on function public.verify_google_calendar_dispatch_secret(text) to service_role;

-- ---------------------------------------------------------------------------
-- Agendamento: a cada minuto, só quando há linha vencida ou conexão sem
-- exportação inicial. A URL do projeto vem do Vault (project_url), nunca
-- escrita aqui. Sem project_url, o cron não chama nada: a migration não
-- falha, para não travar a fila de migrations, e só avisa.
-- ---------------------------------------------------------------------------

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'project_url') then
    raise warning 'google-calendar-export: cadastre project_url no Vault, senão o cron não chama a função';
  end if;
end;
$$;

select cron.schedule(
  'google-calendar-export',
  '* * * * *',
  $cron$
  select net.http_post(
    url := segredo.decrypted_secret || '/functions/v1/google-calendar-export',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Dispatch-Secret', (select secret from private.google_calendar_dispatch_secret limit 1)
    ),
    body := '{}'::jsonb
  )
  from vault.decrypted_secrets as segredo
  where segredo.name = 'project_url'
    and (
      exists (
        select 1 from public.calendar_export_queue as fila
        where fila.concluida_em is null
          and fila.proxima_tentativa_em <= now()
          and (fila.bloqueada_ate is null or fila.bloqueada_ate < now())
      )
      or exists (
        select 1 from public.calendar_connections as conexao
        where conexao.status = 'active' and conexao.exportacao_inicial_em is null
      )
    );
  $cron$
);

commit;
