// Sprint 4 Ciclo 3 (Bloco 4.4.5) + Ciclo 4 (Bloco 4.8): orquestra a
// composição REAL via LLM (composeFinancialResponseViaLlm.js, modo
// `financial_response_compose`) com guardrails e fallback determinístico.
// Reaproveita os validadores já existentes -- nunca duplica lógica de
// guardrail:
//   - validateComposedResponse (Ciclo 2/3): nenhum valor monetário fora
//     dos fatos estruturados;
//   - validateComposedEntities (Ciclo 4, Bloco 4.8): nenhuma conta/banco/
//     cartão/carteira/categoria/meta/investimento/ativo fora de escopo ou
//     inventado.
// Máx. 1 tentativa de reformulação (2 chamadas no total); qualquer falha
// (de número OU de entidade) volta para o texto determinístico já pronto
// (composeNaturalFinancialResponse.js), nunca bloqueia o usuário.
//
// Telemetria: esta função NÃO loga -- devolve { composerUsed, fallbackReason,
// attempts } para o chamador (UniChatPage.jsx) registrar, no mesmo padrão já
// usado para a telemetria do orquestrador (log centralizado no call site).
import { validateComposedResponse } from './composeNaturalFinancialResponse.js';
import { validateComposedEntities } from './financialEntityGuardrail.js';

const MAX_ATTEMPTS = 2;

function isGuardrailValid(text, structuredFacts, { allowedEntityNames, universeEntityNames }) {
  if (typeof text !== 'string' || !text.trim()) return { valid: false, reason: 'INVALID_RESPONSE' };
  const numberCheck = validateComposedResponse(text, structuredFacts);
  if (!numberCheck.valid) return { valid: false, reason: 'GUARDRAIL_FAILED_NUMBER' };
  const entityCheck = validateComposedEntities(text, { allowedEntityNames, universeEntityNames });
  if (!entityCheck.valid) return { valid: false, reason: `GUARDRAIL_FAILED_${entityCheck.reason?.toUpperCase() ?? 'ENTITY'}` };
  return { valid: true, reason: null };
}

// `deterministicText` é obrigatório: é o resultado já pronto e seguro de
// composeNaturalFinancialResponse() para os mesmos fatos -- o único
// fallback aceitável quando a LLM falha ou viola algum guardrail.
//
// `allowedEntityNames` (Bloco 4.8) -- nomes reais que OS FATOS DESTA
// RESPOSTA autorizam (o orquestrador já calcula isso a partir do texto
// determinístico -- ver financialSemanticOrchestrator.js,
// `structuredFacts.entityNames`). `universeEntityNames` -- todos os nomes
// reais de conta/categoria do workspace (mesma lista já enviada à
// interpretação semântica, Sprint 3 -- nunca um dado novo). Ambos opcionais:
// sem eles, o guardrail de entidades simplesmente não encontra nada a
// reprovar (nenhuma regressão para quem ainda não passa essas listas).
export async function composeFinancialResponseWithLlm({
  composeFinancialResponseViaLlm,
  structuredFacts = null,
  userIntent = null,
  operation = null,
  conversationStyle = 'simple',
  emotionalContext = null,
  explanationRequest = null,
  deterministicText,
  allowedEntityNames = null,
  universeEntityNames = null,
} = {}) {
  const hasDeterministicFallback = typeof deterministicText === 'string' && deterministicText.trim().length > 0;
  if (typeof composeFinancialResponseViaLlm !== 'function' || !hasDeterministicFallback) {
    return {
      text: hasDeterministicFallback ? deterministicText : null,
      composerUsed: false,
      fallbackReason: 'unsupported',
      attempts: 0,
    };
  }

  // Sem `allowedEntityNames` explícito, cai para o que o orquestrador já
  // calculou dentro dos próprios fatos (`structuredFacts.entityNames`) --
  // nunca exige o chamador passar a mesma coisa duas vezes.
  const effectiveAllowedEntityNames = Array.isArray(allowedEntityNames)
    ? allowedEntityNames
    : (Array.isArray(structuredFacts?.entityNames) ? structuredFacts.entityNames : []);
  const effectiveUniverseEntityNames = Array.isArray(universeEntityNames) ? universeEntityNames : [];

  let fallbackReason = 'unknown';
  let attempts = 0;
  // Bloco 4.9 -- soma o uso real de tokens de TODAS as tentativas (cada
  // uma é uma chamada real ao provedor, custa independente do resultado
  // final ser publicado ou cair no fallback). Nunca inventa: só soma o que
  // a Edge Function de fato devolveu.
  let promptTokens = 0;
  let completionTokens = 0;
  let hasUsage = false;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    attempts = attempt;
    let text = null;
    let error;
    try {
      const result = await composeFinancialResponseViaLlm({
        userIntent, operation, structuredFacts, conversationStyle, emotionalContext, explanationRequest,
      });
      text = result?.text ?? null;
      error = result?.error ?? null;
      if (result?.usage) {
        hasUsage = true;
        if (Number.isFinite(result.usage.promptTokens)) promptTokens += result.usage.promptTokens;
        if (Number.isFinite(result.usage.completionTokens)) completionTokens += result.usage.completionTokens;
      }
    } catch {
      error = { code: 'UNEXPECTED_ERROR', message: 'financial_response_compose_threw' };
    }

    if (error) {
      fallbackReason = error.code || 'unknown';
      continue;
    }
    const guardrail = isGuardrailValid(text, structuredFacts, {
      allowedEntityNames: effectiveAllowedEntityNames,
      universeEntityNames: effectiveUniverseEntityNames,
    });
    if (guardrail.valid) {
      return {
        text: text.trim(), composerUsed: true, fallbackReason: null, attempts,
        usage: hasUsage ? { promptTokens, completionTokens } : null,
      };
    }
    fallbackReason = guardrail.reason;
  }

  return {
    text: deterministicText, composerUsed: false, fallbackReason, attempts,
    usage: hasUsage ? { promptTokens, completionTokens } : null,
  };
}
