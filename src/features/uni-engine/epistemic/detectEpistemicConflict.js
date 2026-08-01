// Detecção de conflitos do Modelo Epistêmico (Fase 4 — seção 10).
//
// Tipos:
//   value_conflict            → mesmo sujeito, valores diferentes (genérico);
//   source_conflict           → mesma fonte/prioridade, valores diferentes;
//   temporal_conflict         → valor mudou ao longo do tempo (mesma fonte);
//   identity_conflict         → mesma entidade canônica, identificações diferentes;
//   scope_conflict            → escopos (workspace) diferentes para o mesmo sujeito;
//   memory_database_conflict  → memória vs banco/FinancialSnapshot;
//   user_database_conflict    → usuário vs banco/FinancialSnapshot;
//   user_memory_conflict      → usuário vs memória persistente.
//
// O verificador NUNCA escolhe um lado automaticamente: apenas registra o
// conflito e recomenda a pergunta de esclarecimento (em diagnóstico).
import {
  EPISTEMIC_POLICY,
  getSourcePriority,
} from './epistemicPolicy.js';

function sameSubject(a, b) {
  return typeof a.subject === 'string' && a.subject === b.subject;
}

function valuesEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a === 'number' && typeof b === 'number') {
    return Math.abs(a - b) < 1e-9;
  }
  if (typeof a === 'object' && typeof b === 'object') {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

function sourceKind(source) {
  if (source === 'database_record' || source === 'financial_snapshot') return 'database';
  if (source === 'persistent_memory' || source === 'operational_memory') return 'memory';
  if (source === 'user_explicit_statement' || source === 'user_confirmation' || source === 'user_correction') return 'user';
  return 'other';
}

function timeOf(item) {
  return Date.parse(item?.lastVerifiedAt ?? '') || 0;
}

// Mesma entidade canônica (metadata.canonicalId) com valores diferentes.
function identityConflictPair(a, b) {
  const idA = a.metadata?.canonicalId ?? a.diagnostics?.canonicalId ?? null;
  const idB = b.metadata?.canonicalId ?? b.diagnostics?.canonicalId ?? null;
  return idA != null && idA === idB;
}

function scopeOf(item) {
  return item.metadata?.scope ?? item.diagnostics?.scope ?? null;
}

function classifyPair(a, b) {
  const scopeA = scopeOf(a);
  const scopeB = scopeOf(b);
  if (scopeA != null && scopeB != null && scopeA !== scopeB) return 'scope_conflict';

  if (identityConflictPair(a, b)) return 'identity_conflict';

  const kindA = sourceKind(a.source);
  const kindB = sourceKind(b.source);
  if (kindA !== kindB) {
    if (kindA === 'database' || kindB === 'database') {
      const other = kindA === 'database' ? kindB : kindA;
      if (other === 'user') return 'user_database_conflict';
      if (other === 'memory') return 'memory_database_conflict';
    }
    if (kindA === 'user' || kindB === 'user') return 'user_memory_conflict';
    return 'value_conflict';
  }

  // Mesma categoria de fonte: conflito temporal quando o valor mudou ao
  // longo do tempo (instantes diferentes de verificação).
  const timeA = timeOf(a);
  const timeB = timeOf(b);
  if (timeA > 0 && timeB > 0 && timeA !== timeB) return 'temporal_conflict';

  const priorityA = getSourcePriority(a.source);
  const priorityB = getSourcePriority(b.source);
  if (priorityA === priorityB) return 'source_conflict';

  return 'value_conflict';
}

export function detectEpistemicConflict(items, options = {}) {
  const policy = options.policy ?? EPISTEMIC_POLICY;
  const list = Array.isArray(items) ? items : [];
  const conflicts = [];
  const seenPairs = new Set();
  const maxConflicts = options.maxConflicts ?? policy.limits.maxConflicts;

  for (let i = 0; i < list.length && conflicts.length < maxConflicts; i += 1) {
    const a = list[i];
    for (let j = i + 1; j < list.length && conflicts.length < maxConflicts; j += 1) {
      const b = list[j];
      if (!a || !b || typeof a !== 'object' || typeof b !== 'object') continue;
      if (!sameSubject(a, b)) continue;
      if (valuesEqual(a.value, b.value)) continue;

      const pairKey = `${i}:${j}`;
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);

      conflicts.push({
        type: classifyPair(a, b),
        subject: a.subject,
        values: {
          a: serializeComparable(a.value),
          b: serializeComparable(b.value),
        },
        sources: [a.source, b.source],
        itemIndexes: [i, j],
        detail:
          `valor '${serializeComparable(a.value)}' (${a.source}) vs `
          + `'${serializeComparable(b.value)}' (${b.source})`,
        recommendedAction: 'ask_user',
      });
    }
  }

  return conflicts;
}

function serializeComparable(value) {
  if (typeof value === 'number') return Number(value.toFixed(4));
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  return value;
}

// Resumo compacto usado no Shadow Mode (sujeito, tipo e valores apenas).
export function summarizeConflict(conflict) {
  if (!conflict || typeof conflict !== 'object') return null;
  return {
    type: conflict.type,
    subject: conflict.subject,
    values: conflict.values,
    sources: conflict.sources,
    recommendedAction: conflict.recommendedAction,
  };
}
