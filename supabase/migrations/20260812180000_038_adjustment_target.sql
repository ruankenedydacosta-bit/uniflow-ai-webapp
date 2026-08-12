begin;

-- BLOCO SALDO/RECEITA/DESPESA EDITAVEIS: até agora um ajuste
-- (transaction_type = 'adjustment') sempre corrigia o saldo TOTAL do
-- workspace. A pedido do usuário, Receita e Despesa do mês ganham o MESMO
-- mecanismo de correção (informar o total que deveria ser, sem apagar o
-- histórico real) -- adjustment_target marca qual card aquele ajuste
-- corrige. NULL (todo ajuste existente, retrocompatível) continua
-- significando "corrige o saldo total"; 'income'/'expense' passam a
-- corrigir especificamente o total de Receita/Despesa do mês em que a
-- transação está datada. O efeito no saldo total continua existindo em
-- QUALQUER caso (get_derived_workspace_balance já soma todo adjustment_delta
-- sem conta, migrations 036/037) -- corrigir uma despesa contada errado
-- também corrige, corretamente, o saldo que dependia dela.
alter table public.transactions
  add column if not exists adjustment_target text;

alter table public.transactions
  add constraint transactions_adjustment_target_check check (
    (transaction_type = 'adjustment' and adjustment_target in ('balance', 'income', 'expense'))
    or (transaction_type = 'adjustment' and adjustment_target is null)
    or (transaction_type <> 'adjustment' and adjustment_target is null)
  );

comment on column public.transactions.adjustment_target is
  'Só preenchido quando transaction_type = adjustment. NULL ou ''balance'' = corrige o saldo total do workspace (comportamento original). ''income''/''expense'' = corrige especificamente o total de Receita/Despesa do mês em que a transação está datada (adjustment_delta continua sendo o valor assinado aplicado).';

commit;
