begin;

-- Épico #98 (Google Agenda), issue #101: eventos dos calendários Google que a
-- pessoa escolheu entram na agenda do espaço. Contrato no comentário do épico:
-- https://github.com/jonatasoc/uniflow-ai-webapp/issues/98#issuecomment-6042251103
--
-- Quem decide o que fazer com cada evento é o Edge (mapearEvento.js, testado
-- com node --test). Aqui ficam:
-- - a trava de sync por calendário;
-- - a leitura do estado atual (vínculo e item) de um lote de eventos;
-- - a aplicação do lote, com a variável anti-loop do #100;
-- - a varredura que cancela item cujo evento sumiu da janela;
-- - o cron do sync de segurança e da renovação dos canais.
--
-- Não altera as tabelas da 055 nem a fila da 060. Reaproveita o segredo do
-- cron (private.google_calendar_dispatch_secret) e o project_url do Vault.
-- Tudo só para service_role.

-- ---------------------------------------------------------------------------
-- Dono da conexão ativo no espaço e com permissão de criar compromisso (a
-- mesma regra da policy de insert de agenda_items).
-- ---------------------------------------------------------------------------

create or replace function private.google_calendar_conexao_importavel(p_connection_id uuid)
returns public.calendar_connections
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_conexao public.calendar_connections;
begin
  select * into v_conexao
  from public.calendar_connections as conexao
  where conexao.id = p_connection_id
    and conexao.provider = 'google'
    and conexao.status = 'active';

  if not found then
    raise exception 'google-calendar-import: conexão inexistente ou inativa'
      using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.workspace_members as membro
    where membro.workspace_id = v_conexao.workspace_id
      and membro.user_id = v_conexao.user_id
      and membro.status = 'active'
      and membro.role in ('owner', 'admin', 'member')
  ) then
    raise exception 'google-calendar-import: dono da conexão fora do espaço'
      using errcode = '42501';
  end if;

  return v_conexao;
end;
$$;

revoke all on function private.google_calendar_conexao_importavel(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Trava de sync por calendário. Webhook, sync-dispatch e sync-now disputam a
-- mesma linha; quem não pega a trava devolve 'skipped'.
-- ---------------------------------------------------------------------------

create or replace function public.google_calendar_sync_travar(
  p_calendario_id uuid,
  p_segundos integer default 300
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.calendar_connection_calendars as calendario
  set sync_lock_until = now() + make_interval(secs => greatest(30, least(coalesce(p_segundos, 300), 600)))
  where calendario.id = p_calendario_id
    and calendario.is_read
    and (calendario.sync_lock_until is null or calendario.sync_lock_until < now())
    and exists (
      select 1
      from public.calendar_connections as conexao
      where conexao.id = calendario.connection_id
        and conexao.status = 'active'
    );
  return found;
end;
$$;

-- ---------------------------------------------------------------------------
-- Estado atual de um lote: vínculo e item de cada evento já importado ou
-- exportado. O vínculo é do espaço (unique workspace, provider, calendar_id,
-- external_id), não da pessoa: dois donos do mesmo calendário no mesmo espaço
-- não duplicam o item.
-- ---------------------------------------------------------------------------

create or replace function public.google_calendar_import_estado(
  p_connection_id uuid,
  p_calendar_id text,
  p_external_ids text[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_conexao public.calendar_connections;
  v_estado jsonb;
begin
  v_conexao := private.google_calendar_conexao_importavel(p_connection_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'external_id', link.external_id,
    'vinculo', jsonb_build_object(
      'id', link.id,
      'agenda_item_id', link.agenda_item_id,
      'etag', link.etag,
      'origin', link.origin
    ),
    'item', jsonb_build_object(
      'id', item.id,
      'item_type', item.item_type,
      'title', item.title,
      'description', item.description,
      'location', item.location,
      'starts_at', item.starts_at,
      'ends_at', item.ends_at,
      'is_all_day', item.is_all_day,
      'has_explicit_time', item.has_explicit_time,
      'status', item.status,
      'updated_at', item.updated_at
    )
  )), '[]'::jsonb)
  into v_estado
  from public.agenda_item_links as link
  join public.agenda_items as item on item.id = link.agenda_item_id
  where link.workspace_id = v_conexao.workspace_id
    and link.provider = 'google'
    and link.calendar_id = p_calendar_id
    and link.external_id = any (coalesce(p_external_ids, '{}'::text[]));

  return v_estado;
end;
$$;

-- ---------------------------------------------------------------------------
-- Aplica as operações decididas pelo Edge. Cada operação:
--   {tipo: 'inserir', external_id, etag, updated, campos}
--   {tipo: 'atualizar', external_id, etag, updated, agenda_item_id, esperado_updated_at, campos}
--   {tipo: 'cancelar', external_id, etag, updated, agenda_item_id, esperado_updated_at}
--   {tipo: 'visto', external_id}
--
-- - workspace_id e created_by vêm da conexão, nunca do payload.
-- - uniflow.agenda_sync_origem = 'google': o trigger do #100 não devolve ao
--   Google o que acabou de vir dele.
-- - atualizar e cancelar só gravam se o item não mudou desde a leitura
--   (updated_at igual ao lido). Se mudou, a edição no app é mais nova e vence:
--   o vínculo só recebe remote_seen_at.
-- - Todo evento visto grava remote_seen_at, que a varredura usa.
-- ---------------------------------------------------------------------------

create or replace function public.google_calendar_import_aplicar(
  p_connection_id uuid,
  p_calendar_id text,
  p_operacoes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conexao public.calendar_connections;
  v_op jsonb;
  v_campos jsonb;
  v_item_id uuid;
  v_external_id text;
  v_gravou boolean;
  v_inseridos integer := 0;
  v_atualizados integer := 0;
  v_cancelados integer := 0;
begin
  v_conexao := private.google_calendar_conexao_importavel(p_connection_id);

  if coalesce(btrim(p_calendar_id), '') = '' then
    raise exception 'google_calendar_import_aplicar: calendário obrigatório';
  end if;

  perform set_config('uniflow.agenda_sync_origem', 'google', true);

  for v_op in
    select operacao.value
    from jsonb_array_elements(
      case when jsonb_typeof(p_operacoes) = 'array' then p_operacoes else '[]'::jsonb end
    ) as operacao(value)
  loop
    v_external_id := v_op->>'external_id';
    continue when coalesce(v_external_id, '') = '';
    v_campos := coalesce(v_op->'campos', '{}'::jsonb);
    v_gravou := false;

    if v_op->>'tipo' = 'inserir' then
      begin
        insert into public.agenda_items (
          workspace_id, item_type, title, description, location,
          starts_at, ends_at, is_all_day, has_explicit_time, status, created_by
        )
        values (
          v_conexao.workspace_id,
          case when v_campos->>'item_type' = 'meeting' then 'meeting' else 'other' end,
          v_campos->>'title',
          nullif(v_campos->>'description', ''),
          nullif(v_campos->>'location', ''),
          (v_campos->>'starts_at')::timestamptz,
          (v_campos->>'ends_at')::timestamptz,
          coalesce((v_campos->>'is_all_day')::boolean, false),
          coalesce((v_campos->>'has_explicit_time')::boolean, true),
          'scheduled',
          v_conexao.user_id
        )
        returning id into v_item_id;

        insert into public.agenda_item_links (
          agenda_item_id, workspace_id, user_id, provider, calendar_id, external_id,
          etag, remote_updated_at, remote_seen_at, origin
        )
        values (
          v_item_id, v_conexao.workspace_id, v_conexao.user_id, 'google', p_calendar_id, v_external_id,
          v_op->>'etag', (v_op->>'updated')::timestamptz, now(), 'provider'
        );
        v_inseridos := v_inseridos + 1;
      exception
        -- Outro sync gravou o mesmo evento no meio: o vínculo dele vale, e o
        -- item deste bloco sai junto com o savepoint.
        when unique_violation then null;
        -- Evento com dado que o banco recusa (título vazio, fim antes do
        -- início): fica de fora sem derrubar o lote.
        when check_violation or not_null_violation or invalid_datetime_format or datetime_field_overflow then
          raise warning 'google-calendar-import: evento recusado (%)', sqlstate;
      end;
      continue;
    end if;

    if v_op->>'tipo' = 'atualizar' then
      begin
        update public.agenda_items as item
        set title = v_campos->>'title',
            description = nullif(v_campos->>'description', ''),
            location = nullif(v_campos->>'location', ''),
            starts_at = (v_campos->>'starts_at')::timestamptz,
            ends_at = (v_campos->>'ends_at')::timestamptz,
            is_all_day = coalesce((v_campos->>'is_all_day')::boolean, item.is_all_day),
            has_explicit_time = coalesce((v_campos->>'has_explicit_time')::boolean, item.has_explicit_time),
            status = case
              when v_campos->>'status' in ('scheduled', 'completed', 'cancelled') then v_campos->>'status'
              else item.status
            end
        where item.id = (v_op->>'agenda_item_id')::uuid
          and item.workspace_id = v_conexao.workspace_id
          and item.updated_at = (v_op->>'esperado_updated_at')::timestamptz
          and exists (
            select 1
            from public.agenda_item_links as link
            where link.agenda_item_id = item.id
              and link.workspace_id = v_conexao.workspace_id
              and link.provider = 'google'
              and link.calendar_id = p_calendar_id
              and link.external_id = v_external_id
          );
        v_gravou := found;
      exception
        when check_violation or not_null_violation or invalid_datetime_format or datetime_field_overflow then
          raise warning 'google-calendar-import: atualização recusada (%)', sqlstate;
          v_gravou := false;
      end;
      if v_gravou then
        v_atualizados := v_atualizados + 1;
      end if;
    elsif v_op->>'tipo' = 'cancelar' then
      update public.agenda_items as item
      set status = 'cancelled'
      where item.id = (v_op->>'agenda_item_id')::uuid
        and item.workspace_id = v_conexao.workspace_id
        and item.status <> 'cancelled'
        and item.updated_at = (v_op->>'esperado_updated_at')::timestamptz
        and exists (
          select 1
          from public.agenda_item_links as link
          where link.agenda_item_id = item.id
            and link.workspace_id = v_conexao.workspace_id
            and link.provider = 'google'
            and link.calendar_id = p_calendar_id
            and link.external_id = v_external_id
        );
      v_gravou := found;
      if v_gravou then
        v_cancelados := v_cancelados + 1;
      end if;
    elsif v_op->>'tipo' is distinct from 'visto' then
      continue;
    end if;

    -- Vínculo: etag e updated novos só quando o item recebeu a mudança.
    update public.agenda_item_links as link
    set etag = case when v_gravou then v_op->>'etag' else link.etag end,
        remote_updated_at = case when v_gravou then (v_op->>'updated')::timestamptz else link.remote_updated_at end,
        remote_seen_at = now()
    where link.workspace_id = v_conexao.workspace_id
      and link.provider = 'google'
      and link.calendar_id = p_calendar_id
      and link.external_id = v_external_id;
  end loop;

  return jsonb_build_object(
    'inseridos', v_inseridos,
    'atualizados', v_atualizados,
    'cancelados', v_cancelados
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Varredura, depois de um sync completo da janela: item que veio do Google
-- (origin = 'provider'), ainda agendado, com início dentro da janela e cujo
-- evento não apareceu na listagem vira 'cancelled'. Cobre o evento apagado
-- enquanto o syncToken estava vencido (410). Nada é apagado.
-- ---------------------------------------------------------------------------

create or replace function public.google_calendar_import_varrer(
  p_connection_id uuid,
  p_calendar_id text,
  p_visto_antes timestamptz,
  p_inicio timestamptz,
  p_fim timestamptz
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conexao public.calendar_connections;
  v_cancelados integer := 0;
begin
  v_conexao := private.google_calendar_conexao_importavel(p_connection_id);

  if p_visto_antes is null or p_inicio is null or p_fim is null or p_visto_antes > now() then
    raise exception 'google_calendar_import_varrer: parâmetros inválidos';
  end if;

  perform set_config('uniflow.agenda_sync_origem', 'google', true);

  update public.agenda_items as item
  set status = 'cancelled'
  from public.agenda_item_links as link
  where link.agenda_item_id = item.id
    and link.workspace_id = v_conexao.workspace_id
    and link.provider = 'google'
    and link.calendar_id = p_calendar_id
    and link.origin = 'provider'
    and (link.remote_seen_at is null or link.remote_seen_at < p_visto_antes)
    and item.workspace_id = v_conexao.workspace_id
    and item.status = 'scheduled'
    and item.starts_at >= p_inicio
    and item.starts_at < p_fim;

  get diagnostics v_cancelados = row_count;
  return v_cancelados;
end;
$$;

-- ---------------------------------------------------------------------------
-- Conexões para o sync de segurança: ativas, sem escopo faltando, com o dono
-- ainda no espaço e sem passada nos últimos 30 minutos. A mais antiga primeiro.
-- ---------------------------------------------------------------------------

create or replace function public.google_calendar_sync_candidatas(p_limite integer default 10)
returns table (id uuid, user_id uuid, workspace_id uuid, app_calendar_id text)
language sql
stable
security definer
set search_path = ''
as $$
  select conexao.id, conexao.user_id, conexao.workspace_id, conexao.app_calendar_id
  from public.calendar_connections as conexao
  where conexao.provider = 'google'
    and conexao.status = 'active'
    and conexao.last_error_code is distinct from 'escopo_insuficiente'
    and (conexao.last_synced_at is null or conexao.last_synced_at < now() - interval '30 minutes')
    and exists (
      select 1
      from public.workspace_members as membro
      where membro.workspace_id = conexao.workspace_id
        and membro.user_id = conexao.user_id
        and membro.status = 'active'
        and membro.role in ('owner', 'admin', 'member')
    )
  order by conexao.last_synced_at asc nulls first, conexao.id
  limit greatest(1, least(coalesce(p_limite, 10), 50));
$$;

revoke all on function public.google_calendar_sync_travar(uuid, integer) from public, anon, authenticated;
revoke all on function public.google_calendar_import_estado(uuid, text, text[]) from public, anon, authenticated;
revoke all on function public.google_calendar_import_aplicar(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.google_calendar_import_varrer(uuid, text, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.google_calendar_sync_candidatas(integer) from public, anon, authenticated;
grant execute on function public.google_calendar_sync_travar(uuid, integer) to service_role;
grant execute on function public.google_calendar_import_estado(uuid, text, text[]) to service_role;
grant execute on function public.google_calendar_import_aplicar(uuid, text, jsonb) to service_role;
grant execute on function public.google_calendar_import_varrer(uuid, text, timestamptz, timestamptz, timestamptz) to service_role;
grant execute on function public.google_calendar_sync_candidatas(integer) to service_role;

-- ---------------------------------------------------------------------------
-- Agendamento: a cada 10 minutos, só quando há conexão sem passada nos
-- últimos 30 minutos. O webhook é o caminho principal; este cron cobre
-- notificação perdida, cria e renova os canais e refaz o sync completo da
-- janela uma vez por semana. URL do projeto no Vault (project_url), nunca
-- escrita aqui; sem ela o cron não chama nada.
-- ---------------------------------------------------------------------------

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'project_url') then
    raise warning 'google-calendar-sync-dispatch: cadastre project_url no Vault, senão o cron não chama a função';
  end if;
end;
$$;

select cron.schedule(
  'google-calendar-sync-dispatch',
  '*/10 * * * *',
  $cron$
  select net.http_post(
    url := segredo.decrypted_secret || '/functions/v1/google-calendar-sync-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Dispatch-Secret', (select secret from private.google_calendar_dispatch_secret limit 1)
    ),
    body := '{}'::jsonb
  )
  from vault.decrypted_secrets as segredo
  where segredo.name = 'project_url'
    and exists (
      select 1 from public.calendar_connections as conexao
      where conexao.provider = 'google'
        and conexao.status = 'active'
        and (conexao.last_synced_at is null or conexao.last_synced_at < now() - interval '30 minutes')
    );
  $cron$
);

commit;
