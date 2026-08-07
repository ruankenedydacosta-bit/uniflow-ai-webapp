// Sprint 4 (Bloco 4.2.2) — Orquestrador semântico financeiro central.
//
// Ponto único que transforma a interpretação da LLM (já validada pelo
// contrato em financialIntentSchema.js) em um resultado estruturado
// executável. NUNCA duplica lógica de cálculo/validação: para as
// intenções já suportadas pelo motor determinístico via a ponte da
// Sprint 3 (semanticFinancialQuery.js), delega para ela; para as
// capacidades novas conectadas nesta Sprint, delega para o registro
// central (financialCapabilityRegistry.js), que por sua vez só lê do
// snapshot (financialSnapshot.js) -- nenhum cálculo é feito aqui.
//
// Garantias (auditáveis por teste):
// - nunca executa escrita (write intents são sempre recusados aqui --
//   o texto original segue para o fluxo de registro determinístico já
//   existente, que já exige confirmação explícita);
// - nunca inventa conta/categoria (toda entidade passa por
//   findAccountsByPhrase/findCategoriesByPhrase antes de ser usada);
// - ambiguidade real sempre pergunta, em qualquer nível de confiança;
// - consultas compostas são no máximo 3 sub-consultas, todas de leitura,
//   cada uma resolvida de forma independente -- falha parcial nunca
//   apaga os resultados que já deram certo;
// - nenhuma capacidade inexistente é anunciada (o catálogo enviado à LLM
//   vem sempre de listAvailableCapabilities()).
import {
  FINANCIAL_INTENT_STATUS,
  isFinancialIntentReadType,
  isFinancialIntentWriteType,
} from '../uni-llm/financialIntentSchema.js';
import {
  resolveSemanticFinancialIntent,
  CONFIDENCE_THRESHOLD_LOW,
} from './semanticFinancialQuery.js';
import { findAccountsByPhrase, findCategoriesByPhrase } from './financialQueryEngine.js';
import { executeCapability, listAvailableCapabilities } from './financialCapabilityRegistry.js';
import { extractMentionedCurrencyValues } from './composeNaturalFinancialResponse.js';
import { extractMentionedEntityNames } from './financialEntityGuardrail.js';

// Sprint 4 Ciclo 4 (Bloco 4.8) — mesma lógica já aplicada a números
// (`values`, acima): calcula, a partir do texto DETERMINÍSTICO confiável
// (nunca do texto da LLM), quais nomes reais de conta/categoria esta
// resposta especificamente autoriza. É essa lista (`entityNames`) que o
// guardrail textual do composer (financialEntityGuardrail.js) usa como
// conjunto PERMITIDO -- qualquer entidade real que a LLM mencione fora
// dela é tratada como fora de escopo, mesmo que exista no workspace.
function computeEntityNames(snapshot, text) {
  const accountNames = Array.isArray(snapshot?.accounts) ? snapshot.accounts.map((a) => a?.name).filter(Boolean) : [];
  const categoryNames = Array.isArray(snapshot?.categories) ? snapshot.categories.map((c) => c?.name).filter(Boolean) : [];
  return extractMentionedEntityNames(text, [...accountNames, ...categoryNames]);
}

export const MAX_ORCHESTRATOR_SUB_INTENTS = 3;

// Intenções já resolvidas pela ponte da Sprint 3 (reaproveita o motor
// determinístico via texto canônico -- financialQueryEngine.js).
const LEGACY_BRIDGE_INTENTS = new Set([
  'total_expenses', 'account_balance', 'expenses_by_account',
  'expenses_by_category', 'period_comparison', 'query_refinement',
]);

// Intenções conectadas nesta Sprint via o registro central de capacidades.
const REGISTRY_INTENTS = new Set([
  'total_balance', 'financial_summary', 'total_income',
  'income_by_account', 'income_by_category', 'top_expenses', 'recent_transactions',
]);

function buildAmbiguityQuestion(kind, matches) {
  const names = matches.map((m) => m.name).join(', ');
  return `Encontrei ${matches.length} ${kind} parecidas: ${names}. Qual delas você quer dizer?`;
}

// Resolve conta/categoria mencionadas contra dados reais. Nunca inventa:
// sem match, devolve o texto original (o handler da capacidade decide como
// responder honestamente -- "não encontrei").
function resolveNamedEntity(rawPhrase, finder, snapshot) {
  if (!rawPhrase) return { value: null, ambiguousQuestion: null };
  const { matches, ambiguous } = finder(snapshot, rawPhrase);
  if (ambiguous) {
    return { value: null, ambiguousQuestion: matches };
  }
  if (matches.length === 1) return { value: matches[0].name, ambiguousQuestion: null };
  return { value: rawPhrase, ambiguousQuestion: null };
}

// Resolve UMA intenção (seja a principal, seja um subIntent de consulta
// composta) contra dados reais e devolve um resultado estruturado padrão.
// Nunca lança.
function resolveSingleIntent({ intent, entities }, context) {
  const { snapshot, mode, conversationStyle, history, referenceDate, lastQuery } = context;

  if (!intent) {
    return { status: 'unsupported', reason: 'no_intent', structuredResult: null, responseDraft: null, source: 'semantic' };
  }

  if (isFinancialIntentWriteType(intent)) {
    // Guardrail central (4.2/regra 9): escrita NUNCA é executada pelo
    // orquestrador, mesmo dentro de uma consulta composta.
    return { status: 'unsupported', reason: 'write_not_allowed_here', structuredResult: null, responseDraft: null, source: 'semantic' };
  }

  if (LEGACY_BRIDGE_INTENTS.has(intent)) {
    const outcome = resolveSemanticFinancialIntent({
      interpretation: {
        status: FINANCIAL_INTENT_STATUS.RESOLVED,
        intent,
        confidence: 1,
        entities,
        clarificationQuestion: null,
        reasoningTags: [],
      },
      snapshot,
      mode,
      conversationStyle,
      history,
      referenceDate,
      lastQuery,
    });
    if (!outcome.handled) {
      return { status: 'fallback', reason: 'legacy_bridge_not_handled', structuredResult: null, responseDraft: null, source: 'deterministic' };
    }
    return {
      status: 'handled',
      // Bloco 4.7 (matriz de naturalidade): a ponte legada não devolve
      // campos numéricos estruturados (só texto pronto), o que deixava o
      // guardrail do composer via LLM (validateComposedResponse) sem
      // NENHUM valor contra o qual validar -- rejeitando (ou, pior,
      // aceitando por coincidência) qualquer número que a LLM mencionasse
      // para essas intenções. `values` extrai os números REAIS do próprio
      // texto determinístico (fonte confiável) para fechar essa lacuna.
      structuredResult: {
        text: outcome.response.text,
        highlight: outcome.response.highlight,
        values: extractMentionedCurrencyValues(outcome.response.text),
        entityNames: computeEntityNames(snapshot, outcome.response.text),
      },
      responseDraft: outcome.response.text,
      source: 'deterministic',
      capabilityId: intent,
    };
  }

  if (REGISTRY_INTENTS.has(intent)) {
    let account = null;
    let category = null;

    if (entities.account) {
      const resolved = resolveNamedEntity(entities.account, findAccountsByPhrase, snapshot);
      if (resolved.ambiguousQuestion) {
        return {
          status: 'needs_clarification',
          reason: 'ambiguous_account',
          clarification: buildAmbiguityQuestion('contas', resolved.ambiguousQuestion),
          structuredResult: null,
          responseDraft: null,
          source: 'semantic',
        };
      }
      account = resolved.value;
    }

    if (entities.category) {
      const resolved = resolveNamedEntity(entities.category, findCategoriesByPhrase, snapshot);
      if (resolved.ambiguousQuestion) {
        return {
          status: 'needs_clarification',
          reason: 'ambiguous_category',
          clarification: buildAmbiguityQuestion('categorias', resolved.ambiguousQuestion),
          structuredResult: null,
          responseDraft: null,
          source: 'semantic',
        };
      }
      category = resolved.value;
    }

    const result = executeCapability(intent, snapshot, {
      period: entities.period,
      account,
      category,
    });

    if (!result) {
      return { status: 'unsupported', reason: 'capability_not_found', structuredResult: null, responseDraft: null, source: 'semantic' };
    }
    if (!result.ok) {
      return {
        status: result.reason === 'period_not_recognized' ? 'needs_clarification' : 'unsupported',
        reason: result.reason,
        clarification: result.reason === 'period_not_recognized' ? result.text : null,
        structuredResult: null,
        responseDraft: null,
        source: 'semantic',
      };
    }
    return {
      status: 'handled',
      structuredResult: {
        ...result.data,
        entityNames: computeEntityNames(snapshot, result.text),
      },
      responseDraft: result.text,
      source: 'semantic',
      capabilityId: intent,
    };
  }

  return { status: 'unsupported', reason: 'capability_not_connected', structuredResult: null, responseDraft: null, source: 'semantic' };
}

function dedupeSubIntents(subIntents) {
  const seen = new Set();
  const out = [];
  for (const sub of subIntents) {
    const key = `${sub.intent}::${sub.entities?.account ?? ''}::${sub.entities?.category ?? ''}::${sub.entities?.period ?? ''}`;
    if (seen.has(key)) continue; // protege contra sub-intenção duplicada/repetida
    seen.add(key);
    out.push(sub);
  }
  return out;
}

// Ponto de entrada central. Recebe a INTERPRETAÇÃO JÁ VALIDADA (pelo
// schema em financialIntentSchema.js -- este orquestrador nunca valida
// JSON bruto, isso é responsabilidade de interpretFinancialIntent.js).
//
// Retorna sempre o mesmo contrato de saída (nunca lança):
// { status, intent, executionPlan, resolvedEntities, unresolvedEntities,
//   structuredResult, responseDraft, confidence, source }
export function runFinancialSemanticOrchestrator({
  interpretation,
  snapshot,
  mode = 'pessoal',
  conversationStyle,
  history = [],
  referenceDate = null,
  lastQuery = null,
} = {}) {
  if (!interpretation || !snapshot) {
    return {
      status: 'fallback',
      intent: null,
      executionPlan: null,
      resolvedEntities: {},
      unresolvedEntities: {},
      structuredResult: null,
      responseDraft: null,
      confidence: 0,
      source: 'fallback',
    };
  }

  const { status, intent, confidence, entities, clarificationQuestion, isCompound, subIntents } = interpretation;
  const context = { snapshot, mode, conversationStyle, history, referenceDate, lastQuery };

  if (status === FINANCIAL_INTENT_STATUS.NOT_FINANCIAL) {
    return {
      status: 'not_financial', intent, executionPlan: null, resolvedEntities: {}, unresolvedEntities: {},
      structuredResult: null, responseDraft: null, confidence, source: 'semantic',
    };
  }
  if (status === FINANCIAL_INTENT_STATUS.UNSUPPORTED) {
    return {
      status: 'unsupported', intent, executionPlan: null, resolvedEntities: {}, unresolvedEntities: {},
      structuredResult: null, responseDraft: null, confidence, source: 'semantic',
    };
  }

  // Confiança baixa ou a própria LLM já sinalizou necessidade de
  // clarificação: nunca executa nada, em nenhum caso -- mesmo padrão já
  // comprovado na Sprint 3.
  if (confidence < CONFIDENCE_THRESHOLD_LOW || status === FINANCIAL_INTENT_STATUS.NEEDS_CLARIFICATION) {
    return {
      status: 'needs_clarification',
      intent,
      executionPlan: null,
      resolvedEntities: {},
      unresolvedEntities: {},
      structuredResult: null,
      responseDraft: clarificationQuestion || null,
      confidence,
      source: 'semantic',
    };
  }

  // ── Consulta composta (Bloco 4.2.5) ──────────────────────────────────
  if (isCompound && Array.isArray(subIntents) && subIntents.length > 0) {
    const safeSubIntents = dedupeSubIntents(subIntents).slice(0, MAX_ORCHESTRATOR_SUB_INTENTS);
    const results = safeSubIntents.map((sub) => ({
      intent: sub.intent,
      ...resolveSingleIntent(sub, context),
    }));

    const handledResults = results.filter((r) => r.status === 'handled');
    // Falha parcial nunca apaga resultados válidos: se PELO MENOS UM
    // subIntent foi resolvido, o turno é "handled" com os resultados
    // parciais; só cai para "fallback" se NENHUM subIntent resolveu.
    if (handledResults.length === 0) {
      return {
        status: 'fallback',
        intent,
        executionPlan: { type: 'compound', steps: results.map((r) => ({ intent: r.intent, status: r.status })) },
        resolvedEntities: {},
        unresolvedEntities: {},
        structuredResult: null,
        responseDraft: null,
        confidence,
        source: 'semantic',
      };
    }

    // Resposta final separa claramente cada parte (regra explícita do
    // Bloco 4.2.5) -- composição determinística aqui; uma composição mais
    // natural (LLM) pode substituir isto via composeNaturalFinancialResponse,
    // que recebe exatamente este array de fatos, nunca recalcula nada.
    const responseDraft = handledResults.map((r) => r.responseDraft).filter(Boolean).join(' ');

    // Bloco 4.8 -- união dos nomes autorizados por CADA parte já resolvida
    // (cada `r.structuredResult.entityNames` já foi calculado por
    // resolveSingleIntent acima, a partir do texto determinístico
    // confiável de cada parte).
    const entityNames = [...new Set(
      handledResults.flatMap((r) => (Array.isArray(r.structuredResult?.entityNames) ? r.structuredResult.entityNames : [])),
    )];

    return {
      status: 'handled',
      intent,
      executionPlan: { type: 'compound', steps: results.map((r) => ({ intent: r.intent, status: r.status, source: r.source })) },
      resolvedEntities: {},
      unresolvedEntities: {},
      structuredResult: {
        parts: handledResults.map((r) => ({ intent: r.intent, capabilityId: r.capabilityId, data: r.structuredResult })),
        entityNames,
      },
      responseDraft,
      confidence,
      source: 'semantic',
    };
  }

  // ── Consulta simples ─────────────────────────────────────────────────
  if (!isFinancialIntentReadType(intent)) {
    // Escrita: nunca executada aqui -- devolve fallback para o texto
    // original seguir para o fluxo de registro determinístico existente.
    return {
      status: 'fallback', intent, executionPlan: null, resolvedEntities: {}, unresolvedEntities: {},
      structuredResult: null, responseDraft: null, confidence, source: 'semantic',
    };
  }

  const single = resolveSingleIntent({ intent, entities }, context);
  if (single.status === 'needs_clarification') {
    return {
      status: 'needs_clarification', intent, executionPlan: null, resolvedEntities: {}, unresolvedEntities: {},
      structuredResult: null, responseDraft: single.clarification, confidence, source: single.source,
    };
  }
  if (single.status === 'fallback' || single.status === 'unsupported') {
    return {
      status: single.status, intent, executionPlan: null, resolvedEntities: {}, unresolvedEntities: {},
      structuredResult: null, responseDraft: null, confidence, source: single.source,
    };
  }
  return {
    status: 'handled',
    intent,
    executionPlan: { type: LEGACY_BRIDGE_INTENTS.has(intent) ? 'query_engine' : 'capability', id: single.capabilityId ?? intent },
    resolvedEntities: entities,
    unresolvedEntities: {},
    structuredResult: single.structuredResult,
    responseDraft: single.responseDraft,
    confidence,
    source: single.source,
  };
}

// Catálogo REAL a enviar para a LLM -- nunca anuncia uma capacidade que
// não está no registro central (regra 4.2.3).
export function buildOrchestratorCapabilityCatalog() {
  return listAvailableCapabilities();
}
