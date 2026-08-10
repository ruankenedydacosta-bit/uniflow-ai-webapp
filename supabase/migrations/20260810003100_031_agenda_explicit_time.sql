begin;

-- Discriminador semantico para diferenciar um horario real (inclusive 00:00)
-- da ancora tecnica em starts_at usada por compromissos que possuem somente
-- data. DEFAULT true preserva o comportamento de todos os registros legados.
alter table public.agenda_items
  add column has_explicit_time boolean not null default true;

comment on column public.agenda_items.has_explicit_time is
  'True quando starts_at contem um horario explicitamente informado. False quando starts_at e apenas a ancora tecnica da data e a UI deve exibir "Sem horario". is_all_day tem precedencia e deve ser exibido como "Dia inteiro".';

commit;
