/**
 * Normalizacao de texto para busca local (Clientes/CRM): remove acentos,
 * baixa a caixa, corta espacos nas pontas e colapsa espacos internos
 * consecutivos. Mesmo comportamento ja estabelecido em
 * src/pages/financeiro/transactionFilterUtils.js -- reimplementado aqui
 * (sem importar de Financeiro) para preservar o isolamento de dominio ja
 * praticado no projeto (ver ClientFormPrimitives.jsx/
 * OpportunityFormPrimitives.jsx).
 */
const DIACRITIC_MARKS_PATTERN = new RegExp('[̀-ͯ]', 'g');

export function normalizeSearchText(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .normalize('NFD')
    .replace(DIACRITIC_MARKS_PATTERN, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}
