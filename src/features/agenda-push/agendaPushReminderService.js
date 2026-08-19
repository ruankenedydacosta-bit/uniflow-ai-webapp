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
