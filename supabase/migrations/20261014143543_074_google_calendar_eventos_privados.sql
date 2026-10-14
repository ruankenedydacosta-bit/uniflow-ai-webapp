begin;

-- Épico #98 (Google Agenda), issue #272: evento privado ou confidencial do
-- Google passa a entrar na agenda (mapearEvento.js).
--
-- O sync completo repetido só insere evento alterado depois do último
-- completo. O privado que já existia nunca entrou e ficaria de fora. Com a
-- coluna nula, o próximo sync do calendário é um completo em que só o
-- privado passa nesse corte. O item que a pessoa excluiu no app continua
-- excluído. O completo terminado grava a data, e a exceção não se repete.
--
-- Fica fora do grant de select do client (055): é estado interno do sync.

alter table public.calendar_connection_calendars
  add column if not exists privados_importados_em timestamptz;

commit;
