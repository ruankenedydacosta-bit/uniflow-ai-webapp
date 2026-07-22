// Indicadores gerenciais do CRM: calculados exclusivamente a partir de
// pipeline.opportunities (ja carregado pelo useCrmPipeline), sem nova
// consulta. Logica pura, sem dependencia de React/Supabase -- testavel via
// node --test. Mesmo padrao de opportunityFormUtils.js.

function toSafeNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

/**
 * Nao muta `opportunities`. Entrada invalida (nao-array) e tratada como
 * lista vazia. `cancelled` nao entra em nenhum contador/soma -- nao e
 * aberta, nao e ganha, nao e perdida, e fica fora da taxa de conversao
 * (que so considera won + lost).
 */
export function calculateCrmMetrics(opportunities = []) {
  const list = Array.isArray(opportunities) ? opportunities : [];

  let openCount = 0;
  let openValue = 0;
  let wonCount = 0;
  let wonValue = 0;
  let lostValue = 0;
  let lostCount = 0;

  for (const opportunity of list) {
    const value = toSafeNumber(opportunity?.estimated_value);

    if (opportunity?.outcome === 'open') {
      openCount += 1;
      openValue += value;
    } else if (opportunity?.outcome === 'won') {
      wonCount += 1;
      wonValue += value;
    } else if (opportunity?.outcome === 'lost') {
      lostCount += 1;
      lostValue += value;
    }
  }

  const decidedCount = wonCount + lostCount;
  const conversionRate = decidedCount === 0 ? 0 : (wonCount / decidedCount) * 100;
  const averageWonTicket = wonCount === 0 ? 0 : wonValue / wonCount;

  return {
    openCount,
    openValue,
    wonCount,
    conversionRate,
    averageWonTicket,
    wonValue,
    lostValue,
  };
}

/** No maximo uma casa decimal, sem decimal quando o valor e inteiro, pt-BR. */
export function formatConversionRate(rate) {
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(rate)}%`;
}
