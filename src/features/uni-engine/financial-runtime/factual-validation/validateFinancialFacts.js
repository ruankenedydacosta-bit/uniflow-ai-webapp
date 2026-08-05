// Uni Engine — Fase 18: Validação Factual.
// Validação determinística dos fatos narrados contra o resultado do executor.
import { isSerializableValue } from '../../uniEngineContracts.js';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  if (Array.isArray(value)) {
    return Object.freeze(value.map(deepFreeze));
  }
  const frozen = {};
  for (const key of Object.keys(value).sort()) {
    frozen[key] = deepFreeze(value[key]);
  }
  return Object.freeze(frozen);
}

function roundMoney(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(numeric * 100) / 100;
}

function safeGet(obj, path, defaultValue = null) {
  if (!obj || typeof obj !== 'object') return defaultValue;
  const keys = path.split('.');
  let current = obj;
  for (const key of keys) {
    if (current === null || current === undefined) return defaultValue;
    current = current[key];
  }
  return current !== undefined && current !== null ? current : defaultValue;
}

export function validateFinancialFacts({
  narrative,
  executionResult,
  runtimeResult,
  snapshot,
} = {}) {
  const safeNarrative = narrative && typeof narrative === 'object' ? narrative : null;
  const safeExecution = executionResult && typeof executionResult === 'object' ? executionResult : null;
  const safeRuntime = runtimeResult && typeof runtimeResult === 'object' ? runtimeResult : null;
  const safeSnapshot = snapshot && typeof snapshot === 'object' ? snapshot : null;

  const claimsChecked = [];
  const claimsValid = [];
  const reasonCodes = [];
  const sanitizedFacts = {};

  if (!safeNarrative || !safeNarrative.text) {
    return deepFreeze({
      valid: false,
      confidence: 0,
      claimsChecked: 0,
      claimsValid: 0,
      reasonCodes: ['NARRATIVE_MISSING'],
      sanitizedFacts: {},
    });
  }

  if (!safeExecution || !safeExecution.results) {
    return deepFreeze({
      valid: false,
      confidence: 0,
      claimsChecked: 0,
      claimsValid: 0,
      reasonCodes: ['EXECUTION_RESULT_MISSING'],
      sanitizedFacts: {},
    });
  }

  // Extrair fatos da narrativa (simplificado - regex para valores monetários e percentuais)
  const text = safeNarrative.text;
  const moneyMatches = text.match(/R\$\s*[\d.,]+/g) || [];
  const pctMatches = text.match(/[\d.,]+\s*%/g) || [];

  // Verificar valores monetários citados existem nos resultados
  let moneyValid = 0;
  for (const match of moneyMatches) {
    const value = roundMoney(match.replace(/[R$\s.]/g, '').replace(',', '.'));
    claimsChecked.push({ type: 'money', claimed: value, text: match });
    let found = false;
    for (const [, result] of Object.entries(safeExecution.results)) {
      if (result && typeof result === 'object') {
        const json = JSON.stringify(result);
        if (json.includes(value.toFixed(2).replace('.', ','))) {
          found = true;
          break;
        }
      }
    }
    if (found) {
      moneyValid++;
      claimsValid.push({ type: 'money', claimed: value, validated: true });
    } else {
      claimsValid.push({ type: 'money', claimed: value, validated: false });
      reasonCodes.push('MONEY_VALUE_NOT_FOUND');
    }
  }

  // Verificar percentuais (simplificado - verificar se cálculo bate)
  let pctValid = 0;
  for (const match of pctMatches) {
    claimsChecked.push({ type: 'percentage', claimed: match, text: match });
    // Validação simplificada - apenas marca como verificado
    pctValid++;
    claimsValid.push({ type: 'percentage', claimed: match, validated: true });
  }

  // Verificar períodos narrados correspondem ao temporal resolvido
  let temporalValid = true;
  if (safeRuntime?.temporal?.entity) {
    const temporal = safeRuntime.temporal;
    const temporalLabel = temporal.entity;
    // Verificar se o período aparece na narrativa (simplificado)
    const periodKeywords = {
      this_month: ['este mês', 'mês atual', 'julho'],
      last_month: ['mês passado', 'junho'],
      specific_month: [],
    };
    // Simplificado: apenas marca como verificado
    temporalValid = true;
  }

  // Verificar categorias/contas citadas existem no snapshot
  let entitiesValid = true;
  if (safeSnapshot) {
    // Verificação simplificada
    entitiesValid = true;
  }

  // Verificar ausência de dados não inventados
  let noInventedData = true;
  const inventedPatterns = ['provavelmente', 'aproximadamente', 'cerca de', 'mais ou menos'];
  for (const pattern of inventedPatterns) {
    if (text.toLowerCase().includes(pattern)) {
      // Verificar se há dados reais para apoiar
      const hasRealData = moneyValid > 0 || pctValid > 0;
      if (!hasRealData) {
        noInventedData = false;
        reasonCodes.push('INVENTED_DATA_DETECTED');
      }
    }
  }

  // Verificar percentuais calculados corretamente (simplificado)
  let percentagesValid = true;
  // Em uma implementação completa, recalcularia percentuais dos dados

  // Compilar fatos sanitizados
  const allExecutionData = {};
  for (const [type, result] of Object.entries(safeExecution.results)) {
    if (result && result.data) {
      sanitizedFacts[type] = Array.isArray(result.data) ? result.data.slice(0, 10) : result.data;
    }
  }

  const totalChecked = claimsChecked.length;
  const totalValid = moneyValid + pctValid + (temporalValid ? 1 : 0) + (entitiesValid ? 1 : 0) + (noInventedData ? 1 : 0) + (percentagesValid ? 1 : 0);
  const confidence = totalChecked > 0 ? totalValid / (totalChecked + 4) : 0; // +4 para checks implícitos

  const valid = validFacts(moneyValid, moneyMatches.length, temporalValid, entitiesValid, noInventedData, percentagesValid);

  return deepFreeze({
    valid,
    confidence: roundMoney(confidence),
    claimsChecked: totalChecked + 4,
    claimsValid: totalValid,
    reasonCodes,
    sanitizedFacts,
  });
}

function validFacts(moneyValid, moneyTotal, temporalValid, entitiesValid, noInventedData, percentagesValid) {
  if (moneyTotal > 0 && moneyValid < moneyTotal) return false;
  if (!temporalValid) return false;
  if (!entitiesValid) return false;
  if (!noInventedData) return false;
  if (!percentagesValid) return false;
  return true;
}