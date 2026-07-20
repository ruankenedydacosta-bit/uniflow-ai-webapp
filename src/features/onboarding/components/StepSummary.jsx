import Button from '../../../components/ui/Button';
import Badge from '../../../components/ui/Badge';
import { MODE_OPTIONS, GOAL_OPTIONS, TONE_OPTIONS } from '../onboardingConstants';
import styles from '../OnboardingPage.module.css';

const MODE_MAP = Object.fromEntries(MODE_OPTIONS.map((m) => [m.id, m]));
const GOAL_MAP = Object.fromEntries(GOAL_OPTIONS.map((g) => [g.id, g]));
const TONE_MAP = Object.fromEntries(TONE_OPTIONS.map((t) => [t.id, t]));

function SummaryRow({ label, value, onEdit }) {
  return (
    <div className={styles.summaryRow}>
      <div className={styles.summaryRowContent}>
        <span className={styles.summaryLabel}>{label}</span>
        <span className={styles.summaryValue}>{value}</span>
      </div>
      <button type="button" className={styles.summaryEdit} onClick={onEdit}>
        Editar
      </button>
    </div>
  );
}

function StepSummary({ data, onGoToStep, onComplete, saving }) {
  const modeOption = MODE_MAP[data.mode];
  const goalOption = GOAL_MAP[data.goal];
  const toneOption = TONE_MAP[data.userTone];

  return (
    <div className={styles.stepContent}>
      <div className={styles.stepHeader}>
        <span className={styles.summaryIcon} aria-hidden="true">✦</span>
        <h2 className={styles.stepTitle}>Tudo pronto! Revise suas escolhas</h2>
        <p className={styles.stepDescription}>
          Confira se está tudo certo antes de entrar. Você pode voltar e ajustar qualquer item.
        </p>
      </div>

      <div className={styles.summaryGrid}>
        <SummaryRow
          label="Modo de uso"
          value={modeOption?.title || data.mode}
          onEdit={() => onGoToStep(2)}
        />
        <SummaryRow
          label="Objetivo principal"
          value={data.goal === 'outro' ? data.goalText : (goalOption?.label || data.goal)}
          onEdit={() => onGoToStep(3)}
        />
        <SummaryRow
          label="Tom da Uni"
          value={toneOption?.title || data.userTone}
          onEdit={() => onGoToStep(5)}
        />

        <div className={styles.summaryRow}>
          <div className={styles.summaryRowContent}>
            <span className={styles.summaryLabel}>Workspaces</span>
            <div className={styles.summaryWorkspaces}>
              {(data.mode === 'personal' || data.mode === 'both') && (
                <Badge variant="primary" size="sm">Pessoal</Badge>
              )}
              {(data.mode === 'business' || data.mode === 'both') && (
                <Badge variant="outline" size="sm">Empresarial</Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className={styles.stepActions}>
        <Button variant="ghost" onClick={() => onGoToStep(5)}>Voltar</Button>
        <Button
          variant="primary"
          size="lg"
          loading={saving}
          onClick={onComplete}
        >
          Entrar na UniFlow AI
        </Button>
      </div>
    </div>
  );
}

export default StepSummary;
