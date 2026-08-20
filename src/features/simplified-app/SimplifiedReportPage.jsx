import { useNavigate } from 'react-router-dom';
import { ChevronRightIcon, SpreadsheetIcon } from './SimplifiedIcons.jsx';
import { SIMPLIFIED_ROUTES } from './simplifiedRoutes.js';
import styles from './simplifiedReport.module.css';
import { useMonthlyReport } from './useMonthlyReport.js';

function BackIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M20 6 10 16l10 10" />
    </svg>
  );
}

/**
 * RELATORIO-SPREADSHEET1: Tela 1 -- só o resumo do mês (Entradas/Saídas/
 * Movimentações/Compromissos) + o CTA que abre a planilha (Tela 2,
 * SimplifiedReportSpreadsheetPage.jsx). A lista de movimentações e a
 * Agenda do mês, que existiam aqui na V1, saíram -- pertencem à planilha
 * agora; esta tela nunca mais deve parecer uma segunda versão de
 * Registros. Fonte de dados e atualização em tempo real vivem em
 * useMonthlyReport.js (compartilhado com a Tela 2 -- garante que Resumo,
 * planilha e XLSX nunca divergem).
 */
function SimplifiedReportPage() {
  const navigate = useNavigate();
  const { report, moveMonth } = useMonthlyReport();

  return (
    <div className={styles.page} data-simplified-report>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.backButton}
          onClick={() => navigate(SIMPLIFIED_ROUTES.HOME)}
          aria-label="Voltar para a Home"
        >
          <BackIcon />
        </button>
        <h1>Relatório da Uni</h1>
      </header>

      <nav className={styles.monthNav} aria-label="Navegação entre meses">
        <button type="button" className={styles.monthArrow} onClick={() => moveMonth(-1)} aria-label="Mês anterior">
          <span className={styles.rotatedRight} aria-hidden="true"><ChevronRightIcon /></span>
        </button>
        <span className={styles.monthLabel}>{report.period.label}</span>
        <button type="button" className={styles.monthArrow} onClick={() => moveMonth(1)} aria-label="Próximo mês">
          <ChevronRightIcon />
        </button>
      </nav>

      <section className={styles.summaryGrid} aria-label="Resumo do mês">
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>Entradas</span>
          <strong className={styles.summaryValueIncome}>{report.summary.incomeLabel}</strong>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>Saídas</span>
          <strong className={styles.summaryValueExpense}>{report.summary.expenseLabel}</strong>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>Movimentações</span>
          <strong className={styles.summaryValue}>{report.summary.transactionCount}</strong>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>Compromissos</span>
          <strong className={styles.summaryValue}>{report.summary.agendaCount}</strong>
        </div>
      </section>

      <button
        type="button"
        className={styles.viewSheetCta}
        onClick={() => navigate(SIMPLIFIED_ROUTES.RELATORIO_PLANILHA)}
      >
        <span className={styles.viewSheetIcon} aria-hidden="true"><SpreadsheetIcon /></span>
        <span className={styles.viewSheetBody}>
          <strong>Ver relatório</strong>
          <span>Veja todos os seus dados organizados em uma planilha.</span>
        </span>
      </button>
    </div>
  );
}

export default SimplifiedReportPage;
