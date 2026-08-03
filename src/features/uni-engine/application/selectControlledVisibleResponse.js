// Uni Engine — Application (Parte 5, Bloco 4: resposta visível controlada).
//
// selectControlledVisibleResponse — seleção SEGURA do texto visível no ponto
// ÚNICO de saída de resposta do chat (applyEngineGuidanceToResponse).
//
// O texto legado é o padrão absoluto: applicationResult.finalText só é usado
// quando TODAS as condições forem verdadeiras (resultado íntegro e aplicado,
// sem fallback, conteúdo factual preservado, capabilities aplicadas apenas
// Style/Length, safety íntegro, ambiente development, usuário autorizado,
// engine/Integration/Activation/Application habilitadas, flags de capability
// ligadas, confiança mínima e risco permitidos, circuit breaker fechado e
// Execution Readiness não bloqueando a aplicação).
//
// QUALQUER falha, ausência de campo ou exceção → retorna o texto legado.
// Função pura e determinística: sem efeitos colaterais, sem leitura de refs,
// sem estado React, sem persistência, sem execução. O resultado pertence ao
// MESMO turno da execução observacional — chamadas com resultado antigo ou
// ausente são rejeitadas pelo chamador (e aqui, por fail-safe).
import {
  isApplicationEnabledByPolicy,
  isCapabilityAllowedByPolicy,
  isEnvironmentAllowedByPolicy,
  isConfidenceAllowedByPolicy,
  isRiskAllowedByPolicy,
} from './applicationPolicy.js';
import { APPLICATION_SAFETY_KEYS } from './applicationTypes.js';

// ÚNICAS capabilities que podem alterar a resposta visível neste bloco.
// Question/Clarification/Financial Execution/Memory/Learning e qualquer
// capability desconhecida NUNCA autorizam o uso do finalText.
export const VISIBLE_RESPONSE_CAPABILITIES = Object.freeze([
  'RESPONSE_STYLE_GUIDANCE',
  'RESPONSE_LENGTH_GUIDANCE',
]);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Safety íntegro: todos os campos presentes, factualContentPreserved === true
// e nenhum efeito colateral habilitado (nenhuma execução, memória, aprendizado,
// confirmação, pending action, banco ou TTS). Ausente ou inválido → false.
export function isSafetyIntegral(safety) {
  if (!isPlainObject(safety)) return false;
  for (const key of APPLICATION_SAFETY_KEYS) {
    if (!Object.hasOwn(safety, key)) return false;
    const value = safety[key];
    if (key === 'factualContentPreserved') {
      if (value !== true) return false;
    } else if (value !== false) {
      return false;
    }
  }
  return true;
}

export function selectControlledVisibleResponse({
  legacyText,
  applicationResult = null,
  config = null,
  environment = null,
  authorized = false,
  executionReady = true,
  circuitBreakerOpen = false,
  confidence = null,
  risk = null,
} = {}) {
  try {
    const legacy = typeof legacyText === 'string' ? legacyText : '';
    if (!legacy) return legacy;
    if (!isPlainObject(applicationResult)) return legacy;
    const result = applicationResult;

    // 1. Resultado íntegro: aplicado, sem fallback e com conteúdo factual
    //    preservado. Qualquer variação → legado.
    if (result.applied !== true) return legacy;
    if (result.fallbackUsed === true) return legacy;
    if (result.factualContentPreserved !== true) return legacy;

    // 2. finalText válido e não vazio.
    if (typeof result.finalText !== 'string' || result.finalText.trim() === '') {
      return legacy;
    }

    // 2.1 MESMO TURNO: o resultado pertence ao texto legado ATUAL. Um
    // resultado de outro turno (originalText diferente) nunca é usado — o
    // caller garante a frescura (retorno direto), e este guard rejeita
    // qualquer resultado antigo que chegue aqui por engano.
    if (result.originalText !== legacy) return legacy;

    // 3. SOMENTE Style/Length aplicadas. Nenhuma capability proibida,
    //    desconhecida ou observacional (Question/Clarification) autoriza a
    //    troca do texto; decisões observacionais não contam como aplicação.
    if (!Array.isArray(result.appliedCapabilities) || result.appliedCapabilities.length === 0) {
      return legacy;
    }
    if (result.appliedCapabilities.some((cap) => !VISIBLE_RESPONSE_CAPABILITIES.includes(cap))) {
      return legacy;
    }
    if (result.appliedCapabilities.some((cap) => !isCapabilityAllowedByPolicy(cap))) {
      return legacy;
    }

    // 4. Safety íntegro (nenhum efeito colateral e conteúdo factual).
    if (!isSafetyIntegral(result.safety)) return legacy;

    // 5. Ambiente development + usuário autorizado.
    if (!isEnvironmentAllowedByPolicy(environment)) return legacy;
    if (authorized !== true) return legacy;

    // 6. Engine + Integration + Activation + Application habilitadas.
    const safeConfig = isPlainObject(config) ? config : {};
    if (safeConfig.enabled !== true) return legacy;
    if (safeConfig.integrationEnabled !== true) return legacy;
    if (safeConfig.activationEnabled !== true) return legacy;
    if (!isApplicationEnabledByPolicy(safeConfig)) return legacy;

    // 7. Flag explícita de cada capability aplicada no config. Sem a flag
    //    ligada, a aplicação não pode ter ocorrido → legado.
    const capabilities = isPlainObject(safeConfig.activationCapabilities)
      ? safeConfig.activationCapabilities
      : {};
    if (result.appliedCapabilities.some((cap) => capabilities[cap] !== true)) return legacy;

    // 8. Confiança mínima e risco permitido (quando informados).
    if (confidence !== null && !isConfidenceAllowedByPolicy(confidence)) return legacy;
    if (typeof risk === 'string' && !isRiskAllowedByPolicy(risk)) return legacy;

    // 9. Circuit breaker fechado e Execution Readiness não bloqueando.
    if (circuitBreakerOpen === true) return legacy;
    if (executionReady !== true) return legacy;

    // 10. Todas as condições seguras: o finalText da MESMA execução é o texto
    //     visível. Nunca é transformado nem combinado — retorno literal.
    return result.finalText;
  } catch {
    // Falha segura: qualquer exceção durante a seleção → texto legado.
    return typeof legacyText === 'string' ? legacyText : '';
  }
}
