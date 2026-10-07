// BLOCO D: limiares e limites centralizados da inferencia semantica de
// categorias via OpenAI. Nenhum valor secreto aqui -- apenas configuracao
// publica de comportamento. Liga junto com a camada de LLM (uni-llm/
// llmConfig.js), sem flag propria.

// Confianca >= HIGH: a categoria sugerida e tratada como recomendacao
// principal (RESOLVED), sem uma pergunta extra de "posso usar X?" -- ainda
// assim a confirmacao final da transacao continua obrigatoria (nunca
// persiste silenciosamente).
export const CATEGORY_INFERENCE_HIGH_CONFIDENCE = 0.88;

// Confianca >= MID e < HIGH: pede confirmacao explicita da categoria antes
// de seguir (mesmo padrao ja usado por PENDING_APPROXIMATE).
export const CATEGORY_INFERENCE_MID_CONFIDENCE = 0.65;

// Abaixo de MID: nunca assume -- cai no fluxo de pergunta aberta/criacao
// assistida ja existente, como se a IA nao tivesse sugerido nada.
export const CATEGORY_INFERENCE_LOW_CONFIDENCE = CATEGORY_INFERENCE_MID_CONFIDENCE;

// Timeout dedicado, mais curto que o timeout geral do chat (uniLlmProvider
// usa 20s) -- a inferencia de categoria acontece NO MEIO do fluxo de
// registro de uma transacao por voz; esperar 20s aqui degradaria a
// experiencia. Documentado por ser um ajuste em relacao ao padrao geral.
export const CATEGORY_INFERENCE_TIMEOUT_MS = 8000;

// Quantidade maxima de categorias enviadas no payload -- protege contra
// paylods grandes e mantem o prompt pequeno/barato.
export const MAX_CATEGORY_INFERENCE_OPTIONS = 12;

// Tamanho maximo da descricao enviada (mesma ordem de grandeza do limite
// ja usado por sanitizeDescription em financialIntentAction.js).
export const MAX_CATEGORY_INFERENCE_DESCRIPTION_CHARS = 160;

// Tamanho maximo do nome de cada categoria enviada no payload.
export const MAX_CATEGORY_INFERENCE_CATEGORY_NAME_CHARS = 60;

// Tamanho maximo aceito para o nome sugerido de uma nova categoria e para a
// justificativa curta retornada pela IA -- nunca uma explicacao longa.
export const MAX_SUGGESTED_NAME_CHARS = 40;
export const MAX_REASON_CHARS = 140;

export const CATEGORY_INFERENCE_LOCALE = 'pt-BR';
