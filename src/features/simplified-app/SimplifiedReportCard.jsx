import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../../app/SessionContext.jsx';
import { useAgenda } from '../../hooks/useAgenda.js';
import { buildMonthRange } from './simplifiedAgendaCalendar.js';
import { DocumentIcon } from './SimplifiedIcons.jsx';
import { SIMPLIFIED_ROUTES } from './simplifiedRoutes.js';
import styles from './SimplifiedReportCard.module.css';

function pluralize(count, singular, plural) {
  return count === 1 ? singular : plural;
}

/**
 * RELATORIO1: substitui o CTA "Pergunte à Uni sobre seus dados" no mesmo
 * lugar, abaixo do gráfico. Leve de propósito: `transactionCount` chega
 * pronto de SimplifiedHomeFinancialGraph (que já busca as transações do
 * mês para o próprio gráfico -- nunca um segundo fetch financeiro só para
 * este card). A única consulta própria daqui é a contagem de compromissos
 * do mês (useAgenda com o mesmo intervalo da Agenda visual) -- não existe
 * hoje uma consulta "só contagem" mais leve que listAgendaItems.
 */
function SimplifiedReportCard({ transactionCount = 0 }) {
  const navigate = useNavigate();
  const { workspace } = useSession();
  const workspaceId = workspace?.id;

  const month = useMemo(() => {
    const now = new Date();
    return buildMonthRange(now.getFullYear(), now.getMonth());
  }, []);
  const agenda = useAgenda({ workspaceId, startsFrom: month.startsFrom, startsTo: month.startsTo });
  const agendaCount = agenda.items.length;
  const hasContext = transactionCount > 0 || agendaCount > 0;

  return (
    <button
      type="button"
      className={styles.reportCard}
      onClick={() => navigate(SIMPLIFIED_ROUTES.RELATORIO)}
    >
      <span className={styles.reportIcon} aria-hidden="true"><DocumentIcon /></span>
      <span className={styles.reportBody}>
        <strong className={styles.reportTitle}>Relatório da Uni</strong>
        <span className={styles.reportSubtitle}>Seu mês organizado automaticamente.</span>
        {hasContext ? (
          <span className={styles.reportContext}>
            {`${transactionCount} ${pluralize(transactionCount, 'movimentação', 'movimentações')} • ${agendaCount} ${pluralize(agendaCount, 'compromisso', 'compromissos')}`}
          </span>
        ) : null}
      </span>
      <span className={styles.reportCta}>Ver relatório</span>
    </button>
  );
}

export default SimplifiedReportCard;
