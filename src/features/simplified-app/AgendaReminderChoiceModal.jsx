import { useEffect, useRef, useState } from 'react';
import ChoiceRow from '../../components/ui/ChoiceRow/ChoiceRow.jsx';
import Modal from '../../components/ui/Modal/Modal.jsx';
import { getAgendaPushReminderState } from '../agenda-push/agendaPushReminderService.js';
import { prefersReducedMotion } from '../agenda-push/agendaReminderAnimation.js';
import {
  getReminderMotionProfile,
  REMINDER_MOTION_VARIANTS,
  resolveMotionVariantForOffset,
} from '../agenda-push/agendaReminderMotionProfiles.js';
import { sendAgendaReminderDecision } from '../mobile-push/pushEdgeFunctions.js';
import { formatReminderPromptWhen } from './simplifiedAgendaCalendar.js';
import { PhBellIcon, PhBellRingingIcon, PhBellSlashIcon } from './SimplifiedIcons.jsx';
import styles from './AgendaReminderChoiceModal.module.css';

// AGPUSH4: cada opção carrega sua própria assinatura de movimento --
// '30' é sempre energetic, '60' é sempre calm, 'none' é sempre none
// (mapeamento explícito em agendaReminderMotionProfiles.js, nunca por
// posição no array).
// Tela 22f: cada opção tem o seu sino; "Sem lembrete" fica sem cor de marca.
const OFFSET_OPTIONS = [
  { offset: '30', label: '30 min antes', confirmedLabel: '30 min antes', icon: PhBellRingingIcon, tone: 'violet' },
  { offset: '60', label: '1h antes', confirmedLabel: '1h antes', icon: PhBellIcon, tone: 'blue' },
  { offset: 'none', label: 'Sem lembrete', confirmedLabel: 'Sem lembrete', icon: PhBellSlashIcon },
];

// Com prefers-reduced-motion não há recolhimento nem trajetória: só a
// confirmação e um fade curto -- mesmo valor para as três opções (não faz
// sentido variar a assinatura de movimento quando o movimento em si foi
// dispensado).
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
 * AGPUSH1/AGPUSH2/AGPUSH4: fallback iPhone (sem actions de notificação) e
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
 *
 * AGPUSH4: os tempos de confirmação/recolhimento vêm do perfil de
 * movimento da opção escolhida (agendaReminderMotionProfiles.js) --
 * "30 min antes" é mais rápido/energético, "1h antes" mais suave/calmo,
 * "Não precisa" mais curto ainda e nunca chega a instanciar partícula.
 */
function AgendaReminderChoiceModal({ item, onClose, onReminderApplied }) {
  const [state, setState] = useState({ status: 'loading', decisionMade: false });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [choosing, setChoosing] = useState(null);
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
    setChoosing(option.offset);
    setLocalError(null);

    // 1. PERSISTE PRIMEIRO -- a animação nunca antecipa o resultado real.
    const result = await sendAgendaReminderDecision({
      agendaItemId: item.id,
      offset: option.offset,
    });

    if (result?.error) {
      setIsSubmitting(false);
      setChoosing(null);
      setLocalError('Não foi possível registrar sua escolha. Tente novamente.');
      return;
    }

    // 2. Só depois do sucesso confirmado: feedback visual, no ritmo do
    // perfil desta opção específica.
    const variant = resolveMotionVariantForOffset(option.offset);
    const profile = getReminderMotionProfile(variant);
    const reduced = prefersReducedMotion();
    setIsSubmitting(false);
    setConfirmed(option);

    await wait(reduced ? REDUCED_MOTION_HOLD_MS : profile.confirmMs);

    const originRect = readOriginRect();

    if (!reduced) {
      setIsCollapsing(true);
      await wait(profile.modalCollapseMs);
    }

    onReminderApplied?.({
      agendaItemId: item.id,
      variant,
      // 'none' => decisão real de NÃO lembrar: nenhum indicador no card e
      // nenhuma partícula viajando (nada foi instalado no compromisso).
      offsetMinutes: option.offset === 'none' ? null : Number.parseInt(option.offset, 10),
      originRect,
    });
  }

  const isLoading = state.status === 'loading';
  const isBusy = isSubmitting || Boolean(confirmed);
  // AGPUSH4: as durações de CSS (confirmationIn/dialogCollapsing) vêm do
  // mesmo perfil via custom properties -- nunca uma segunda constante
  // desalinhada da que o JS usa para os `wait()` acima. Antes de uma
  // escolha existir, usa o perfil calm (mais conservador) como neutro.
  const activeProfile = getReminderMotionProfile(
    confirmed ? resolveMotionVariantForOffset(confirmed.offset) : REMINDER_MOTION_VARIANTS.CALM,
  );
  const motionStyle = {
    '--uf-agenda-confirm-ms': `${activeProfile.confirmMs}ms`,
    '--uf-agenda-collapse-ms': `${activeProfile.modalCollapseMs}ms`,
    '--uf-agenda-dissolve-ms': `${activeProfile.dissolveFlashMs ?? activeProfile.modalCollapseMs}ms`,
  };

  const when = formatReminderPromptWhen(item);

  // O X da folha também respeita a gravação e o recolhimento em andamento.
  function handleClose() {
    if (isBusy) return;
    onClose();
  }

  // Tela 22f: o X da folha fecha; não há botão Fechar no rodapé.
  return (
    <Modal
      open
      onClose={handleClose}
      closeOnOverlayClick={!isBusy}
      closeOnEsc={!isBusy}
      title="Quando devo te lembrar?"
      description={when ? `${item.title} · ${when}` : item.title}
      size="sm"
      style={motionStyle}
      className={[
        styles.dialog,
        isCollapsing ? styles.dialogCollapsing : '',
        confirmed?.offset === 'none' && isCollapsing ? styles.dialogDissolving : '',
      ].filter(Boolean).join(' ')}
    >
      <div ref={contentRef} className={styles.content}>
        {isLoading ? null : state.decisionMade ? (
          <p className={styles.decisionMade}>Já registramos sua escolha para este compromisso.</p>
        ) : confirmed ? (
          <p className={styles.confirmation} role="status">
            <CheckIcon />
            {confirmed.confirmedLabel}
          </p>
        ) : (
          <>
            <div className={styles.choices}>
              {OFFSET_OPTIONS.map((option) => {
                const OptionIcon = option.icon;
                return (
                  <ChoiceRow
                    key={option.offset}
                    className={styles.choiceButton}
                    title={option.label}
                    icon={<OptionIcon />}
                    iconTone={option.tone}
                    checked={choosing === option.offset}
                    disabled={isSubmitting}
                    onClick={() => handleChoose(option)}
                  />
                );
              })}
            </div>
            {localError ? <p className={styles.error} role="alert">{localError}</p> : null}
            <p className={styles.hint}>A escolha é salva assim que você toca na opção.</p>
          </>
        )}
      </div>
    </Modal>
  );
}

export default AgendaReminderChoiceModal;
