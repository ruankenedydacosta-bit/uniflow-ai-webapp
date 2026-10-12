begin;

-- #181: excluir categoria movendo os lançamentos para outra. Hoje o cliente
-- recusa a exclusão quando a categoria tem lançamentos. Com esta função a
-- pessoa escolhe a categoria de destino e a exclusão segue na mesma
-- transação: ou os lançamentos mudam de categoria e a categoria some, ou
-- nada acontece.
--
-- A função roda como o usuário (security invoker). Toda leitura, o update em
-- transactions e o delete em categories passam pelas policies existentes:
-- quem não pode excluir a categoria não move lançamento nenhum, porque o
-- delete devolve zero linhas e a exceção desfaz o update.
--
-- O que acompanha a exclusão (comportamento das FKs já existentes):
-- - transactions.category_id: movido aqui para a categoria de destino;
-- - category_budgets: o teto da categoria excluída é apagado (on delete
--   cascade). O teto não vai junto porque o destino pode já ter o próprio;
-- - categories.parent_category_id das subcategorias: fica nulo (on delete
--   set null).
--
-- Erros saem com errcode P0001 e uma mensagem-código, no padrão das outras
-- funções (037). O cliente traduz para texto de tela.

create or replace function public.excluir_categoria_movendo_lancamentos(
  p_workspace_id uuid,
  p_category_id uuid,
  p_destination_category_id uuid
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_origem public.categories%rowtype;
  v_destino public.categories%rowtype;
  v_movidos integer := 0;
  v_apagadas integer := 0;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = 'P0001', message = 'categoria_sessao_obrigatoria';
  end if;

  if p_workspace_id is null or p_category_id is null or p_destination_category_id is null then
    raise exception using errcode = 'P0001', message = 'categoria_parametros_obrigatorios';
  end if;

  if p_destination_category_id = p_category_id then
    raise exception using errcode = 'P0001', message = 'categoria_destino_igual';
  end if;

  select category.*
    into v_origem
  from public.categories as category
  where category.id = p_category_id
    and category.workspace_id = p_workspace_id
    and category.is_system = false;

  if not found then
    raise exception using errcode = 'P0001', message = 'categoria_nao_encontrada';
  end if;

  -- Destino: do mesmo espaço ou padrão do sistema, ativa e do mesmo tipo.
  -- Tipo diferente deixaria uma saída contada como entrada. A padrão precisa
  -- valer no contexto do espaço (applies_to), senão os lançamentos somem da
  -- lista que o app mostra (filterCategoriesForContext).
  select category.*
    into v_destino
  from public.categories as category
  where category.id = p_destination_category_id
    and category.is_active = true
    and category.category_type = v_origem.category_type
    and (
      category.workspace_id = p_workspace_id
      or (
        category.is_system = true
        and category.workspace_id is null
        and (
          category.applies_to = 'both'
          or category.applies_to = (
            select workspace.workspace_type
            from public.workspaces as workspace
            where workspace.id = p_workspace_id
          )
        )
      )
    );

  if not found then
    raise exception using errcode = 'P0001', message = 'categoria_destino_invalida';
  end if;

  update public.transactions as transaction
  set category_id = v_destino.id
  where transaction.workspace_id = p_workspace_id
    and transaction.category_id = v_origem.id;

  get diagnostics v_movidos = row_count;

  -- Com RLS, um update sem permissão não falha: só não altera linhas. Se
  -- sobrou lançamento na categoria, a exclusão não pode seguir.
  if exists (
    select 1
    from public.transactions as transaction
    where transaction.workspace_id = p_workspace_id
      and transaction.category_id = v_origem.id
  ) then
    raise exception using errcode = 'P0001', message = 'categoria_lancamentos_nao_movidos';
  end if;

  delete from public.categories as category
  where category.id = v_origem.id
    and category.workspace_id = p_workspace_id;

  get diagnostics v_apagadas = row_count;

  if v_apagadas = 0 then
    raise exception using errcode = 'P0001', message = 'categoria_sem_permissao';
  end if;

  return v_movidos;
end;
$$;

comment on function public.excluir_categoria_movendo_lancamentos(uuid, uuid, uuid) is
  'Move os lançamentos da categoria para a categoria de destino e exclui a categoria, na mesma transação. Roda com as permissões de quem chama. Devolve quantos lançamentos foram movidos.';

revoke execute on function public.excluir_categoria_movendo_lancamentos(uuid, uuid, uuid) from public, anon;
grant execute on function public.excluir_categoria_movendo_lancamentos(uuid, uuid, uuid) to authenticated, service_role;

commit;
