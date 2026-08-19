// AGPUSH1: leitura do estado de pergunta/lembrete de push de UM
// compromisso -- RLS-scoped (agenda_push_reminders_select_own, migration
// 043), nunca expoe decision_token (fora do GRANT de SELECT). Usada pelo
// fallback iPhone/deep link para decidir se ainda deve mostrar a escolha
// (30min/1h/Nao precisa) ou se outro dispositivo ja respondeu -- mesmo
// padrao de contrato { data, error, isConfigured } de pushSubscriptionService.js.
import { isSupabaseConfigured, supabase } from '../../services/supabaseClient.js';

function createResult(data, error = null) {
  return {
    data,
    error,
    isConfigured: isSupabaseConfigured,
  };
}

function createUnavailableResult(data) {
  return createResult(data, {
    code: 'SUPABASE_NOT_CONFIGURED',
    message: 'Supabase ainda nao esta configurado.',
  });
}

/**
 * Retorna o estado atual da pergunta/lembrete para um compromisso, ou
 * `null` (sem erro) quando a pergunta ainda nao foi enviada para este
 * item -- nunca lanca.
 */
export async function getAgendaPushReminderState(agendaItemId) {
  if (!supabase) return createUnavailableResult(null);
  if (!agendaItemId) return createResult(null);

  const { data, error } = await supabase
    .from('agenda_push_reminders')
    .select('id, prompt_sent_at, reminder_offset_minutes, reminder_decision_at, reminder_sent_at')
    .eq('agenda_item_id', agendaItemId)
    .maybeSingle();

  return createResult(data ?? null, error);
}

/**
 * AGPUSH2: estados de lembrete de VARIOS compromissos de uma vez -- fonte
 * do indicador ("30 min antes"/"1h antes") exibido nos cards da Agenda.
 * Uma consulta por lista renderizada, nunca uma por card.
 *
 * Somente LEITURA, RLS-scoped (agenda_push_reminders_select_own): traz
 * apenas as linhas do proprio usuario, e nunca seleciona decision_token
 * (fora do GRANT de SELECT, migration 043 -- inalterada por esta fase).
 */
export async function listAgendaPushReminderStates(agendaItemIds) {
  if (!supabase) return createUnavailableResult([]);

  const ids = (agendaItemIds ?? []).filter((id) => typeof id === 'string' && id);
  if (ids.length === 0) return createResult([]);

  const { data, error } = await supabase
    .from('agenda_push_reminders')
    .select('id, agenda_item_id, reminder_offset_minutes, reminder_decision_at, reminder_sent_at')
    .in('agenda_item_id', ids);

  return createResult(data ?? [], error);
}
