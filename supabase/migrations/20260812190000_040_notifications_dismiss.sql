begin;

-- NOTIF2: dispensar (excluir) uma notificação nunca afeta o
-- compromisso/registro de origem -- e notificações de agenda somem
-- automaticamente quando o compromisso é excluído (sem depender de nenhum
-- código de aplicação lembrar de sincronizar os dois).

-- Coluna dedicada (em vez de só metadata->>'agenda_item_id'): permite uma
-- FK real com "on delete cascade" -- a garantia fica no banco, não em
-- lógica de cliente que pode ser esquecida ou ficar fora de sincronia.
alter table public.notifications
  add column agenda_item_id uuid references public.agenda_items(id) on delete cascade;

-- O EXISTS evita violar a FK: notificações órfãs (compromisso já excluído
-- antes desta migration, sem cascade ainda) mantêm agenda_item_id nulo --
-- continuam dispensáveis manualmente (X/arrastar), só não ganham o cascade
-- automático retroativo, que não tem como existir para algo já apagado.
update public.notifications as n
  set agenda_item_id = (n.metadata->>'agenda_item_id')::uuid
  where n.type = 'agenda'
    and n.metadata ? 'agenda_item_id'
    and n.agenda_item_id is null
    and exists (
      select 1 from public.agenda_items as ai
      where ai.id = (n.metadata->>'agenda_item_id')::uuid
    );

create index notifications_agenda_item_idx
  on public.notifications (agenda_item_id)
  where agenda_item_id is not null;

-- Preenche agenda_item_id automaticamente a partir de metadata em todo
-- INSERT futuro -- agendaNotificationSync.js/createNotification continuam
-- só escrevendo metadata (nenhuma mudança de client necessária), sem
-- precisar saber da coluna nova.
create or replace function public.notifications_set_agenda_item_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.type = 'agenda' and new.metadata ? 'agenda_item_id' then
    new.agenda_item_id := (new.metadata->>'agenda_item_id')::uuid;
  end if;
  return new;
end;
$$;

create trigger notifications_set_agenda_item_id_trigger
  before insert on public.notifications
  for each row
  execute function public.notifications_set_agenda_item_id();

-- Dispensar uma notificação (botão X ou arrastar) é uma exclusão real,
-- restrita ao próprio usuário -- nunca ao compromisso/registro de origem
-- (só a linha em notifications some).
create policy notifications_delete_own
  on public.notifications
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

grant delete on table public.notifications to authenticated;

comment on column public.notifications.agenda_item_id is
  'FK opcional para agenda_items (on delete cascade) -- notificação de compromisso some automaticamente quando o compromisso é excluído. Preenchida via trigger a partir de metadata.agenda_item_id, nunca escrita direto pelo cliente.';

commit;
