begin;

-- Criar categoria falhava com 42501 "permission denied for table categories".
-- A 002 libera INSERT em categories por coluna, e a 014 criou applies_to sem
-- incluir a coluna nesse grant. O app manda applies_to (contexto pessoal ou
-- empresa) em toda categoria nova (useCategories.saveCategory), e uma coluna
-- fora do grant recusa o INSERT inteiro.
--
-- Só INSERT: updateCategory não altera applies_to. A RLS de categories segue
-- igual (só workspace do membro), e o CHECK categories_applies_to_check
-- continua limitando o valor a personal, business ou both.
grant insert (applies_to) on public.categories to authenticated;

commit;
