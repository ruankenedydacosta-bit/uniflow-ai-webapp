begin;

-- Lançamento com data depois de hoje é previsto (status 'pending'), não
-- realizado. O formulário passou a gravar assim; esta migration corrige o que
-- já estava salvo como 'completed' com data futura, que ainda conta no saldo.
-- Roda uma vez. Fica de fora o que veio do Open Finance (data do banco) e o
-- ajuste de saldo.

update public.transactions
set status = 'pending'
where status = 'completed'
  and transaction_date > (now() at time zone 'America/Sao_Paulo')::date
  and source_type = 'manual'
  and external_provider is null
  and transaction_type in ('income', 'expense', 'transfer');

commit;
