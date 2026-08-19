import { useCallback, useEffect, useState } from 'react';
import { listAgendaPushReminderStates } from './agendaPushReminderService.js';
import { indexReminderStatesByItemId } from './agendaReminderIndicator.js';

/**
 * AGPUSH2: estados de lembrete dos compromissos atualmente renderizados --
 * alimenta o indicador ("30 min antes"/"1h antes") do card.
 *
 * O indicador NUNCA vem de "a animacao rodou": esta fonte e sempre o
 * estado persistido no banco. Por isso ele sobrevive a reload, a fechar/
 * reabrir o app e a decidir por outro dispositivo (Android decidindo pela
 * action, iPhone decidindo pelo modal).
 *
 * `applyDecision` existe para o unico caso em que ja sabemos o valor real
 * antes de reler o banco: a decisao que ACABOU de ser confirmada pelo
 * backend nesta mesma tela. Nao e um palpite otimista -- so e chamada
 * depois de `sendAgendaReminderDecision` responder sem erro (ver
 * AgendaReminderChoiceModal).
 */
export function useAgendaReminderStates(agendaItemIds) {
  const [statesByItemId, setStatesByItemId] = useState(() => new Map());

  // A lista de ids muda de identidade a cada render (novo array), mas o
  // conteudo raramente muda -- a chave estavel evita refetch a cada render
  // sem precisar memoizar do lado de quem chama.
  const idsKey = (agendaItemIds ?? []).join(',');

  const refresh = useCallback(async (ids) => {
    const result = await listAgendaPushReminderStates(ids);
    if (result?.error) return null;
    return indexReminderStatesByItemId(result?.data);
  }, []);

  useEffect(() => {
    const ids = idsKey ? idsKey.split(',') : [];

    // setState nunca sincrono dentro do efeito (mesmo padrao de
    // useNotifications.js/useWebPush.js) -- toda transicao de estado passa
    // pelo corpo assincrono, inclusive o caso "nao ha nada para buscar".
    let cancelled = false;
    (async () => {
      if (ids.length === 0) {
        if (!cancelled) setStatesByItemId(new Map());
        return;
      }

      const nextStates = await refresh(ids);
      if (cancelled || !nextStates) return;
      setStatesByItemId(nextStates);
    })();

    return () => {
      cancelled = true;
    };
  }, [idsKey, refresh]);

  const applyDecision = useCallback((agendaItemId, offsetMinutes) => {
    setStatesByItemId((previous) => {
      const next = new Map(previous);
      next.set(agendaItemId, {
        ...(previous.get(agendaItemId) ?? {}),
        agenda_item_id: agendaItemId,
        reminder_offset_minutes: offsetMinutes,
        reminder_decision_at: new Date().toISOString(),
      });
      return next;
    });
  }, []);

  return { statesByItemId, applyDecision };
}
