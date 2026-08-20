import { useState } from 'react';
import styles from './simplifiedReportSpreadsheet.module.css';

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
 * RELATORIO-FLATTEN1: componente puro de apresentação -- tabs
 * (Movimentações/Agenda) + grid real, sem fonte de dados própria (recebe
 * `report` pronto via prop). Extraído da antiga
 * SimplifiedReportSpreadsheetPage.jsx (rota /app/relatorio/planilha,
 * removida nesta fase -- ver routes.jsx) para ser reaproveitado DENTRO da
 * mesma tela do Relatório da Uni, nunca copiado/colado.
 */
function SimplifiedReportSpreadsheet({ report }) {
  const [activeSheet, setActiveSheet] = useState('transactions');

  return (
    <>
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
    </>
  );
}

export default SimplifiedReportSpreadsheet;
