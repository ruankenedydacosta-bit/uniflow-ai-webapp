import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../../app/SessionContext.jsx';
import OutlineButton from '../../components/ui/OutlineButton/index.js';
import { cx } from '../../utils/cx.js';
import { createDownloadReadyNotification } from '../notifications/notificationsService.js';
import { PhCaretLeftIcon, PhCaretRightIcon, PhDownloadSimpleIcon } from './SimplifiedIcons.jsx';
import SimplifiedReportSpreadsheet from './SimplifiedReportSpreadsheet.jsx';
import SimplifiedSubpageHeader from './SimplifiedSubpageHeader.jsx';
import { SIMPLIFIED_ROUTES } from './simplifiedRoutes.js';
import groups from './simplifiedGroups.module.css';
import styles from './simplifiedReport.module.css';
import { useMonthlyReport } from './useMonthlyReport.js';

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
 *
 * Fase 3 do redesign (#90): tela 12 do handoff. Cabeçalho "Relatórios",
 * mês com setas, etiqueta "Dados confirmados" (o relatório só lê
 * movimentações concluídas), resumo em card e botão contornado. O gráfico
 * de seis meses do handoff fica de fora: o relatório carrega um mês por vez.
 */
function SimplifiedReportPage() {
  const navigate = useNavigate();
  const { user, workspace } = useSession();
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
      const filename = buildMonthlyReportFilename(report.period);
      downloadMonthlyReportWorkbookBlob(blob, filename);
      setDownloadState('idle');
      // DOWNLOAD-FEEDBACK1: só depois do download já ter sido DISPARADO
      // (linha acima) -- nunca antes, nunca se a geração falhar (fora do
      // try, esse trecho nem roda). Nunca derruba o download em si: a
      // própria createNotification já nunca lança.
      if (user?.id) {
        void createDownloadReadyNotification(user.id, {
          workspaceId: workspace?.id,
          filename,
          fileType: 'xlsx',
        });
      }
    } catch {
      setDownloadState('error');
    }
  }

  return (
    <div className={styles.page} data-simplified-report>
      <SimplifiedSubpageHeader
        title="Relatórios"
        onBack={() => navigate(SIMPLIFIED_ROUTES.HOME)}
        backLabel="Voltar para a Home"
      />

      <nav className={styles.monthNav} aria-label="Navegação entre meses">
        <div className={styles.monthPicker}>
          <button type="button" className={styles.monthArrow} onClick={() => moveMonth(-1)} aria-label="Mês anterior">
            <PhCaretLeftIcon />
          </button>
          <span className={styles.monthLabel}>{report.period.label}</span>
          <button type="button" className={styles.monthArrow} onClick={() => moveMonth(1)} aria-label="Próximo mês">
            <PhCaretRightIcon />
          </button>
        </div>
        <span className={cx(groups.pill, groups.pillGreen)}>Dados confirmados</span>
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

      <OutlineButton
        variant="secondary"
        className={styles.downloadButton}
        onClick={handleDownload}
        disabled={downloadState === 'preparing'}
      >
        <PhDownloadSimpleIcon />
        {downloadState === 'preparing' ? 'Preparando…' : 'Baixar planilha'}
      </OutlineButton>

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
