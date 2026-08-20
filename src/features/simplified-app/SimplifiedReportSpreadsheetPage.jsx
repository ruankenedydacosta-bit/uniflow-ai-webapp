import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRightIcon, DownloadIcon } from './SimplifiedIcons.jsx';
import styles from './simplifiedReportSpreadsheet.module.css';
import { SIMPLIFIED_ROUTES } from './simplifiedRoutes.js';
import { useMonthlyReport } from './useMonthlyReport.js';

function BackIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M20 6 10 16l10 10" />
    </svg>
  );
}

const TRANSACTIONS_COLUMN_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
const AGENDA_COLUMN_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

function TransactionsTable({ rows }) {
  if (rows.length === 0) {
    return <p className={styles.sheetEmpty}>Nenhuma movimentação neste mês.</p>;
  }
  return (
    <table className={styles.sheetTable}>
      <thead>
        <tr className={styles.letterRow}>
          <th className={styles.cornerCell} aria-hidden="true" />
          {TRANSACTIONS_COLUMN_LETTERS.slice(1).map((letter) => (
            <th key={letter} className={styles.letterCell} aria-hidden="true">{letter}</th>
          ))}
        </tr>
        <tr className={styles.headRow}>
          <th className={styles.rowNumCell} scope="col">#</th>
          <th scope="col">Data</th>
          <th scope="col">Hora</th>
          <th scope="col">Tipo</th>
          <th scope="col">Descrição</th>
          <th scope="col">Categoria</th>
          <th scope="col">Valor</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={row.id}>
            <td className={styles.rowNumCell}>{index + 1}</td>
            <td>{row.dateShort}</td>
            <td>{row.timeLabel}</td>
            <td>{row.typeLabel}</td>
            <td className={styles.descriptionCell}>{row.description}</td>
            <td>{row.categoryName}</td>
            <td className={row.isPositive ? styles.valueIncome : styles.valueExpense}>
              {row.formattedAmount}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AgendaTable({ rows }) {
  if (rows.length === 0) {
    return <p className={styles.sheetEmpty}>Nenhum compromisso neste mês.</p>;
  }
  return (
    <table className={styles.sheetTable}>
      <thead>
        <tr className={styles.letterRow}>
          <th className={styles.cornerCell} aria-hidden="true" />
          {AGENDA_COLUMN_LETTERS.slice(1).map((letter) => (
            <th key={letter} className={styles.letterCell} aria-hidden="true">{letter}</th>
          ))}
        </tr>
        <tr className={styles.headRow}>
          <th className={styles.rowNumCell} scope="col">#</th>
          <th scope="col">Data</th>
          <th scope="col">Hora</th>
          <th scope="col">Compromisso</th>
          <th scope="col">Lembrete</th>
          <th scope="col">Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((item, index) => (
          <tr key={item.id}>
            <td className={styles.rowNumCell}>{index + 1}</td>
            <td>{item.dateShort}</td>
            <td>{item.timeLabel}</td>
            <td className={styles.descriptionCell}>{item.title}</td>
            <td>{item.reminderLabel ?? '—'}</td>
            <td>
              <span className={styles.statusBadge} data-status={item.status}>{item.statusLabel}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * RELATORIO-SPREADSHEET1: Tela 2 -- planilha imersiva (UM workbook visual,
 * duas abas: Movimentações/Agenda), read-only. Mesma fonte/atualização em
 * tempo real da Tela 1 via useMonthlyReport() (compartilhado -- garante
 * que Resumo, planilha e XLSX nunca divergem). Sem bottom nav (ver
 * SimplifiedAppShell.jsx) -- a seta ← já garante o retorno.
 */
function SimplifiedReportSpreadsheetPage() {
  const navigate = useNavigate();
  const { report, moveMonth } = useMonthlyReport();
  const [activeSheet, setActiveSheet] = useState('transactions');
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
    <div className={styles.page} data-simplified-report-spreadsheet>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.backButton}
          onClick={() => navigate(SIMPLIFIED_ROUTES.RELATORIO)}
          aria-label="Voltar para o Relatório da Uni"
        >
          <BackIcon />
        </button>
        <h1>Relatório da Uni</h1>
        <button
          type="button"
          className={styles.downloadButton}
          onClick={handleDownload}
          disabled={downloadState === 'preparing'}
        >
          <span className={styles.downloadIcon} aria-hidden="true"><DownloadIcon /></span>
          {downloadState === 'preparing' ? 'Preparando…' : 'Baixar planilha'}
        </button>
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

      {downloadState === 'error' ? (
        <p className={styles.downloadError} role="alert">
          Não foi possível gerar a planilha agora. Tente novamente.
        </p>
      ) : null}

      <div className={styles.tabs} role="tablist" aria-label="Selecionar aba da planilha">
        <button
          type="button"
          role="tab"
          aria-selected={activeSheet === 'transactions'}
          className={activeSheet === 'transactions' ? styles.tabActive : styles.tab}
          onClick={() => setActiveSheet('transactions')}
        >
          Movimentações
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeSheet === 'agenda'}
          className={activeSheet === 'agenda' ? styles.tabActive : styles.tab}
          onClick={() => setActiveSheet('agenda')}
        >
          Agenda
        </button>
      </div>

      <div className={styles.sheetScroll}>
        {activeSheet === 'transactions' ? (
          <TransactionsTable rows={report.transactions} />
        ) : (
          <AgendaTable rows={report.agenda} />
        )}
      </div>
    </div>
  );
}

export default SimplifiedReportSpreadsheetPage;
