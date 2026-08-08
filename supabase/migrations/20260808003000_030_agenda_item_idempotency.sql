begin;

alter table public.agenda_items
  add column client_operation_id uuid;

comment on column public.agenda_items.client_operation_id is
  'Chave imutavel gerada pelo cliente para tornar a criacao idempotente. Duas intencoes legitimas devem usar UUIDs diferentes.';

create unique index agenda_items_workspace_client_operation_uidx
  on public.agenda_items (workspace_id, client_operation_id)
  where client_operation_id is not null;

create or replace function public.prevent_agenda_items_immutable_field_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.workspace_id is distinct from old.workspace_id then
    raise exception 'agenda_items: workspace_id cannot be changed after creation';
  end if;
  if new.created_by is distinct from old.created_by then
    raise exception 'agenda_items: created_by cannot be changed after creation';
  end if;
  if new.client_operation_id is distinct from old.client_operation_id then
    raise exception 'agenda_items: client_operation_id cannot be changed after creation';
  end if;
  return new;
end;
$$;

commit;
