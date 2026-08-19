// AGPUSH2 (microinteracao): logica PURA do indicador de lembrete exibido
// no card do compromisso. Sem DOM, sem React -- o card so pergunta "este
// compromisso tem lembrete, e qual rotulo mostrar?".
//
// A fonte da verdade e SEMPRE o estado persistido em agenda_push_reminders
// (reminder_offset_minutes). Nunca derivado de "a animacao rodou": recarregar
// a pagina, reabrir o app ou trocar de dispositivo mostra o mesmo indicador,
// porque ele vem do banco -- nunca de estado local de animacao.

export const REMINDER_OFFSET_LABELS = Object.freeze({
  30: '30 min antes',
  60: '1h antes',
});

/**
 * Traduz o estado persistido de UM compromisso no indicador do card.
 * Retorna `null` quando nao ha lembrete a mostrar:
 * - nenhuma linha (pergunta nunca enviada);
 * - decisao "Nao precisa" (reminder_decision_at preenchido, offset nulo);
 * - offset fora dos valores aceitos (defesa: o banco ja restringe a 30/60
 *   por constraint, mas a UI nunca inventa um rotulo para valor
 *   desconhecido).
 */
export function resolveReminderIndicator(reminderState) {
  const offset = reminderState?.reminder_offset_minutes;
  if (offset !== 30 && offset !== 60) return null;

  return Object.freeze({
    offsetMinutes: offset,
    label: REMINDER_OFFSET_LABELS[offset],
  });
}

/**
 * Indexa uma lista de estados por agenda_item_id -- consumido pelo card
 * para uma busca O(1) por item, sem varrer a lista a cada render.
 */
export function indexReminderStatesByItemId(reminderStates) {
  const byItemId = new Map();
  for (const state of reminderStates ?? []) {
    if (typeof state?.agenda_item_id === 'string') {
      byItemId.set(state.agenda_item_id, state);
    }
  }
  return byItemId;
}
