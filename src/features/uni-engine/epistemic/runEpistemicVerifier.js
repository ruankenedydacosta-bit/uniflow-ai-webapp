// Verificador Epistêmico (Fase 4 — Shadow Mode).
//
// runEpistemicVerifier(input) é puro, síncrono e sem rede. Produz o modelo
// epistêmico completo da rodada:
//   {
//     items, conflicts, staleItems, missingItems,
//     evidenceSummary, confidenceSummary, sufficiency,
//     recommendations, diagnostics
//   }
//
// Entrada:
//   {
//     normalizedMessage, cognitiveContext, financialSnapshot,
//     operationalMemory, persistentMemories, plan, now,
//     epistemicState,   // opcional: estado por campo da Fase 1 (evidência base)
//     session           // opcional: isolamento por usuário/workspace
//   }
//
// Regras absolutas:
//   - nunca altera resposta, execução, memória ou pipeline;
//   - memória é EVIDÊNCIA, nunca dado oficial;
//   - banco/FinancialSnapshot vence memória;
//   - execução permanece bloqueada (Shadow Mode);
//   - sem LLM, sem rede, sem banco — apenas regras determinísticas.
import {
  EPISTEMIC_POLICY,
  describeConfidence,
  getSourcePriority,
} from './epistemicPolicy.js';
import {
  createEpistemicItem,
  serializeEpistemicItem,
} from './epistemicContracts.js';
import {
  mapLegacyEpistemicStatus,
} from './epistemicTypes.js';
import {
  evidenceFromContextReference,
  evidenceFromDeterministicRule,
  evidenceFromFinancialSnapshot,
  evidenceFromMemoryRetrieval,
  evidenceFromUserStatement,
  dedupeEvidence,
} from './buildEpistemicEvidence.js';
import { computeEpistemicConfidence } from './computeEpistemicConfidence.js';
import {
  detectEpistemicConflict,
  summarizeConflict,
} from './detectEpistemicConflict.js';
import {
  evaluateStaleness,
  stalenessWindowForItem,
} from './evaluateStaleness.js';
import { evaluateEvidenceSufficiency } from './evaluateEvidenceSufficiency.js';
import {
  computeUsableFor,
  resolveEpistemicUsage,
} from './resolveEpistemicUsage.js';

function normalizeName(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : String(value ?? '');
}

function toIso(value) {
  if (!value) return null;
  if (typeof value === 'string' || typeof value === 'number') {
    const time = Date.parse(value);
    return Number.isFinite(time) ? new Date(time).toISOString() : null;
  }
  return null;
}

// -----------------------------------------------
// Fontes legadas da Fase 1 → fontes do modelo
// -----------------------------------------------
const LEGACY_SOURCE_MAP = Object.freeze({
  user_message: 'user_explicit_statement',
  pending_action: 'operational_memory',
  financial_snapshot: 'financial_snapshot',
  category_resolver: 'deterministic_inference',
  cognitive_classifier: 'deterministic_inference',
  session_reference_date: 'database_record',
});

function mapLegacySource(source) {
  return LEGACY_SOURCE_MAP[source] ?? source ?? 'unknown';
}

// -----------------------------------------------
// Construção de itens
// -----------------------------------------------

function buildFromEpistemicState(epistemicState, snapshot, nowIso) {
  const items = [];
  const state = epistemicState && typeof epistemicState === 'object' ? epistemicState : {};

  const fieldConfigs = [
    { key: 'amount', subject: 'amount', claimType: 'user_claim' },
    { key: 'description', subject: 'description', claimType: 'user_claim' },
    { key: 'date', subject: 'date', claimType: 'user_claim' },
  ];

  for (const config of fieldConfigs) {
    const entry = state[config.key];
    if (!entry || entry.value == null || entry.status === 'missing') continue;
    const source = mapLegacySource(entry.source);
    const status = mapLegacyEpistemicStatus(entry.status) ?? 'unknown';
    const evidence = status === 'supported'
      ? [evidenceFromUserStatement({ subject: config.subject, value: entry.value, observedAt: nowIso })]
      : [evidenceFromDeterministicRule({ subject: config.subject, value: entry.value, observedAt: nowIso })];
    items.push(createEpistemicItem({
      subject: config.subject,
      value: entry.value,
      claimType: config.claimType,
      epistemicStatus: status,
      confidence: computeEpistemicConfidence({ evidence, source }),
      source,
      sourcePriority: getSourcePriority(source),
      evidence,
      lastVerifiedAt: nowIso,
      requiresVerification: status !== 'confirmed',
      diagnostics: { origin: 'epistemic_state_fase1', field: config.key },
    }));
  }

  // Conta da ação atual (e destino).
  for (const config of [
    { key: 'account', subjectPrefix: 'account', claimType: 'user_claim' },
    { key: 'destinationAccount', subjectPrefix: 'destinationAccount', claimType: 'user_claim' },
  ]) {
    const entry = state[config.key];
    if (!entry || entry.value == null || entry.status === 'missing') continue;
    const source = mapLegacySource(entry.source);
    const status = mapLegacyEpistemicStatus(entry.status) ?? 'unknown';
    const claimType = source === 'financial_snapshot' ? 'fact' : config.claimType;
    const evidence = source === 'financial_snapshot'
      ? [evidenceFromFinancialSnapshot({
        subject: `${config.subjectPrefix}:${normalizeName(entry.value)}`,
        value: entry.value,
        observedAt: nowIso,
      })]
      : [evidenceFromUserStatement({
        subject: `${config.subjectPrefix}:${normalizeName(entry.value)}`,
        value: entry.value,
        observedAt: nowIso,
      })];
    items.push(createEpistemicItem({
      subject: `${config.subjectPrefix}:${normalizeName(entry.value)}`,
      value: entry.value,
      claimType,
      epistemicStatus: status,
      confidence: computeEpistemicConfidence({ evidence, source }),
      source,
      sourcePriority: getSourcePriority(source),
      evidence,
      lastVerifiedAt: nowIso,
      requiresVerification: status !== 'confirmed',
      diagnostics: { origin: 'epistemic_state_fase1', field: config.key },
    }));
  }

  // Categoria.
  const category = state.category;
  if (category && category.value != null && category.status !== 'missing') {
    const source = mapLegacySource(category.source);
    const status = mapLegacyEpistemicStatus(category.status) ?? 'unknown';
    const claimType = source === 'user_explicit_statement' ? 'user_claim' : 'inference';
    const evidence = source === 'user_explicit_statement'
      ? [evidenceFromUserStatement({
        subject: `category:${normalizeName(category.value)}`,
        value: category.value,
        observedAt: nowIso,
      })]
      : [evidenceFromDeterministicRule({
        subject: `category:${normalizeName(category.value)}`,
        value: category.value,
        observedAt: nowIso,
      })];
    items.push(createEpistemicItem({
      subject: `category:${normalizeName(category.value)}`,
      value: category.value,
      claimType,
      epistemicStatus: status,
      confidence: computeEpistemicConfidence({ evidence, source }),
      source,
      sourcePriority: getSourcePriority(source),
      evidence,
      lastVerifiedAt: nowIso,
      requiresVerification: status === 'possible' || status === 'probable',
      diagnostics: { origin: 'epistemic_state_fase1', field: 'category' },
    }));
  }

  // Intenção classificada.
  const intent = state.intent;
  if (intent?.value) {
    const source = 'deterministic_inference';
    const status = mapLegacyEpistemicStatus(intent.status) ?? 'unknown';
    const evidence = [evidenceFromDeterministicRule({
      subject: 'intent',
      value: intent.value,
      observedAt: nowIso,
    })];
    items.push(createEpistemicItem({
      subject: 'intent',
      value: intent.value,
      claimType: 'inference',
      epistemicStatus: status,
      confidence: computeEpistemicConfidence({ evidence, source }),
      source,
      sourcePriority: getSourcePriority(source),
      evidence,
      lastVerifiedAt: nowIso,
      requiresVerification: status !== 'confirmed',
      diagnostics: { origin: 'epistemic_state_fase1', field: 'intent' },
    }));
  }

  // Saldo total do FinancialSnapshot (fonte oficial).
  if (snapshot && typeof snapshot.totalBalance === 'number') {
    const lastVerified = toIso(snapshot.referenceDate) ?? nowIso;
    const evidence = [evidenceFromFinancialSnapshot({
      subject: 'balance:total',
      value: snapshot.totalBalance,
      observedAt: lastVerified,
    })];
    const stale = evaluateStaleness({ subject: 'balance:total', lastVerifiedAt: lastVerified }, nowIso).state;
    items.push(createEpistemicItem({
      subject: 'balance:total',
      value: snapshot.totalBalance,
      claimType: 'fact',
      epistemicStatus: stale === 'stale' || stale === 'expired' ? 'stale' : 'confirmed',
      confidence: computeEpistemicConfidence({
        evidence,
        source: 'financial_snapshot',
        stale: stale === 'stale' || stale === 'expired',
      }),
      source: 'financial_snapshot',
      sourcePriority: getSourcePriority('financial_snapshot'),
      evidence,
      lastVerifiedAt: lastVerified,
      staleAfter: stalenessWindowForItem({ subject: 'balance:total', lastVerifiedAt: lastVerified }),
      requiresVerification: false,
      diagnostics: { origin: 'financial_snapshot', field: 'totalBalance' },
    }));
  }

  // Saldo por conta do FinancialSnapshot.
  const accounts = Array.isArray(snapshot?.accounts) ? snapshot.accounts : [];
  const lastVerifiedSnapshot = toIso(snapshot?.referenceDate) ?? nowIso;
  for (const account of accounts) {
    if (typeof account?.current_balance !== 'number') continue;
    const subject = `balance:account:${normalizeName(account.name)}`;
    const evidence = [evidenceFromFinancialSnapshot({
      subject,
      value: account.current_balance,
      observedAt: lastVerifiedSnapshot,
    })];
    const stale = evaluateStaleness({ subject, lastVerifiedAt: lastVerifiedSnapshot }, nowIso).state;
    items.push(createEpistemicItem({
      subject,
      value: account.current_balance,
      claimType: 'fact',
      epistemicStatus: stale === 'stale' || stale === 'expired' ? 'stale' : 'confirmed',
      confidence: computeEpistemicConfidence({
        evidence,
        source: 'financial_snapshot',
        stale: stale === 'stale' || stale === 'expired',
      }),
      source: 'financial_snapshot',
      sourcePriority: getSourcePriority('financial_snapshot'),
      evidence,
      lastVerifiedAt: lastVerifiedSnapshot,
      staleAfter: stalenessWindowForItem({ subject, lastVerifiedAt: lastVerifiedSnapshot }),
      requiresVerification: false,
      diagnostics: { origin: 'financial_snapshot', field: 'accountBalance' },
    }));
  }

  return items;
}

// -----------------------------------------------
// Reivindicação de saldo do usuário × banco
// -----------------------------------------------
function buildUserBalanceClaim(state, snapshot, intent, nowIso) {
  if (!state?.amount || state.amount.value == null) return null;
  if (!['check_balance', 'set_balance', 'ambiguous_balance_or_income'].includes(intent)) return null;
  const amountValue = Number(state.amount.value);
  if (!Number.isFinite(amountValue)) return null;

  const accountEntry = state.account;
  const accountName = accountEntry?.value ?? null;
  const isSnapshotAccount = accountEntry?.source === 'financial_snapshot';
  const accounts = Array.isArray(snapshot?.accounts) ? snapshot.accounts : [];

  let comparedValue = null;
  let subject = null;
  let source = null;
  let evidence = null;

  if (isSnapshotAccount && accountName) {
    const match = accounts.find((account) => normalizeName(account?.name) === normalizeName(accountName));
    if (match && typeof match.current_balance === 'number') {
      comparedValue = match.current_balance;
      subject = `balance:account:${normalizeName(accountName)}`;
      source = 'financial_snapshot';
      evidence = evidenceFromFinancialSnapshot({
        subject,
        value: comparedValue,
        observedAt: toIso(snapshot?.referenceDate) ?? nowIso,
      });
    }
  } else if (typeof snapshot?.totalBalance === 'number') {
    comparedValue = snapshot.totalBalance;
    subject = 'balance:total';
    source = 'financial_snapshot';
    evidence = evidenceFromFinancialSnapshot({
      subject,
      value: comparedValue,
      observedAt: toIso(snapshot?.referenceDate) ?? nowIso,
    });
  }

  if (comparedValue == null || Math.abs(comparedValue - amountValue) < 1e-9) return null;

  const claimEvidence = evidenceFromUserStatement({
    subject,
    value: amountValue,
    observedAt: nowIso,
  });
  return createEpistemicItem({
    subject,
    value: amountValue,
    claimType: 'user_claim',
    epistemicStatus: 'supported',
    confidence: computeEpistemicConfidence({
      evidence: [claimEvidence],
      source: 'user_explicit_statement',
      contradictions: 1,
    }),
    source: 'user_explicit_statement',
    sourcePriority: getSourcePriority('user_explicit_statement'),
    evidence: [claimEvidence],
    contradictions: [{
      source,
      value: comparedValue,
      evidence,
      observedAt: nowIso,
    }],
    lastVerifiedAt: nowIso,
    requiresVerification: true,
    diagnostics: { origin: 'user_balance_claim' },
  });
}

// -----------------------------------------------
// Memória persistente (Fase 3) como evidência
// -----------------------------------------------
const EXCLUDED_MEMORY_STATUSES = new Set([
  'contested',
  'superseded',
  'expired',
  'deleted',
  'rejected',
]);

const MEMORY_CLAIM_TYPES = Object.freeze({
  user_preference: 'preference',
  conversation_preference: 'preference',
  account_preference: 'preference',
  category_preference: 'preference',
  procedure_preference: 'preference',
  user_correction: 'correction',
  merchant_category_association: 'inference',
  merchant_account_association: 'inference',
  user_declared_fact: 'fact',
  recurring_pattern: 'temporal_state',
  episodic_context: 'temporal_state',
});

// Sujeito canônico de uma memória: saldos e contas/categorias alinham com os
// sujeitos oficiais para permitir a detecção de conflito banco × memória.
function memorySubject(memory) {
  const key = typeof memory.subjectKey === 'string' ? memory.subjectKey : '';
  const lower = key.toLowerCase();
  if (lower.includes('balance') || lower.includes('saldo')) return 'balance:total';
  if (key.startsWith('account::')) {
    const entity = normalizeName(key.slice('account::'.length));
    if (entity) return `account:${entity}`;
  }
  if (key.startsWith('category::')) {
    const entity = normalizeName(key.slice('category::'.length));
    if (entity) return `category:${entity}`;
  }
  if (key.startsWith('recurring') || lower.includes('recurring')) return `memory:${key}`;
  return `memory:${key || 'unknown'}`;
}

function memoryValue(memory) {
  const value = memory.value && typeof memory.value === 'object' ? memory.value : {};
  return value.name
    ?? value.account
    ?? value.category
    ?? value.merchant
    ?? value.totalBalance
    ?? value.balance
    ?? value.amount
    ?? memory.normalizedValue
    ?? value;
}

function buildFromMemories(memories, session, nowIso) {
  const items = [];
  const list = Array.isArray(memories) ? memories : [];
  let scopeFiltered = 0;
  const sessionUserId = session?.userId ?? null;
  const sessionWorkspaceId = session?.workspaceId ?? null;

  for (const memory of list) {
    if (!memory || typeof memory !== 'object') continue;
    const status = memory.status ?? null;
    if (EXCLUDED_MEMORY_STATUSES.has(status)) continue;

    // Isolamento por usuário/workspace: memória de outro escopo é ignorada.
    if (sessionUserId != null && memory.userId != null && memory.userId !== sessionUserId) {
      scopeFiltered += 1;
      continue;
    }
    if (sessionWorkspaceId != null && memory.workspaceId != null && memory.workspaceId !== sessionWorkspaceId) {
      scopeFiltered += 1;
      continue;
    }

    const subject = memorySubject(memory);
    const value = memoryValue(memory);
    const lastVerified = toIso(memory.lastSeenAt ?? memory.confirmedAt ?? memory.firstSeenAt) ?? nowIso;
    const claimType = MEMORY_CLAIM_TYPES[memory.memoryType] ?? 'inference';
    const source = 'persistent_memory';
    const memoryStatus = status ?? 'candidate';
    const evidence = [evidenceFromMemoryRetrieval({
      subject,
      value,
      observedAt: lastVerified,
      verifiedAt: lastVerified,
      expiresAt: memory.expiresAt ?? null,
      confidence: Number(memory.confidence) || 0,
      metadata: {
        memoryStatus,
        memoryType: memory.memoryType ?? null,
        memoryId: memory.id ?? null,
        subjectKey: memory.subjectKey ?? null,
        scope: memory.workspaceId ?? null,
      },
    })];
    const confirmedMemory = memoryStatus === 'confirmed' || memoryStatus === 'active';
    const stale = evaluateStaleness({ subject, lastVerifiedAt: lastVerified }, nowIso).state;

    let statusMapped = 'possible';
    if (confirmedMemory) statusMapped = 'supported';
    if (stale === 'stale' || stale === 'expired') statusMapped = 'stale';

    items.push(createEpistemicItem({
      subject,
      value,
      claimType,
      epistemicStatus: statusMapped,
      confidence: computeEpistemicConfidence({
        evidence,
        source,
        memoryCandidate: memoryStatus === 'candidate',
        stale: stale === 'stale' || stale === 'expired',
      }),
      source,
      sourcePriority: getSourcePriority(source),
      evidence,
      lastVerifiedAt: lastVerified,
      staleAfter: stalenessWindowForItem({ subject, lastVerifiedAt: lastVerified }),
      requiresVerification: memoryStatus === 'candidate',
      diagnostics: {
        origin: 'persistent_memory_fase3',
        memoryStatus,
        memoryId: memory.id ?? null,
        memoryType: memory.memoryType ?? null,
        scope: memory.workspaceId ?? null,
      },
    }));
  }

  return { items, scopeFiltered };
}

// -----------------------------------------------
// Contexto operacional (Fase 2) como referência — nunca cria fato
// -----------------------------------------------
function buildFromOperationalMemory(operationalMemory, nowIso) {
  const items = [];
  const memory = operationalMemory && typeof operationalMemory === 'object' ? operationalMemory : {};
  const candidates = [
    { key: 'lastValue', subject: 'amount', value: memory.lastValue },
    { key: 'lastAccount', subject: memory.lastAccount ? `account:${normalizeName(memory.lastAccount)}` : null, value: memory.lastAccount },
    { key: 'lastCategory', subject: memory.lastCategory ? `category:${normalizeName(memory.lastCategory)}` : null, value: memory.lastCategory },
  ];
  for (const candidate of candidates) {
    if (candidate.value == null || !candidate.subject) continue;
    const evidence = [evidenceFromContextReference({
      subject: candidate.subject,
      value: candidate.value,
      observedAt: nowIso,
    })];
    items.push(createEpistemicItem({
      subject: candidate.subject,
      value: candidate.value,
      claimType: 'inference',
      epistemicStatus: 'possible',
      confidence: computeEpistemicConfidence({
        evidence,
        source: 'operational_memory',
      }),
      source: 'operational_memory',
      sourcePriority: getSourcePriority('operational_memory'),
      evidence,
      lastVerifiedAt: nowIso,
      requiresVerification: true,
      diagnostics: { origin: 'operational_memory_fase2', field: candidate.key },
    }));
  }
  return items;
}

// -----------------------------------------------
// Campos ausentes do plano
// -----------------------------------------------
function buildMissingItems(plan, nowIso) {
  const missingFields = Array.isArray(plan?.missingFields) ? plan.missingFields : [];
  return missingFields.map((field) => {
    const subject = `field:${field}`;
    const evidence = [evidenceFromDeterministicRule({
      subject,
      value: null,
      observedAt: nowIso,
      metadata: { absence: true },
    })];
    return createEpistemicItem({
      subject,
      value: null,
      claimType: 'absence',
      epistemicStatus: 'missing',
      confidence: 0,
      source: 'deterministic_inference',
      sourcePriority: getSourcePriority('deterministic_inference'),
      evidence,
      lastVerifiedAt: nowIso,
      requiresVerification: true,
      diagnostics: { origin: 'plan_missing_field', field },
    });
  });
}

// -----------------------------------------------
// Aplicação de conflitos sobre os itens
// -----------------------------------------------
function applyConflicts(items, conflicts) {
  const byIndex = new Map();
  items.forEach((item, index) => byIndex.set(index, item));
  for (const conflict of conflicts) {
    const indexes = Array.isArray(conflict.itemIndexes) ? conflict.itemIndexes : [];
    for (const index of indexes) {
      const item = byIndex.get(index);
      if (!item) continue;
      if (!Array.isArray(item.contradictions)) item.contradictions = [];
      const otherIndex = indexes.find((other) => other !== index);
      const other = byIndex.get(otherIndex);
      if (other) {
        item.contradictions.push({
          source: other.source,
          value: other.value,
          observedAt: other.lastVerifiedAt ?? null,
        });
      }
      item.epistemicStatus = 'conflicting';
      item.requiresVerification = true;
    }
  }
  return items;
}

// -----------------------------------------------
// Sumários
// -----------------------------------------------
function buildEvidenceSummary(items) {
  const allEvidence = [];
  for (const item of items) {
    allEvidence.push(...(Array.isArray(item.evidence) ? item.evidence : []));
  }
  const deduped = dedupeEvidence(allEvidence);
  const byType = {};
  for (const evidence of deduped) {
    const type = evidence.type ?? 'unknown';
    byType[type] = (byType[type] ?? 0) + 1;
  }
  return {
    totalRaw: allEvidence.length,
    totalDeduped: deduped.length,
    byType,
  };
}

function buildConfidenceSummary(items) {
  const values = items
    .map((item) => Number(item.confidence) || 0)
    .filter((value) => Number.isFinite(value));
  if (values.length === 0) {
    return { mean: null, min: null, max: null, bands: {} };
  }
  const sum = values.reduce((acc, value) => acc + value, 0);
  const bands = {};
  for (const value of values) {
    const band = describeConfidence(value);
    bands[band] = (bands[band] ?? 0) + 1;
  }
  return {
    mean: Number((sum / values.length).toFixed(4)),
    min: Math.min(...values),
    max: Math.max(...values),
    bands,
  };
}

// -----------------------------------------------
// Suficiência agregada
// -----------------------------------------------
const SUFFICIENCY_PURPOSES = ['display', 'suggest', 'ask', 'confirm', 'execute', 'store_memory'];

function buildSufficiency(items) {
  const result = {};
  const blocked = [];
  for (const purpose of SUFFICIENCY_PURPOSES) {
    result[purpose] = { sufficientCount: 0, insufficientCount: 0 };
  }
  for (const item of items) {
    for (const purpose of SUFFICIENCY_PURPOSES) {
      const outcome = evaluateEvidenceSufficiency(item, purpose);
      if (outcome.sufficient) {
        result[purpose].sufficientCount += 1;
      } else {
        result[purpose].insufficientCount += 1;
        if (Array.isArray(outcome.blockers) && outcome.blockers.length > 0) {
          blocked.push({
            subject: item.subject,
            purpose,
            blockers: outcome.blockers.slice(0, 4),
            recommendedAction: outcome.recommendedAction ?? null,
          });
        }
      }
    }
  }
  result.execute = {
    sufficientCount: 0,
    insufficientCount: items.length,
    shadowMode: true,
    reason: 'execution_blocked_shadow_mode',
  };
  result.blocked = blocked;
  return result;
}

// -----------------------------------------------
// Recomendações (somente diagnóstico)
// -----------------------------------------------
function buildRecommendations({ conflicts, items, plan, limits }) {
  const recommendations = [];
  const push = (value) => {
    if (recommendations.length < limits.maxRecommendations && !recommendations.includes(value)) {
      recommendations.push(value);
    }
  };

  for (const conflict of conflicts) {
    push(`ask_user:conflict:${conflict.subject}`);
  }

  for (const item of items) {
    if (recommendations.length >= limits.maxRecommendations) break;
    if (item.epistemicStatus === 'stale') {
      const domain = item.subject.startsWith('balance') ? 'balance' : 'other';
      push(domain === 'balance' ? `refresh_data:${item.subject}` : `ask_user:stale:${item.subject}`);
      continue;
    }
    const usage = resolveEpistemicUsage(item, { requiresConfirmation: false });
    if (usage.usage === 'ask_user') {
      push(`ask_user:${item.subject}`);
    } else if (usage.usage === 'require_confirmation') {
      push(`require_confirmation:${item.subject}`);
    } else if (usage.usage === 'block') {
      push(`block:${item.subject}`);
    } else if (usage.usage === 'refresh_data') {
      push(`refresh_data:${item.subject}`);
    }
  }

  const missingFields = Array.isArray(plan?.missingFields) ? plan.missingFields : [];
  for (const field of missingFields) {
    push(`ask_user:missing:${field}`);
  }

  return recommendations;
}

// -----------------------------------------------
// Readiness epistêmica do plano (seção 14)
// -----------------------------------------------
export function buildPlanEpistemicSection(verifier, plan) {
  const safe = verifier && typeof verifier === 'object' ? verifier : {};
  const items = Array.isArray(safe.items) ? safe.items : [];
  const conflicts = Array.isArray(safe.conflicts) ? safe.conflicts : [];
  const missingFields = Array.isArray(plan?.missingFields) ? plan.missingFields : [];

  const conflictSubjects = new Set(conflicts.map((conflict) => conflict.subject));
  const staleSubjects = (Array.isArray(safe.staleItems) ? safe.staleItems : [])
    .map((entry) => entry.subject ?? null)
    .filter(Boolean);
  const unsupportedSubjects = items
    .filter((item) => ['possible', 'hypothesis'].includes(item.epistemicStatus))
    .map((item) => item.subject);

  const relevantSubjects = new Set([
    ...items.map((item) => item.subject),
    ...missingFields.map((field) => `field:${field}`),
  ]);

  const unresolvedConflicts = [...conflictSubjects].filter((subject) => relevantSubjects.has(subject));
  const staleDependencies = staleSubjects.filter((subject) => relevantSubjects.has(subject));
  const missingEvidence = missingFields.filter((field) => items.every(
    (item) => item.subject !== `field:${field}` || item.epistemicStatus !== 'missing',
  ));
  const unsupportedAssumptions = unsupportedSubjects.filter((subject) => relevantSubjects.has(subject));

  let epistemicReadiness = 'high';
  if (unresolvedConflicts.length > 0) {
    epistemicReadiness = 'low';
  } else if (missingFields.length > 0 || staleDependencies.length > 0 || unsupportedAssumptions.length > 0) {
    epistemicReadiness = 'moderate';
  }

  let safeRecommendation = 'proceed';
  if (unresolvedConflicts.length > 0) {
    safeRecommendation = 'ask';
  } else if (staleDependencies.some((subject) => subject.startsWith('balance'))) {
    safeRecommendation = 'refresh';
  } else if (missingFields.length > 0 || unsupportedAssumptions.length > 0) {
    safeRecommendation = 'ask';
  }

  return {
    epistemicReadiness,
    unsupportedAssumptions,
    unresolvedConflicts,
    staleDependencies,
    missingEvidence,
    safeRecommendation,
  };
}

// -----------------------------------------------
// Verificador principal
// -----------------------------------------------
export function runEpistemicVerifier(input = {}) {
  const policy = input.policy ?? EPISTEMIC_POLICY;
  const nowIso = toIso(input.now) ?? new Date().toISOString();
  const normalizedMessage = input.normalizedMessage ?? null;
  const cognitiveContext = input.cognitiveContext ?? null;
  const snapshot = input.financialSnapshot ?? null;
  const operationalMemory = input.operationalMemory ?? null;
  const plan = input.plan ?? null;
  const session = input.session ?? null;
  const epistemicState = input.epistemicState ?? null;
  const intent = cognitiveContext?.lastIntent
    ?? normalizedMessage?.classificationEvidence?.intent
    ?? epistemicState?.intent?.value
    ?? null;

  const rulesUsed = [
    'fonte_priorizada_por_politica',
    'confianca_deterministica',
    'conflito_nao_auto_resolvido',
    'execucao_bloqueada_shadow_mode',
  ];

  // 1. Coleta de itens.
  let items = [];
  items.push(...buildFromEpistemicState(epistemicState, snapshot, nowIso));

  const balanceClaim = buildUserBalanceClaim(epistemicState, snapshot, intent, nowIso);
  if (balanceClaim) items.push(balanceClaim);

  const memories = buildFromMemories(
    Array.isArray(input.persistentMemories) ? input.persistentMemories : null,
    session,
    nowIso,
  );
  items.push(...memories.items);

  items.push(...buildFromOperationalMemory(operationalMemory, nowIso));
  items.push(...buildMissingItems(plan, nowIso));

  // 2. Limites de quantidade (desempenho — sem crescimento não limitado).
  const truncatedItems = items.length > policy.limits.maxItemsPerVerification;
  if (truncatedItems) {
    items = items.slice(0, policy.limits.maxItemsPerVerification);
  }
  for (const item of items) {
    if (Array.isArray(item.evidence) && item.evidence.length > policy.limits.maxEvidencePerItem) {
      item.evidence = item.evidence.slice(0, policy.limits.maxEvidencePerItem);
    }
  }

  // 3. Conflitos (antes da consolidação de status).
  const conflicts = detectEpistemicConflict(items, {
    policy,
    maxConflicts: policy.limits.maxConflicts,
  });
  applyConflicts(items, conflicts);

  // 4. Staleness e itens ausentes.
  const staleItems = [];
  const missingItems = [];
  for (const item of items) {
    const staleness = evaluateStaleness(item, nowIso, policy);
    if (staleness.state === 'stale' || staleness.state === 'expired') {
      staleItems.push({
        subject: item.subject,
        value: item.value,
        state: staleness.state,
        ageMs: staleness.ageMs,
        source: item.source,
      });
    }
    if (item.epistemicStatus === 'missing' || item.claimType === 'absence') {
      missingItems.push({
        subject: item.subject,
        field: item.diagnostics?.field ?? null,
      });
    }
  }

  // 5. Uso e capacidades finais.
  for (const item of items) {
    item.usableFor = computeUsableFor(item, { policy });
    const usage = resolveEpistemicUsage(item, { policy });
    item.diagnostics = {
      ...item.diagnostics,
      usage: usage.usage,
      usageReason: usage.reason,
      staleness: evaluateStaleness(item, nowIso, policy).state,
    };
  }

  // 6. Sumários.
  const sufficiency = buildSufficiency(items);
  const recommendations = buildRecommendations({ conflicts, items, plan, limits: policy.limits });

  return {
    items: items.map(serializeEpistemicItem),
    conflicts: conflicts.map(summarizeConflict),
    staleItems,
    missingItems,
    evidenceSummary: buildEvidenceSummary(items),
    confidenceSummary: buildConfidenceSummary(items),
    sufficiency,
    recommendations,
    diagnostics: {
      rulesUsed,
      itemCount: items.length,
      memoryCount: memories.items.length,
      memoryScopeFiltered: memories.scopeFiltered,
      truncated: {
        items: truncatedItems,
        conflicts: conflicts.length >= policy.limits.maxConflicts,
      },
      limits: {
        maxItemsPerVerification: policy.limits.maxItemsPerVerification,
        maxConflicts: policy.limits.maxConflicts,
      },
    },
  };
}
