// Política de uso do Modelo Epistêmico (Fase 4 — seção 15).
//
// resolveEpistemicUsage(item, context):
//   confirmed + database_record      → use_for_display
//   probable  + persistent_memory   → use_for_suggestion
//   conflicting                      → ask_user
//   stale + estado financeiro        → refresh_data
//   missing                          → ask_user
//   invalid                          → block
//
// O contexto pode exigir confirmação (ex.: pendência ativa do pipeline);
// nesse caso itens utilizáveis são rebaixados para require_confirmation.
// Execução NUNCA é autorizada nesta fase.
import {
  EPISTEMIC_POLICY,
  stalenessDomainForSubject,
} from './epistemicPolicy.js';
import {
  EPISTEMIC_USABLE_FOR_CAPABILITIES,
} from './epistemicTypes.js';

const DATABASE_SOURCES = new Set(['database_record', 'financial_snapshot']);
const MEMORY_SOURCES = new Set(['persistent_memory', 'operational_memory']);
const CONFIRMED_BY_USER = new Set(['user_confirmation', 'user_correction']);

export function computeUsableFor(item, options = {}) {
  const policy = options.policy ?? EPISTEMIC_POLICY;
  const capabilities = {};
  for (const capability of EPISTEMIC_USABLE_FOR_CAPABILITIES) {
    capabilities[capability] = false;
  }

  if (!item || typeof item !== 'object') {
    capabilities.none = true;
    return capabilities;
  }

  const status = item.epistemicStatus;
  const confidence = Number(item.confidence) || 0;

  if (status === 'confirmed' || status === 'supported') {
    capabilities.display = confidence >= policy.sufficiency.displayMinConfidence;
    capabilities.suggestion = confidence >= policy.sufficiency.suggestMinConfidence;
    capabilities.confirmation = confidence >= policy.sufficiency.confirmMinConfidence
      && !hasContradictions(item)
      && status !== 'stale';
  } else if (status === 'probable') {
    capabilities.suggestion = confidence >= policy.sufficiency.suggestMinConfidence;
  } else if (status === 'possible' || status === 'hypothesis') {
    capabilities.question = true;
  } else if (status === 'missing' || status === 'ambiguous') {
    capabilities.question = true;
  } else if (status === 'conflicting') {
    capabilities.question = true;
  }

  // memory_candidate: evidência suficiente e sem contradição.
  if (
    status !== 'missing'
    && status !== 'conflicting'
    && status !== 'invalid'
    && confidence >= policy.sufficiency.storeMemoryMinConfidence
    && !hasContradictions(item)
  ) {
    capabilities.memory_candidate = true;
  }

  // execution permanece SEMPRE false nesta fase (regra absoluta).
  capabilities.execution = false;

  const hasAny = Object.values(capabilities).some(Boolean);
  capabilities.none = !hasAny || status === 'invalid' || status === 'unknown';
  return capabilities;
}

function hasContradictions(item) {
  return Array.isArray(item.contradictions) && item.contradictions.length > 0;
}

export function resolveEpistemicUsage(item, context = {}) {
  if (!item || typeof item !== 'object') {
    return { usage: 'ignore', reason: 'item_invalid' };
  }
  const status = item.epistemicStatus;
  const source = item.source ?? 'unknown';
  const domain = stalenessDomainForSubject(item.subject);

  // Inválido → block.
  if (status === 'invalid') {
    return { usage: 'block', reason: 'invalid_item' };
  }

  // Ausente → ask_user.
  if (status === 'missing' || item.claimType === 'absence') {
    return { usage: 'ask_user', reason: 'missing_value' };
  }

  // Conflitante → ask_user (nunca escolhe automaticamente).
  if (status === 'conflicting' || (Array.isArray(item.contradictions) && item.contradictions.length > 0)) {
    return { usage: 'ask_user', reason: 'conflicting_evidence' };
  }

  // Stale + estado financeiro → refresh_data.
  if (status === 'stale' && domain === 'balance') {
    return { usage: 'refresh_data', reason: 'stale_financial_state' };
  }
  if (status === 'stale' || status === 'expired') {
    return { usage: 'ask_user', reason: 'stale_value' };
  }

  // Ambíguo / hipótese → ask_user.
  if (status === 'ambiguous' || status === 'hypothesis' || status === 'unknown') {
    return { usage: 'ask_user', reason: `${status}_value` };
  }

  let usage = 'ignore';
  let reason = 'low_confidence';

  if (status === 'confirmed') {
    if (DATABASE_SOURCES.has(source)) {
      usage = 'use_for_display';
      reason = 'confirmed_database_source';
    } else if (CONFIRMED_BY_USER.has(source)) {
      usage = 'use_for_display';
      reason = 'confirmed_by_user';
    } else if (MEMORY_SOURCES.has(source)) {
      usage = 'use_for_suggestion';
      reason = 'confirmed_memory_source';
    } else {
      usage = 'use_for_suggestion';
      reason = 'confirmed_source';
    }
  } else if (status === 'supported') {
    if (DATABASE_SOURCES.has(source)) {
      usage = 'use_for_display';
      reason = 'supported_database_source';
    } else if (MEMORY_SOURCES.has(source)) {
      usage = 'use_for_suggestion';
      reason = 'supported_memory_source';
    } else {
      usage = 'use_for_suggestion';
      reason = 'supported_user_source';
    }
  } else if (status === 'probable') {
    if (MEMORY_SOURCES.has(source)) {
      usage = 'use_for_suggestion';
      reason = 'probable_memory_source';
    } else {
      usage = 'use_for_suggestion';
      reason = 'probable_source';
    }
  } else if (status === 'possible') {
    usage = 'use_for_suggestion';
    reason = 'possible_source';
  }

  // Contexto operacional: confirmação obrigatória rebaixa o uso.
  if (usage !== 'ignore' && usage !== 'block' && usage !== 'ask_user') {
    if (context.requiresConfirmation) {
      return { usage: 'require_confirmation', reason: 'operational_confirmation_required' };
    }
    if (context.purpose === 'execute') {
      // Nenhuma afirmação epistêmica autoriza execução nesta fase.
      return { usage: 'block', reason: 'execution_blocked_shadow_mode' };
    }
  }

  return { usage, reason };
}
