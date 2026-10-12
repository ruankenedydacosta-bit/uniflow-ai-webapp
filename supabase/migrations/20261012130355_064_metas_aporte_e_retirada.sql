begin;

-- #158: aporte e retirada de meta. Até aqui o cliente gravava o aporte em
-- goal_contributions e somava o valor só na tela: nenhum trigger atualizava
-- financial_goals.current_amount, e ao recarregar o valor guardado voltava ao
-- de antes. As duas funções abaixo fazem, na mesma transação, o aporte, o
-- valor guardado e a transferência no Financeiro.
--
-- Decisões do dono (11/10/2026, registradas na #158):
-- - "Registrar também no Financeiro" vem ligado. A transferência vai da conta
--   de origem para a conta vinculada da meta; a retirada faz o inverso. Sem
--   conta vinculada não há transferência.
-- - Retirada que deixa a meta abaixo de zero, ou em meta concluída, é
--   bloqueada.
--
-- As funções são security invoker: a RLS de financial_goals,
-- goal_contributions e transactions continua valendo para quem chama.

-- Retirada grava valor negativo.
alter table public.goal_contributions
  drop constraint if exists goal_contributions_amount_check;

alter table public.goal_contributions
  add constraint goal_contributions_amount_check check (amount <> 0);

-- Transferência criada junto com o aporte. Excluir o aporte apaga a
-- transferência; apagar a transferência no Financeiro mantém o aporte.
alter table public.goal_contributions
  add column if not exists transaction_id uuid
    references public.transactions(id) on delete set null;

comment on column public.goal_contributions.amount is
  'Positivo = aporte; negativo = retirada (#158).';
comment on column public.goal_contributions.linked_account_id is
  'Conta de origem do aporte (ou de destino da retirada).';
comment on column public.goal_contributions.transaction_id is
  'Transferência registrada no Financeiro junto com o aporte (#158).';

-- ============================================================================
-- registrar_movimento_da_meta: aporte (p_valor > 0) ou retirada (p_valor < 0).
-- Erros com mensagem fixa, que o cliente traduz:
--   meta_nao_encontrada, valor_invalido, meta_nao_recebe_aporte,
--   meta_concluida, retirada_maior_que_guardado, meta_sem_conta_vinculada,
--   conta_de_origem_invalida.
-- ============================================================================

create or replace function public.registrar_movimento_da_meta(
  p_goal_id uuid,
  p_valor numeric,
  p_data date,
  p_observacao text,
  p_conta_id uuid,
  p_registrar_no_financeiro boolean,
  p_client_operation_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_meta public.financial_goals%rowtype;
  v_valor numeric := round(p_valor, 2);
  v_aporte public.goal_contributions%rowtype;
  v_transacao_id uuid;
begin
  -- A trava serializa aportes simultâneos na mesma meta: o saldo conferido
  -- pela retirada é o que vai ser gravado.
  select * into v_meta
  from public.financial_goals
  where id = p_goal_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'meta_nao_encontrada';
  end if;

  if p_client_operation_id is not null then
    select * into v_aporte
    from public.goal_contributions
    where goal_id = p_goal_id and client_operation_id = p_client_operation_id;

    if found then
      return jsonb_build_object('meta', to_jsonb(v_meta), 'aporte', to_jsonb(v_aporte));
    end if;
  end if;

  if v_valor is null or v_valor = 0 then
    raise exception using errcode = 'P0001', message = 'valor_invalido';
  end if;

  if v_meta.status = 'completed' then
    raise exception using errcode = 'P0001', message = 'meta_concluida';
  end if;

  if v_valor > 0 and v_meta.status <> 'active' then
    raise exception using errcode = 'P0001', message = 'meta_nao_recebe_aporte';
  end if;

  if v_valor < 0 and v_meta.status not in ('active', 'paused') then
    raise exception using errcode = 'P0001', message = 'meta_nao_recebe_aporte';
  end if;

  if v_meta.current_amount + v_valor < 0 then
    raise exception using errcode = 'P0001', message = 'retirada_maior_que_guardado';
  end if;

  if p_registrar_no_financeiro then
    if v_meta.linked_account_id is null then
      raise exception using errcode = 'P0001', message = 'meta_sem_conta_vinculada';
    end if;

    if p_conta_id is null or p_conta_id = v_meta.linked_account_id then
      raise exception using errcode = 'P0001', message = 'conta_de_origem_invalida';
    end if;

    insert into public.transactions (
      workspace_id, account_id, destination_account_id, transaction_type,
      description, amount, transaction_date, notes, metadata
    )
    values (
      v_meta.workspace_id,
      case when v_valor > 0 then p_conta_id else v_meta.linked_account_id end,
      case when v_valor > 0 then v_meta.linked_account_id else p_conta_id end,
      'transfer',
      case when v_valor > 0 then 'Aporte na meta ' else 'Retirada da meta ' end || v_meta.name,
      abs(v_valor),
      coalesce(p_data, current_date),
      nullif(btrim(p_observacao), ''),
      jsonb_build_object('goal_id', v_meta.id)
    )
    returning id into v_transacao_id;
  end if;

  insert into public.goal_contributions (
    user_id, workspace_id, goal_id, amount, contribution_date, note,
    linked_account_id, client_operation_id, transaction_id
  )
  values (
    v_meta.user_id, v_meta.workspace_id, v_meta.id, v_valor,
    coalesce(p_data, current_date), nullif(btrim(p_observacao), ''),
    p_conta_id, p_client_operation_id, v_transacao_id
  )
  returning * into v_aporte;

  update public.financial_goals
  set current_amount = current_amount + v_valor
  where id = v_meta.id
  returning * into v_meta;

  return jsonb_build_object('meta', to_jsonb(v_meta), 'aporte', to_jsonb(v_aporte));
end;
$function$;

-- ============================================================================
-- excluir_movimento_da_meta: desfaz um aporte ou uma retirada, com a
-- transferência que foi junto. Excluir um aporte não pode deixar o valor
-- guardado negativo (houve retirada depois dele).
-- ============================================================================

create or replace function public.excluir_movimento_da_meta(p_contribution_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_aporte public.goal_contributions%rowtype;
  v_meta public.financial_goals%rowtype;
begin
  select * into v_aporte
  from public.goal_contributions
  where id = p_contribution_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'aporte_nao_encontrado';
  end if;

  select * into v_meta
  from public.financial_goals
  where id = v_aporte.goal_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'meta_nao_encontrada';
  end if;

  if v_meta.current_amount - v_aporte.amount < 0 then
    raise exception using errcode = 'P0001', message = 'retirada_maior_que_guardado';
  end if;

  delete from public.goal_contributions where id = v_aporte.id;

  if v_aporte.transaction_id is not null then
    delete from public.transactions where id = v_aporte.transaction_id;
  end if;

  update public.financial_goals
  set current_amount = current_amount - v_aporte.amount
  where id = v_meta.id
  returning * into v_meta;

  return jsonb_build_object('meta', to_jsonb(v_meta));
end;
$function$;

revoke all on function public.registrar_movimento_da_meta(uuid, numeric, date, text, uuid, boolean, text) from public, anon;
revoke all on function public.excluir_movimento_da_meta(uuid) from public, anon;
grant execute on function public.registrar_movimento_da_meta(uuid, numeric, date, text, uuid, boolean, text) to authenticated;
grant execute on function public.excluir_movimento_da_meta(uuid) to authenticated;

-- Grant por coluna (ver 011): a função é security invoker e grava
-- transaction_id com o privilégio de quem chama.
grant insert (transaction_id) on public.goal_contributions to authenticated;

commit;
