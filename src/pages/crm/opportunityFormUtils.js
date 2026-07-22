// Logica pura de formulario de oportunidades: valores iniciais, validacao
// (criacao/edicao) e montagem dos payloads de mutacao. Sem dependencia de
// React/Supabase -- testavel via node --test. Mesmo padrao de
// clientFormUtils.js.

const SAFE_ERROR_CODES = new Set([
  'INVALID_OPPORTUNITY_REQUEST',
  'OPPORTUNITY_NOT_FOUND',
  'SUPABASE_NOT_CONFIGURED',
]);

export function getOpportunityErrorMessage(error, fallbackMessage) {
  if (!error) return '';
  return SAFE_ERROR_CODES.has(error.code) ? error.message : fallbackMessage;
}

/**
 * Mensagens fixas para os erros de dominio levantados pelo trigger
 * validate_crm_opportunity_relationships (supabase/migrations/
 * 20260721_016_crm_pipeline.sql) durante a criacao de uma oportunidade.
 * Esses erros chegam como erro cru do Postgrest (codigo fora de
 * SAFE_ERROR_CODES) -- casamos por substring fixa e controlada (texto
 * nosso, escrito na propria migration), nunca por regex generica, e nunca
 * retornamos error.message cru. Escopo: somente criacao -- edicao/
 * movimentacao tem seus proprios fluxos e nao usam esta funcao.
 */
const CREATION_ERROR_PATTERNS = [
  {
    match: 'cannot create an opportunity for an archived client',
    message: 'Este cliente está arquivado. Reative-o ou escolha outro cliente.',
  },
  {
    match: 'cannot create an opportunity in an archived stage',
    message: 'Esta etapa está arquivada. Escolha outra etapa.',
  },
  {
    match: 'cannot move an opportunity into an archived stage',
    message: 'Esta etapa está arquivada. Escolha outra etapa.',
  },
  {
    match: 'belongs to a different workspace',
    message: 'Cliente ou etapa não pertence a este espaço de trabalho. Atualize a página e tente novamente.',
  },
];

export function getOpportunityCreationErrorMessage(error, fallbackMessage) {
  if (!error) return '';

  if (SAFE_ERROR_CODES.has(error.code)) {
    return error.message;
  }

  const knownPattern = CREATION_ERROR_PATTERNS.find(
    (pattern) => typeof error.message === 'string' && error.message.includes(pattern.match),
  );

  return knownPattern ? knownPattern.message : fallbackMessage;
}

const MOVE_ERROR_PATTERNS = [
  {
    match: 'cannot move an opportunity into an archived stage',
    message: 'Esta etapa está arquivada. Escolha outra etapa.',
  },
  {
    match: 'belongs to a different workspace',
    message: 'Cliente ou etapa não pertence a este espaço de trabalho. Atualize a página e tente novamente.',
  },
];

export function getOpportunityMoveErrorMessage(error, fallbackMessage) {
  if (!error) return '';

  if (SAFE_ERROR_CODES.has(error.code)) {
    return error.message;
  }

  const knownPattern = MOVE_ERROR_PATTERNS.find(
    (pattern) => typeof error.message === 'string' && error.message.includes(pattern.match),
  );

  return knownPattern ? knownPattern.message : fallbackMessage;
}

export function createEmptyOpportunityForm() {
  return {
    title: '',
    client_id: '',
    stage_id: '',
    estimated_value: '',
  };
}

/**
 * client_id e stage_id permanecem no estado para exibicao (contexto
 * somente leitura -- ex.: mostrar o cliente/etapa atual na tela de
 * edicao). Movimentacao de etapa e uma acao separada
 * (moveOpportunityStage); o builder de update nunca envia esses campos.
 */
export function createOpportunityEditForm(opportunity) {
  return {
    title: opportunity.title ?? '',
    client_id: opportunity.client_id ?? '',
    stage_id: opportunity.stage_id ?? '',
    estimated_value: String(opportunity.estimated_value ?? 0),
  };
}

function isValidEstimatedValue(estimatedValue) {
  if (estimatedValue === '') return true;
  const numericValue = Number(estimatedValue);
  return Number.isFinite(numericValue) && numericValue >= 0;
}

/**
 * `mode` distingue criacao (exige client_id/stage_id) de edicao (nao
 * exige, pois esses campos nao sao mutaveis pelo formulario de edicao).
 */
export function validateOpportunityForm(form, { mode = 'create' } = {}) {
  if (!form.title?.trim()) {
    return 'Titulo da oportunidade e obrigatorio.';
  }

  if (mode === 'create') {
    if (!form.client_id) {
      return 'Cliente e obrigatorio.';
    }

    if (!form.stage_id) {
      return 'Etapa e obrigatoria.';
    }
  }

  if (!isValidEstimatedValue(form.estimated_value)) {
    return 'Valor estimado deve ser um numero maior ou igual a zero.';
  }

  return null;
}

/**
 * Deve ser chamado somente apos validateOpportunityForm(form, { mode:
 * 'create' }) retornar null -- nao remascara valor invalido, so converte o
 * valor ja validado.
 */
export function buildOpportunityCreationPayload(form) {
  return {
    title: form.title.trim(),
    client_id: form.client_id,
    stage_id: form.stage_id,
    estimated_value: form.estimated_value === '' ? 0 : Number(form.estimated_value),
  };
}

/**
 * Deve ser chamado somente apos validateOpportunityForm(form, { mode:
 * 'edit' }) retornar null. client_id, stage_id, outcome e demais campos
 * protegidos nunca integram este payload -- movimentacao de etapa e
 * mudanca de resultado sao acoes separadas.
 */
export function buildOpportunityUpdatePayload(form) {
  return {
    title: form.title.trim(),
    estimated_value: form.estimated_value === '' ? 0 : Number(form.estimated_value),
  };
}
