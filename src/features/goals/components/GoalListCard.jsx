import { cx } from '../../../utils/cx.js';
import { formatCurrency } from '../../../utils/formatters.js';
import { calcProgress } from '../goalCalc.js';
import { linhaDeApoio, seloDaMeta } from '../listaDeMetas.js';
import styles from './GoalListCard.module.css';

const RAIO = 22;
const CIRCUNFERENCIA = 2 * Math.PI * RAIO;

// Sem selo de ritmo (meta sem data-alvo), o anel fica no azul da marca.
function AnelDeProgresso({ progresso, tom }) {
  const preenchido = (progresso / 100) * CIRCUNFERENCIA;
  return (
    <svg
      viewBox="0 0 56 56"
      className={cx(styles.ring, styles[tom ?? 'azul'])}
      role="img"
      aria-label={`${progresso}% guardado`}
    >
      <circle cx="28" cy="28" r={RAIO} className={styles.ringTrack} />
      {progresso > 0 ? (
        <circle
          cx="28"
          cy="28"
          r={RAIO}
          className={styles.ringFill}
          strokeDasharray={`${preenchido} ${CIRCUNFERENCIA}`}
          transform="rotate(-90 28 28)"
        />
      ) : null}
      <text x="28" y="32" textAnchor="middle" className={styles.ringText} aria-hidden="true">{progresso}%</text>
    </svg>
  );
}

// Card da lista de Metas (handoff 08a, #154). O toque abre a meta.
export default function GoalListCard({ goal, onOpen }) {
  const progresso = calcProgress(Number(goal.current_amount || 0), Number(goal.target_amount || 0));
  const selo = seloDaMeta(goal);

  return (
    <button type="button" className={styles.card} onClick={() => onOpen(goal)}>
      <AnelDeProgresso progresso={progresso} tom={selo?.tom} />
      <span className={styles.body}>
        <span className={styles.top}>
          <span className={styles.name}>{goal.name}</span>
          {selo ? <span className={cx(styles.selo, styles[selo.tom])}>{selo.rotulo}</span> : null}
        </span>
        <span className={styles.amounts}>
          {`${formatCurrency(goal.current_amount)} de ${formatCurrency(goal.target_amount)}`}
        </span>
        <span className={styles.support}>{linhaDeApoio(goal)}</span>
      </span>
    </button>
  );
}
