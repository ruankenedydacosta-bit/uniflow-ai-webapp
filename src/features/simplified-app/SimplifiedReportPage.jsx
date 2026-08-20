import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../../app/SessionContext.jsx';
import { createDownloadReadyNotification } from '../notifications/notificationsService.js';
import { buildDownloadedFile, canOpenDownloadedFile, openDownloadedFile } from './downloadedFileShare.js';
import { ChevronRightIcon, DownloadIcon } from './SimplifiedIcons.jsx';
import SimplifiedDownloadSuccessCard from './SimplifiedDownloadSuccessCard.jsx';
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
  const { user, workspace } = useSession();
  const { report, moveMonth } = useMonthlyReport();
  const [downloadState, setDownloadState] = useState('idle');
  // DOWNLOAD-SUCCESS1: o File fica guardado só para alimentar "Abrir
  // arquivo" (Web Share). `canOpen` é resolvido UMA vez, no momento do
  // sucesso, contra este arquivo específico -- ver downloadedFileShare.js.
  const [downloadResult, setDownloadResult] = useState(null);

  // Trocar de mês invalida o card: ele afirma que "o relatório" foi
  // baixado, e a partir daqui o relatório na tela é outro. Some junto com
  // o arquivo guardado -- nunca oferece abrir o mês errado.
  function handleMoveMonth(delta) {
    setDownloadState('idle');
    setDownloadResult(null);
    moveMonth(delta);
  }

  async function handleOpenFile() {
    const result = await openDownloadedFile(downloadResult?.file);
    if (result.ok) return;
    // Cancelar a folha de compartilhamento é escolha do usuário -- o botão
    // continua ali para ele tentar de novo.
    if (result.reason === 'cancelled') return;
    // Falha real: o navegador prometeu suporte (canShare disse sim) e não
    // entregou. Em vez de acusar erro -- o download JÁ deu certo, o arquivo
    // está salvo --, o botão some e sobra só a confirmação.
    // downloadedFileShare.js também marca o dispositivo, então nenhum
    // download seguinte volta a oferecer o botão nesta sessão.
    setDownloadResult((current) => (current ? { ...current, canOpen: false } : current));
  }

  async function handleDownload() {
    setDownloadState('preparing');
    setDownloadResult(null);
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
      // DOWNLOAD-SUCCESS1: feedback próprio da Uni, só DEPOIS do download
      // já disparado -- o aviso nativo do navegador/Android continua
      // acontecendo em paralelo e segue sendo o caminho garantido.
      const file = buildDownloadedFile(blob, filename);
      setDownloadResult({ file, filename, canOpen: canOpenDownloadedFile(file) });
      setDownloadState('success');
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
        <button type="button" className={styles.monthArrow} onClick={() => handleMoveMonth(-1)} aria-label="Mês anterior">
          <span className={styles.rotatedRight} aria-hidden="true"><ChevronRightIcon /></span>
        </button>
        <span className={styles.monthLabel}>{report.period.label}</span>
        <button type="button" className={styles.monthArrow} onClick={() => handleMoveMonth(1)} aria-label="Próximo mês">
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

      {downloadState === 'success' && downloadResult ? (
        <SimplifiedDownloadSuccessCard
          filename={downloadResult.filename}
          canOpen={downloadResult.canOpen}
          onOpen={handleOpenFile}
        />
      ) : null}

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
