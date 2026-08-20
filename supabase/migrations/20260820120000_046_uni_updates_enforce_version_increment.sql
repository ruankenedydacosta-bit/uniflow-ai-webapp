begin;

-- UNIUPD2: versionamento semântico OBRIGATÓRIO -- a versão de uma nova
-- novidade nunca é uma escolha livre de quem publica (nem manual, nem
-- responsabilidade do cliente). A partir da segunda linha em
-- public.updates, este trigger SEMPRE sobrescreve NEW.version com o
-- próximo valor da sequência, calculado a partir da versão mais alta já
-- publicada -- torna impossível a versão "ficar presa" ou divergir entre
-- Central de Novidades, Sobre a UniFlow AI, Conta e a notificação (todas
-- consomem a mesma tabela via resolveCurrentVersion, ver
-- uniUpdatesData.js).
--
-- Regra (odômetro, mesma replicada em JS -- getNextSemver em
-- uniUpdatesData.js, usada só para o front PREVER a próxima versão, nunca
-- para decidir o valor real gravado):
--   PATCH incrementa 1 a 1 até 9; ao passar de 9, MINOR incrementa e
--   PATCH volta a 0; ao MINOR passar de 9, MAJOR incrementa e MINOR/PATCH
--   voltam a 0. Exemplo: 1.0.1, 1.0.2 ... 1.0.9, 1.1.0 ... 1.9.9, 2.0.0.
--
-- A primeira linha (tabela vazia, ex.: o seed 1.0.0 da migration 045)
-- mantém a versão informada -- não há "versão anterior" da qual partir.

create or replace function public.uni_updates_next_version(current_version text)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  major int;
  minor int;
  patch int;
begin
  major := split_part(current_version, '.', 1)::int;
  minor := split_part(current_version, '.', 2)::int;
  patch := split_part(current_version, '.', 3)::int;

  if patch < 9 then
    patch := patch + 1;
  elsif minor < 9 then
    minor := minor + 1;
    patch := 0;
  else
    major := major + 1;
    minor := 0;
    patch := 0;
  end if;

  return major || '.' || minor || '.' || patch;
end;
$$;

comment on function public.uni_updates_next_version(text) is
  'UNIUPD2: próxima versão obrigatória no padrão MAJOR.MINOR.PATCH (odômetro 0-9 por segmento) -- mesma regra replicada em getNextSemver (uniUpdatesData.js).';

create or replace function public.uni_updates_set_next_version()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  current_max text;
begin
  select version into current_max
  from public.updates
  order by
    split_part(version, '.', 1)::int desc,
    split_part(version, '.', 2)::int desc,
    split_part(version, '.', 3)::int desc
  limit 1;

  -- Primeira novidade publicada (tabela vazia): não há versão anterior,
  -- mantém o valor informado (ex.: o seed 1.0.0).
  if current_max is null then
    return new;
  end if;

  new.version := public.uni_updates_next_version(current_max);
  return new;
end;
$$;

comment on function public.uni_updates_set_next_version() is
  'UNIUPD2: trigger BEFORE INSERT que substitui NEW.version pelo próximo valor obrigatório -- quem publica nunca escolhe a versão manualmente.';

create trigger updates_set_next_version
  before insert on public.updates
  for each row
  execute function public.uni_updates_set_next_version();

commit;
