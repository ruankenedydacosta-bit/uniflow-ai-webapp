import { useEffect, useState } from 'react';
import Button from '../../components/ui/Button/Button.jsx';
import Modal from '../../components/ui/Modal/Modal.jsx';
import { getAgendaPushReminderState } from '../agenda-push/agendaPushReminderService.js';
import { sendAgendaReminderDecision } from '../mobile-push/pushEdgeFunctions.js';
import { FormMessage } from '../../pages/agenda/AgendaFormPrimitives.jsx';
import styles from './AgendaReminderChoiceModal.module.css';

const OFFSET_OPTIONS = [
  { offset: '30', label: '30 min antes' },
  { offset: '60', label: '1h antes' },
  { offset: 'none', label: 'Não precisa' },
];

/**
 * AGPUSH1: fallback iPhone (sem actions de notificação) e reabertura via
 * deep link (?item=<id>&reminderPrompt=1) -- mesma escolha (30min/1h/Não
 * precisa) oferecida pelas actions do Android, dentro do modal já usado
 * pela Agenda (nenhuma área nova). Sempre confere o estado ATUAL no
 * servidor antes de mostrar os botões: se outro dispositivo (ex.: Android)
 * já decidiu, mostra só uma confirmação -- nunca reoferece a escolha
 * (mesma trava usada pela Edge Function: reminder_decision_at já
 * preenchido).
 */
function AgendaReminderChoiceModal({ item, onClose }) {
  const [state, setState] = useState({ status: 'loading', decisionMade: false });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const result = await getAgendaPushReminderState(item.id);
      if (cancelled) return;

      const decisionMade = Boolean(result?.data?.reminder_decision_at);
      setState({ status: 'ready', decisionMade });
    })();

    return () => {
      cancelled = true;
    };
  }, [item.id]);

  async function handleChoose(offset) {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setLocalError(null);

    const result = await sendAgendaReminderDecision({ agendaItemId: item.id, offset });

    if (result?.error) {
      setIsSubmitting(false);
      setLocalError('Não foi possível registrar sua escolha. Tente novamente.');
      return;
    }

    setIsSubmitting(false);
    onClose();
  }

  const isLoading = state.status === 'loading';

  return (
    <Modal
      open
      onClose={onClose}
      closeOnOverlayClick={!isSubmitting}
      closeOnEsc={!isSubmitting}
      title="Quando devo te lembrar?"
      description={`"${item.title}"`}
      size="sm"
      footer={(
        <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
          Fechar
        </Button>
      )}
    >
      {isLoading ? null : state.decisionMade ? (
        <p>Já registramos sua escolha para este compromisso.</p>
      ) : (
        <div className={styles.choices}>
          {OFFSET_OPTIONS.map((option) => (
            <Button
              key={option.offset}
              variant="secondary"
              loading={isSubmitting}
              disabled={isSubmitting}
              onClick={() => handleChoose(option.offset)}
            >
              {option.label}
            </Button>
          ))}
          <FormMessage>{localError}</FormMessage>
        </div>
      )}
    </Modal>
  );
}

export default AgendaReminderChoiceModal;
