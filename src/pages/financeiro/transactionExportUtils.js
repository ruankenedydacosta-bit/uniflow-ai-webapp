// Exportação CSV de lançamentos financeiros (Fase 5.4, Etapa 1).
// Lógica pura de formatação — nenhuma dependência de React/Supabase/lib
// externa, testável via node --test. Opera sobre a mesma lista de transações
// já filtrada/ordenada por `applyTransactionFilters` (transactionFilterUtils.js),
// resolvendo nomes de categoria/conta pelos mesmos Maps já usados pela busca.

const CSV_HEADER = [
  'Data',
  'Tipo',
  'Descrição',
  'Conta',
  'Conta de destino',
  'Categoria',
  'Valor',
  'Forma de pagamento',
  'Parcela',
  'Recorrente',
  'Observação',
];

const TRANSACTION_TYPE_LABELS = {
  income: 'Entrada',
  expense: 'Saída',
  transfer: 'Transferência',
  adjustment: 'Ajuste',
};

/**
 * Escapa um valor para uma célula CSV (RFC 4180): envolve em aspas duplas
 * quando o valor contém vírgula, aspas ou quebra de linha, duplicando aspas
 * internas.
 */
export function escapeCsvValue(value) {
  const text = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

// Protecao contra CSV/formula injection: Excel e Google Sheets interpretam
// uma celula como formula quando o PRIMEIRO caractere (sem espacos a
// frente -- espaco a frente ja neutraliza a interpretacao como formula no
// proprio Excel, entao nao fazemos trim aqui) e =, +, - ou @. Como
// description/notes/payment_method e os nomes de categoria/conta sao texto
// livre controlado pelo usuario, prefixamos com um apostrofo (mesma
// mitigacao usada por planilhas para forcar leitura como texto) --
// inofensivo para valores legitimos, nunca aplicado a datas/tipos/valores
// numericos formatados internamente.
const DANGEROUS_CSV_FORMULA_PREFIX_PATTERN = /^[=+\-@]/;

export function neutralizeCsvFormulaValue(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return DANGEROUS_CSV_FORMULA_PREFIX_PATTERN.test(text) ? `'${text}` : text;
}

function buildCsvRow(values) {
  return values.map(escapeCsvValue).join(',');
}

/**
 * Converte uma transação em uma linha de valores legíveis (nomes resolvidos,
 * não IDs), na mesma ordem de `CSV_HEADER`.
 */
export function transactionToCsvRow(transaction, { categoriesById, accountsById } = {}) {
  const accountName = accountsById?.get(transaction.account_id)?.name ?? '';
  const destinationAccountName = transaction.destination_account_id
    ? accountsById?.get(transaction.destination_account_id)?.name ?? ''
    : '';
  const categoryName = categoriesById?.get(transaction.category_id)?.name ?? '';
  const isInstallment = Number(transaction.installment_total) > 1;

  return [
    transaction.transaction_date ?? '',
    TRANSACTION_TYPE_LABELS[transaction.transaction_type] ?? transaction.transaction_type ?? '',
    neutralizeCsvFormulaValue(transaction.description ?? ''),
    neutralizeCsvFormulaValue(accountName),
    neutralizeCsvFormulaValue(destinationAccountName),
    neutralizeCsvFormulaValue(categoryName),
    Number(transaction.amount ?? 0).toFixed(2),
    neutralizeCsvFormulaValue(transaction.payment_method ?? ''),
    isInstallment ? `${transaction.installment_number}/${transaction.installment_total}` : '',
    transaction.is_recurring ? 'Sim' : 'Não',
    neutralizeCsvFormulaValue(transaction.notes ?? ''),
  ];
}

/**
 * Monta o CSV completo (cabeçalho + linhas) a partir de uma lista de
 * transações já pronta para exibição (tipicamente o resultado de
 * `applyTransactionFilters`). `categoriesById`/`accountsById` são os mesmos
 * Maps (id -> registro com `.name`) já usados pela busca/filtros.
 */
export function buildTransactionsCsv(transactions = [], { categoriesById, accountsById } = {}) {
  const rows = transactions.map((transaction) =>
    transactionToCsvRow(transaction, { categoriesById, accountsById }),
  );
  return [buildCsvRow(CSV_HEADER), ...rows.map(buildCsvRow)].join('\r\n');
}

/**
 * Gera um nome de arquivo com a data corrente (YYYY-MM-DD), sem depender de
 * timezone além do relógio local do navegador.
 */
export function buildTransactionsExportFilename(date = new Date()) {
  const iso = date.toISOString().slice(0, 10);
  return `uniflow-lancamentos-${iso}.csv`;
}

// BUGFIX (download no Android/PWA -- mesmo problema do XLSX do Relatório,
// ver monthlyReportWorkbook.js): revogar a blob: URL logo após
// anchor.click() é assíncrono demais para o gerenciador de downloads do
// Android confirmar antes da URL morrer -- o resultado é um download com
// nome/tamanho corretos e 0 bytes de conteúdo. Atraso inofensivo no
// desktop, necessário no mobile.
const REVOKE_OBJECT_URL_DELAY_MS = 4000;

/**
 * Dispara o download do CSV no navegador, reaproveitando o mesmo padrão de
 * `downloadAudioReviewJson` (Blob + link temporário) já usado em
 * `src/pages/dev/uni-audio-library/audioReviewStorage.js`. Retorna o nome
 * de arquivo REALMENTE usado (explícito ou o default calculado aqui) --
 * DOWNLOAD-FEEDBACK1 depende disso para a notificação de confirmação
 * nunca recalcular o nome à parte (e arriscar divergir).
 */
export function downloadTransactionsCsv(
  transactions,
  { categoriesById, accountsById, documentRef = globalThis.document, filename } = {},
) {
  const csv = buildTransactionsCsv(transactions, { categoriesById, accountsById });
  // BOM UTF-8: garante acentuação correta ao abrir o CSV direto no Excel.
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const resolvedFilename = filename ?? buildTransactionsExportFilename();
  const anchor = documentRef.createElement('a');
  anchor.href = url;
  anchor.download = resolvedFilename;
  anchor.hidden = true;
  documentRef.body.append(anchor);
  anchor.click();
  anchor.remove();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), REVOKE_OBJECT_URL_DELAY_MS);
  return resolvedFilename;
}
