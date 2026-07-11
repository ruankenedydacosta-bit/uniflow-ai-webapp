begin;

-- Catalogos pequenos e globais para a Fase 1 do Financeiro. Esta migration
-- depende de 20260711_002_financial_core.sql e deve ser testada primeiro no
-- UniFlow DEV.

create table public.account_types (
  code text primary key,
  name text not null,
  description text,
  display_order smallint not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_types_code_check check (
    code in (
      'checking',
      'savings',
      'cash',
      'credit_card',
      'investment',
      'digital_wallet',
      'other'
    )
  ),
  constraint account_types_name_not_blank check (length(btrim(name)) > 0),
  constraint account_types_display_order_positive check (display_order > 0),
  constraint account_types_display_order_key unique (display_order)
);

insert into public.account_types (
  code,
  name,
  description,
  display_order
)
values
  ('checking', 'Conta corrente', 'Conta usada no movimento financeiro do dia a dia.', 1),
  ('savings', 'Poupança', 'Conta de poupança ou reserva bancária.', 2),
  ('cash', 'Dinheiro', 'Valores mantidos em espécie.', 3),
  ('credit_card', 'Cartão de crédito', 'Limite e ciclo de fatura de cartão.', 4),
  ('investment', 'Investimentos', 'Conta ou carteira destinada a investimentos.', 5),
  ('digital_wallet', 'Carteira digital', 'Saldo mantido em carteira ou plataforma digital.', 6),
  ('other', 'Outra conta', 'Outro tipo de conta financeira.', 7)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  display_order = excluded.display_order,
  is_active = true;

alter table public.accounts
  add constraint accounts_account_type_fkey
  foreign key (account_type)
  references public.account_types(code)
  on update cascade
  on delete restrict;

insert into public.categories (
  workspace_id,
  name,
  category_type,
  icon,
  color,
  is_system,
  is_active,
  created_by
)
values
  (null, 'Salário', 'income', null, null, true, true, null),
  (null, 'Receita de vendas', 'income', null, null, true, true, null),
  (null, 'Rendimentos', 'income', null, null, true, true, null),
  (null, 'Outras entradas', 'income', null, null, true, true, null),
  (null, 'Moradia', 'expense', null, null, true, true, null),
  (null, 'Alimentação', 'expense', null, null, true, true, null),
  (null, 'Transporte', 'expense', null, null, true, true, null),
  (null, 'Saúde', 'expense', null, null, true, true, null),
  (null, 'Educação', 'expense', null, null, true, true, null),
  (null, 'Lazer', 'expense', null, null, true, true, null),
  (null, 'Assinaturas', 'expense', null, null, true, true, null),
  (null, 'Impostos', 'expense', null, null, true, true, null),
  (null, 'Fornecedores', 'expense', null, null, true, true, null),
  (null, 'Operacional', 'expense', null, null, true, true, null),
  (null, 'Outras despesas', 'expense', null, null, true, true, null),
  (null, 'Transferência', 'transfer', null, null, true, true, null)
on conflict (lower(name), category_type)
where workspace_id is null and is_system = true
do update set
  is_active = true;

create trigger account_types_set_updated_at
before update on public.account_types
for each row execute function public.set_updated_at();

alter table public.account_types enable row level security;

create policy account_types_select_active
on public.account_types
for select
to authenticated
using (is_active = true);

revoke all on table public.account_types from anon, authenticated;
grant select on table public.account_types to authenticated;

comment on table public.account_types is
  'Catalogo global e somente leitura dos tipos de conta aceitos pelo dominio financeiro.';

comment on table public.categories is
  'Categorias globais do sistema ou categorias customizadas isoladas por workspace; o catalogo inicial e pequeno e evolui por novas migrations.';

commit;
