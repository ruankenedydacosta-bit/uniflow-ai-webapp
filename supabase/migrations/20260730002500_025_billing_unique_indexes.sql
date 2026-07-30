begin;

-- BILLING2.5 (Bloco Asaas 2.5): reforca no banco tres invariantes que a
-- migration 024 deixou apenas como responsabilidade da aplicacao. Criada
-- agora, e nao junto da 024, porque so agora (antes de qualquer chamada
-- real a Asaas) as tabelas afetadas estao garantidamente vazias/sem
-- colisao -- ver auditoria do Bloco Asaas 2.5 (subscriptions com zero
-- linhas, billing_customers/billing_payments/webhook_events recem-criadas
-- pela 024, nenhuma delas ainda populada). Nenhum campo especulativo
-- (provider_status/last_synced_at/last_sync_error) e adicionado aqui --
-- ficam para o Bloco Asaas 3, quando o consumidor real existir.

-- 1. Um workspace nunca deve ter mais de um cliente Asaas vinculado --
-- billing_customers.workspace_id ja tinha apenas indice nao-unico
-- (billing_customers_workspace_id_idx, criado na 024).
create unique index billing_customers_workspace_id_uidx
  on public.billing_customers (workspace_id);

-- 2. Um asaas_subscription_id nunca deve aparecer em mais de uma linha de
-- subscriptions -- permite varios NULL (assinaturas ainda nao criadas na
-- Asaas), unicidade so quando o valor existe de fato.
create unique index subscriptions_asaas_subscription_id_uidx
  on public.subscriptions (asaas_subscription_id)
  where asaas_subscription_id is not null;

-- 3. No maximo uma assinatura "corrente" por workspace/plano. "Corrente" =
-- qualquer status exceto os dois estados terminais (canceled, expired) --
-- ver o check constraint de status ampliado pela 024:
-- ('trialing','active','past_due','canceled','expired','pending','suspended').
-- Cancelamento agendado (cancel_at_period_end=true) NAO tira a assinatura
-- de "corrente" enquanto o acesso continua vigente: pela decisao comercial
-- registrada na 024 (cancelamento nunca corta acesso imediato), a
-- assinatura permanece com status='active' ate o corte efetivo em
-- cancel_effective_at -- so entao vira 'canceled'. Ou seja, filtrar por
-- status ja captura corretamente "cancelamento agendado com acesso ainda
-- vigente" como corrente, sem precisar checar cancel_at_period_end aqui.
create unique index subscriptions_one_current_per_workspace_plan_uidx
  on public.subscriptions (workspace_id, plan_id)
  where status not in ('canceled', 'expired');

commit;
