begin;

-- Criar meta falhava com 42501 pela tela Metas e pela conversa: o app não
-- envia user_id, a coluna não tinha default e a policy de insert compara
-- auth.uid() = user_id. Mesmo padrão do created_by das outras tabelas.
alter table public.financial_goals
  alter column user_id set default auth.uid();

commit;
