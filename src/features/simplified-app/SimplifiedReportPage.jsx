import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRightIcon, DownloadIcon } from './SimplifiedIcons.jsx';
import SimplifiedReportSpreadsheet from './SimplifiedReportSpreadsheet.jsx';
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
 * RELATORIO-FLATTEN1: UMA ÚNICA tela -- resumo (4 indicadores) + botão
 * Baixar planilha + a planilha real (tabs Movimentações/Agenda + grid),
 * tudo junto. A V3 tinha duas rotas (resumo em /app/relatorio, planilha
 * imersiva em /app/relatorio/planilha, alcançada só por um CTA "Ver
 * relatório" intermediário) -- essa segunda rota foi removida (ver
 * routes.jsx: /app/relatorio/planilha agora só redireciona pra cá, para
 * nunca quebrar um bookmark antigo).
 *
 * Fonte de dados e atualização em tempo real continuam em
 * useMonthlyReport.js, chamado uma ÚNICA vez aqui -- nunca duas queries
 * financeiras, duas de Agenda, dois listeners ou dois reportData: a
 * planilha (SimplifiedReportSpreadsheet.jsx) é um componente de
 * apresentação puro, recebe `report` já pronto por prop.
 */
function SimplifiedReportPage() {
  const navigate = useNavigate();
  const { report, moveMonth } = useMonthlyReport();
  const [downloadState, setDownloadState] = useState('idle');

  async function handleDownload() {
    setDownloadState('preparing');
    try {
      // RELATORIO-SPREADSHEET1: exceljs só é baixado aqui, no toque do
      // usuário -- nunca entra no bundle inicial da Home/Relatório.
      const {
        buildMonthlyReportFilename,
        buildMonthlyReportWorkbookBlob,
        downloadMonthlyReportWorkbookBlob,
      } = await import('./monthlyReportWorkbook.js');
      // `report` é o estado MAIS RECENTE (useMonthlyReport já mantém isso
      // vivo) -- nunca um snapshot de quando a tela abriu.
      const blob = await buildMonthlyReportWorkbookBlob(report);
      downloadMonthlyReportWorkbookBlob(blob, buildMonthlyReportFilename(report.period));
      setDownloadState('idle');
    } catch {
      setDownloadState('error');
    }
  }

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
        className={styles.downloadButton}
        onClick={handleDownload}
        disabled={downloadState === 'preparing'}
      >
        <span className={styles.downloadIcon} aria-hidden="true"><DownloadIcon /></span>
        {downloadState === 'preparing' ? 'Preparando…' : 'Baixar planilha'}
      </button>

      {downloadState === 'error' ? (
        <p className={styles.downloadError} role="alert">
          Não foi possível gerar a planilha agora. Tente novamente.
        </p>
      ) : null}

      <SimplifiedReportSpreadsheet report={report} />
    </div>
  );
}

export default SimplifiedReportPage;
