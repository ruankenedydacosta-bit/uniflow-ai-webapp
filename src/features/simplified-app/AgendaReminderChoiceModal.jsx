import { useEffect, useRef, useState } from 'react';
import Button from '../../components/ui/Button/Button.jsx';
import Modal from '../../components/ui/Modal/Modal.jsx';
import { getAgendaPushReminderState } from '../agenda-push/agendaPushReminderService.js';
import { prefersReducedMotion } from '../agenda-push/agendaReminderAnimation.js';
import { sendAgendaReminderDecision } from '../mobile-push/pushEdgeFunctions.js';
import { FormMessage } from '../../pages/agenda/AgendaFormPrimitives.jsx';
import styles from './AgendaReminderChoiceModal.module.css';

const OFFSET_OPTIONS = [
  { offset: '30', label: '30 min antes', confirmedLabel: '30 min antes' },
  { offset: '60', label: '1h antes', confirmedLabel: '1h antes' },
  { offset: 'none', label: 'Não precisa', confirmedLabel: 'Sem lembrete' },
];

// AGPUSH2: a confirmacao fica visivel um instante antes do modal recolher,
// e o recolhimento acontece antes da particula nascer -- o encadeamento
// inteiro (confirmacao + recolhimento + trajetoria) fica em torno de 1s.
const CONFIRM_HOLD_MS = 120;
const COLLAPSE_MS = 180;
// Com prefers-reduced-motion nao ha recolhimento nem trajetoria: so a
// confirmacao e um fade curto.
const REDUCED_MOTION_HOLD_MS = 90;

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.checkIcon}>
      <path d="M5 12.5 10 17.5 19 7" />
    </svg>
  );
}

function wait(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

/**
 * AGPUSH1/AGPUSH2: fallback iPhone (sem actions de notificação) e
 * reabertura via deep link (?item=<id>&reminderPrompt=1) -- mesma escolha
 * (30min/1h/Não precisa) oferecida pelas actions do Android, dentro do
 * modal já usado pela Agenda (nenhuma área nova). Sempre confere o estado
 * ATUAL no servidor antes de mostrar os botões: se outro dispositivo já
 * decidiu, mostra só uma confirmação -- nunca reoferece a escolha.
 *
 * AGPUSH2 (microinteração): a persistência vem SEMPRE primeiro. A
 * confirmação visual, o recolhimento do modal e a partícula que viaja até
 * o card são consequência de um sucesso real -- se o backend falhar, o
 * modal permanece aberto com o erro e nada disso acontece (a UX nunca diz
 * que o lembrete foi aplicado quando não foi).
 */
function AgendaReminderChoiceModal({ item, onClose, onReminderApplied }) {
  const [state, setState] = useState({ status: 'loading', decisionMade: false });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(null);
  const [isCollapsing, setIsCollapsing] = useState(false);
  const [localError, setLocalError] = useState(null);
  const contentRef = useRef(null);

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

  // Geometria da origem da partícula: o próprio diálogo, medido no
  // instante em que ele ainda está na tela (getBoundingClientRect é
  // relativo à viewport, e o overlay da animação é position:fixed -- por
  // isso a trajetória acerta o destino mesmo com a página rolada).
  function readOriginRect() {
    const dialog = contentRef.current?.closest('[role="dialog"]');
    return dialog?.getBoundingClientRect?.() ?? null;
  }

  async function handleChoose(option) {
    if (isSubmitting || confirmed) return;
    setIsSubmitting(true);
    setLocalError(null);

    // 1. PERSISTE PRIMEIRO -- a animação nunca antecipa o resultado real.
    const result = await sendAgendaReminderDecision({
      agendaItemId: item.id,
      offset: option.offset,
    });

    if (result?.error) {
      setIsSubmitting(false);
      setLocalError('Não foi possível registrar sua escolha. Tente novamente.');
      return;
    }

    // 2. Só depois do sucesso confirmado: feedback visual.
    const reduced = prefersReducedMotion();
    setIsSubmitting(false);
    setConfirmed(option);

    await wait(reduced ? REDUCED_MOTION_HOLD_MS : CONFIRM_HOLD_MS);

    const originRect = readOriginRect();

    if (!reduced) {
      setIsCollapsing(true);
      await wait(COLLAPSE_MS);
    }

    onReminderApplied?.({
      agendaItemId: item.id,
      // 'none' => decisão real de NÃO lembrar: nenhum indicador no card e
      // nenhuma partícula viajando (nada foi instalado no compromisso).
      offsetMinutes: option.offset === 'none' ? null : Number.parseInt(option.offset, 10),
      originRect,
    });
  }

  const isLoading = state.status === 'loading';
  const isBusy = isSubmitting || Boolean(confirmed);

  return (
    <Modal
      open
      onClose={onClose}
      closeOnOverlayClick={!isBusy}
      closeOnEsc={!isBusy}
      title="Quando devo te lembrar?"
      description={`"${item.title}"`}
      size="sm"
      className={[
        styles.dialog,
        isCollapsing ? styles.dialogCollapsing : '',
        confirmed?.offset === 'none' && isCollapsing ? styles.dialogDissolving : '',
      ].filter(Boolean).join(' ')}
      footer={(
        <Button variant="ghost" onClick={onClose} disabled={isBusy}>
          Fechar
        </Button>
      )}
    >
      <div ref={contentRef}>
        {isLoading ? null : state.decisionMade ? (
          <p>Já registramos sua escolha para este compromisso.</p>
        ) : confirmed ? (
          <p className={styles.confirmation} role="status">
            <CheckIcon />
            {confirmed.confirmedLabel}
          </p>
        ) : (
          <div className={styles.choices}>
            {OFFSET_OPTIONS.map((option) => (
              <Button
                key={option.offset}
                className={styles.choiceButton}
                variant="secondary"
                loading={isSubmitting}
                disabled={isSubmitting}
                onClick={() => handleChoose(option)}
              >
                {option.label}
              </Button>
            ))}
            <FormMessage>{localError}</FormMessage>
          </div>
        )}
      </div>
    </Modal>
  );
}

export default AgendaReminderChoiceModal;
