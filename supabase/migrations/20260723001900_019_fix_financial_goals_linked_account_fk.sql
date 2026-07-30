begin;

-- Corrective migration for 20260720_011_financial_goals.sql.
--
-- That migration's `linked_account_id` foreign keys on `public.financial_goals`
-- and `public.goal_contributions` referenced a table named `public.financial_accounts`,
-- which has never existed in this project's migration history (the real table
-- is `public.accounts`, created in 20260711_002_financial_core.sql).
--
-- Migration 011 is kept unedited as historical record. This migration corrects
-- the foreign keys safely and idempotently, without assuming any particular
-- prior state:
--   - if `financial_goals`/`goal_contributions` do not exist yet, this is a
--     safe no-op (nothing to fix);
--   - if they exist with the old (broken or already-correct) FK on
--     `linked_account_id`, that constraint is dropped by its real name
--     (looked up dynamically, never assumed) and recreated pointing to
--     `public.accounts`;
--   - no table is recreated and no data is touched or destroyed.

do $$
declare
  fk_name text;
begin
  if to_regclass('public.financial_goals') is not null then
    select con.conname into fk_name
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'financial_goals'
      and con.contype = 'f'
      and con.conkey = (
        select array_agg(attnum order by attnum)
        from pg_attribute
        where attrelid = rel.oid and attname = 'linked_account_id'
      );

    if fk_name is not null then
      execute format('alter table public.financial_goals drop constraint %I', fk_name);
    end if;

    execute
      'alter table public.financial_goals '
      || 'add constraint financial_goals_linked_account_id_fkey '
      || 'foreign key (linked_account_id) references public.accounts(id) on delete set null';
  end if;

  if to_regclass('public.goal_contributions') is not null then
    select con.conname into fk_name
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'goal_contributions'
      and con.contype = 'f'
      and con.conkey = (
        select array_agg(attnum order by attnum)
        from pg_attribute
        where attrelid = rel.oid and attname = 'linked_account_id'
      );

    if fk_name is not null then
      execute format('alter table public.goal_contributions drop constraint %I', fk_name);
    end if;

    execute
      'alter table public.goal_contributions '
      || 'add constraint goal_contributions_linked_account_id_fkey '
      || 'foreign key (linked_account_id) references public.accounts(id) on delete set null';
  end if;
end $$;

commit;
