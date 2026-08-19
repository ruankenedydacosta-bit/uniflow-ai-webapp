begin;

-- NOTIF3: substitui o dismiss por exclusão física (NOTIF2/migration 040)
-- por soft-dismiss (dismissed_at). Motivo: a sincronização de agenda
-- (agendaNotificationSync.js/listAgendaNotificationItemIds) precisa
-- continuar enxergando que um compromisso já gerou notificação mesmo
-- depois do usuário dispensá-la -- senão a notificação é recriada a cada
-- sincronização (abrir o sino, foreground, virada de minuto), porque o
-- hard delete apagava esse rastro por completo. Este é o bug real por
-- trás de "a notificação reaparece".

alter table public.notifications
  add column dismissed_at timestamptz;

-- Sem backfill: linhas existentes nascem dismissed_at = null -- continuam
-- visíveis normalmente, mesmo comportamento de antes desta migration.

-- Reaproveita a policy de UPDATE já existente (notifications_update_own,
-- migration 020) -- ownership por linha já garantido via
-- auth.uid() = user_id em USING e WITH CHECK, sem necessidade de nova
-- policy. O que muda é só o GRANT por coluna: Postgres aplica RLS (qual
-- linha) e o GRANT de coluna (quais colunas) em conjunto -- o grant
-- anterior restringia UPDATE do cliente só a read_at; passa a incluir
-- dismissed_at no mesmo padrão de privilégio mínimo.
grant update (read_at, dismissed_at)
  on table public.notifications to authenticated;

-- Dismiss deixa de ser uma exclusão física -- revoga a capacidade de
-- DELETE do cliente. Auditoria (read-only) confirmou que deleteNotification
-- (botão X / arrastar) era o ÚNICO uso de DELETE nesta tabela em todo o
-- projeto; a exclusão da notificação quando o compromisso de origem é
-- excluído continua funcionando via agenda_item_id ON DELETE CASCADE
-- (migration 040), que roda inteiramente no banco, independente de
-- qualquer policy de DELETE do cliente.
drop policy notifications_delete_own on public.notifications;
revoke delete on table public.notifications from authenticated;

comment on column public.notifications.dismissed_at is
  'Preenchido quando o usuário dispensa a notificação (X ou arrastar) -- soft-delete: a linha permanece para que a sincronização de agenda (agenda_item_id) saiba que este compromisso já foi notificado e não crie uma notificação duplicada. NULL = ainda visível na lista. Independente de read_at -- uma notificação pode ter sido lida e continuar visível, ou nunca lida e já dispensada.';

commit;
