begin;

-- RLS define quais linhas cada membro pode acessar. Estes grants habilitam
-- somente as operacoes necessarias para que a role autenticada alcance as
-- policies existentes da Agenda.
revoke all on table public.agenda_items from anon;

grant select, insert, update, delete
  on table public.agenda_items
  to authenticated;

commit;
