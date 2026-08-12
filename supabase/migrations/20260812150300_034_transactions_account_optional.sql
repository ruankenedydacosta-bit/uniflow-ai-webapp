begin;

-- account_id era NOT NULL desde a criacao da tabela (002_financial_core),
-- o que forcava toda entrada/despesa a exigir uma conta bancaria antes de
-- poder ser salva -- tanto no chat com a Uni quanto no formulario manual de
-- Lancamentos. Essa exigencia vinha causando meses de atrito real: a
-- resolucao de conta por texto e' inerentemente ambigua/instavel (nome
-- falado, transcricao de voz, conta arquivada, homonimos), e o usuario
-- relatou que a pergunta "em qual conta?" trava o fluxo com frequencia,
-- as vezes nem aparecendo de forma consistente.
--
-- A partir desta migration, account_id fica opcional: um lancamento pode
-- ser salvo so com valor + categoria + descricao, sem nenhuma conta
-- associada. A FK composta (account_id, workspace_id) ja tolera NULL
-- nativamente em Postgres (uma foreign key so e' verificada quando TODAS
-- as colunas referenciadas sao nao-nulas) -- nenhuma mudanca na FK e'
-- necessaria. RLS de transactions verifica apenas workspace_id, nunca
-- account_id, entao as policies existentes continuam validas sem alteracao.
--
-- Transferencia e ajuste de saldo continuam exigindo conta na camada de
-- aplicacao (financialIntentAction.js/transactionService.js): uma
-- transferencia sem origem/destino ou um ajuste sem a conta cujo saldo
-- esta sendo alterado nao tem significado -- a coluna ficar nullable no
-- banco nao afrouxa essa regra de negocio, so deixa de bloquear no nivel
-- errado (constraint de banco) o caso que agora e' legitimo (entrada/
-- despesa sem conta).
alter table public.transactions
  alter column account_id drop not null;

commit;
