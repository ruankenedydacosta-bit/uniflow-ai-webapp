begin;

-- Fase 3 — Especializacao PF/PJ das categorias.
-- Adiciona o campo semantico applies_to (NAO reutilizar workspace_type, que ja
-- pertence a tabela workspaces com outro proposito) para diferenciar categorias
-- globais do sistema entre contexto pessoal (PF), empresarial (PJ) ou ambos.
-- Migration ADITIVA: nova coluna + backfill + novos seeds. Nao remove nem
-- renomeia categorias existentes; nenhuma transacao referencia categoria
-- removida, portanto nenhum category_id fica orfao.
-- Depende de 20260711_002_financial_core.sql e 20260711_003_financial_catalog_seeds.sql.

-- 1) Nova coluna semantica. DEFAULT seguro 'both' preenche todas as linhas
--    existentes (inclusive categorias customizadas de workspace, para as quais
--    o campo e irrelevante: elas ja sao filtradas por workspace_id).
alter table public.categories
  add column if not exists applies_to text not null default 'both';

alter table public.categories
  drop constraint if exists categories_applies_to_check;

alter table public.categories
  add constraint categories_applies_to_check
  check (applies_to in ('personal', 'business', 'both'));

-- 2) Backfill das categorias globais existentes (workspace_id null, is_system).
--    Criterio explicito por natureza real de cada categoria.
update public.categories set applies_to = 'personal'
where workspace_id is null and is_system = true
  and lower(name) in (
    'salário', 'rendimentos',
    'moradia', 'alimentação', 'transporte', 'saúde', 'educação', 'lazer'
  );

update public.categories set applies_to = 'business'
where workspace_id is null and is_system = true
  and lower(name) in (
    'receita de vendas',
    'impostos', 'fornecedores', 'operacional'
  );

update public.categories set applies_to = 'both'
where workspace_id is null and is_system = true
  and lower(name) in (
    'outras entradas', 'assinaturas', 'outras despesas', 'transferência'
  );

-- 3) Novos seeds globais por contexto. Idempotente via indice parcial unico
--    categories_system_name_type_uidx (lower(name), category_type) where
--    workspace_id is null and is_system = true. Nao duplica categorias que ja
--    existem com sentido equivalente (Vendas ~ "Receita de vendas";
--    "Outras receitas"/"Outros" ~ "Outras entradas"): apenas ajusta applies_to.
insert into public.categories (
  workspace_id, name, category_type, icon, color, is_system, is_active, created_by, applies_to
)
values
  -- PF — receitas
  (null, 'Freelance', 'income', null, null, true, true, null, 'personal'),
  (null, 'Reembolso', 'income', null, null, true, true, null, 'personal'),
  (null, 'Presente', 'income', null, null, true, true, null, 'personal'),
  (null, 'Aluguel recebido', 'income', null, null, true, true, null, 'personal'),
  -- PF — despesas
  (null, 'Dívidas', 'expense', null, null, true, true, null, 'personal'),
  -- PJ — receitas
  (null, 'Prestação de serviços', 'income', null, null, true, true, null, 'business'),
  (null, 'Comissão', 'income', null, null, true, true, null, 'business'),
  (null, 'Recebimentos', 'income', null, null, true, true, null, 'business'),
  (null, 'Contratos', 'income', null, null, true, true, null, 'business'),
  -- PJ — despesas
  (null, 'Folha', 'expense', null, null, true, true, null, 'business'),
  (null, 'Marketing', 'expense', null, null, true, true, null, 'business'),
  (null, 'Aluguel', 'expense', null, null, true, true, null, 'business'),
  (null, 'Equipamentos', 'expense', null, null, true, true, null, 'business')
on conflict (lower(name), category_type)
where workspace_id is null and is_system = true
do update set
  applies_to = excluded.applies_to,
  is_active = true;

-- 4) Indice de apoio para o filtro de categorias globais por contexto.
create index if not exists categories_applies_to_idx
  on public.categories (applies_to)
  where workspace_id is null and is_system = true;

comment on column public.categories.applies_to is
  'Contexto semantico da categoria global do sistema: personal (PF), business (PJ) ou both. Irrelevante para categorias customizadas de workspace (filtradas por workspace_id).';

commit;
