// Logica pura de formulario de itens de agenda: valores iniciais, conversao
// de data local <-> timestamptz, validacao e montagem do payload de criacao.
// Sem dependencia de React/Supabase -- testavel via node --test. Mesmo
// padrao de clientFormUtils.js/opportunityFormUtils.js (cada dominio
// duplica sua propria copia, sem compartilhamento entre CRM/Clientes/Agenda).

export const AGENDA_ITEM_TYPES = Object.freeze([
  'meeting',
  'appointment',
  'task',
  'payment_due',
  'receivable',
  'reminder',
  'other',
]);

/**
 * Rotulos pt-BR dos 7 valores de AGENDA_ITEM_TYPES -- fonte unica
 * compartilhada entre AgendaPage.jsx (filtro/exibicao) e
 * AgendaFormModal.jsx (select de criacao/edicao), para as duas telas nunca
 * divergirem sobre o mesmo mapa. Nunca persistido no banco -- rotulos em
 * pt-BR vivem so na aplicacao (ver comentario da coluna item_type na
 * migration 017).
 */
export const AGENDA_ITEM_TYPE_LABELS = Object.freeze({
  meeting: 'Reunião',
  appointment: 'Compromisso',
  task: 'Tarefa',
  payment_due: 'Vencimento',
  receivable: 'Recebimento',
  reminder: 'Lembrete',
  other: 'Outro',
});

const SAFE_ERROR_CODES = new Set([
  'INVALID_AGENDA_ITEM_REQUEST',
  'SUPABASE_NOT_CONFIGURED',
  'AGENDA_ITEM_NOT_FOUND',
  'AGENDA_ITEM_CONFLICT',
  'AGENDA_ITEM_IDEMPOTENCY_CONFLICT',
  'AGENDA_OPERATION_STORAGE_UNAVAILABLE',
  'AGENDA_OPERATION_PAYLOAD_CONFLICT',
  'AGENDA_OPERATION_SCOPE_REQUIRED',
]);

/**
 * Mensagens fixas para os erros de dominio levantados pelos triggers
 * validate_agenda_item_client/validate_agenda_item_assigned_user
 * (supabase/migrations/20260722_017_agenda_items.sql), que disparam em
 * "before insert or update" -- portanto os mesmos padroes cobrem tanto a
 * criacao quanto a edicao de um item de agenda (diferente de
 * opportunityFormUtils.js, onde os erros de arquivamento sao exclusivos da
 * criacao). Esses erros chegam como erro cru do Postgrest (codigo fora de
 * SAFE_ERROR_CODES) -- casamos por substring fixa e controlada (texto
 * nosso, escrito na propria migration), nunca por regex generica, e nunca
 * retornamos error.message cru.
 */
const CREATION_ERROR_PATTERNS = [
  {
    match: 'client belongs to a different workspace',
    message: 'Cliente não pertence a este espaço de trabalho. Atualize a página e tente novamente.',
  },
  {
    match: 'client % not found or not accessible',
    message: 'Cliente não encontrado ou não pertence mais a este espaço de trabalho.',
  },
  {
    match: 'not found or not accessible',
    message: 'Cliente não encontrado ou não pertence mais a este espaço de trabalho.',
  },
];

export function getAgendaItemErrorMessage(error, fallbackMessage) {
  if (!error) return '';

  if (SAFE_ERROR_CODES.has(error.code)) {
    return error.message;
  }

  const knownPattern = CREATION_ERROR_PATTERNS.find(
    (pattern) => typeof error.message === 'string' && error.message.includes(pattern.match),
  );

  return knownPattern ? knownPattern.message : fallbackMessage;
}

export function createEmptyAgendaItemForm() {
  return {
    item_type: '',
    title: '',
    description: '',
    location: '',
    starts_at: '',
    ends_at: '',
    is_all_day: false,
    client_id: '',
  };
}

/**
 * Mapeia um item de agenda real (vindo de agendaService.js) para o estado
 * do formulario de edicao. Mesmo padrao de createClientEditForm/
 * createOpportunityEditForm: null -> string vazia. is_all_day: true forca
 * ends_at para '' mesmo que o registro tenha um ends_at nao-nulo -- o banco
 * nao impoe essa correlacao via constraint, mas buildAgendaItemCreationPayload
 * sempre envia ends_at: null quando is_all_day, entao o formulario reflete
 * esse mesmo invariante ao carregar.
 */
export function createAgendaItemEditForm(item) {
  return {
    item_type: item.item_type ?? '',
    title: item.title ?? '',
    description: item.description ?? '',
    location: item.location ?? '',
    starts_at: formatDatetimeLocalValue(item.starts_at),
    ends_at: item.is_all_day ? '' : formatDatetimeLocalValue(item.ends_at),
    is_all_day: Boolean(item.is_all_day),
    client_id: item.client_id ?? '',
  };
}

// --- Conversao de data local (input datetime-local) <-> timestamptz -------
//
// Mesma tecnica ja validada em clientFormUtils.js: `Input type="datetime-
// local"` opera sempre em hora LOCAL do navegador, formato
// "YYYY-MM-DDTHH:mm". Uma coluna timestamptz guarda um instante absoluto.
// As conversoes abaixo passam sempre por `Date`, que interpreta
// "YYYY-MM-DDTHH:mm" (sem sufixo de fuso) como hora local -- exatamente o
// que o input datetime-local produz e espera. Nunca usar slice/getUTC*.

/** timestamptz (ISO/string vinda do banco) -> "YYYY-MM-DDTHH:mm" em hora local. Vazio/invalido -> ''. */
export function formatDatetimeLocalValue(timestamptzValue) {
  if (!timestamptzValue) return '';

  const date = new Date(timestamptzValue);
  if (Number.isNaN(date.getTime())) return '';

  const pad = (value) => String(value).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** "YYYY-MM-DDTHH:mm" (valor local do input) -> ISO (UTC). Vazio/invalido -> null. */
export function parseDatetimeLocalValue(localValue) {
  if (!localValue) return null;

  const date = new Date(localValue);
  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString();
}

/** Vazio conta como valido (campo opcional por padrao; obrigatoriedade e responsabilidade de validateAgendaItemForm). */
export function isValidDatetimeLocalValue(localValue) {
  if (!localValue) return true;
  return !Number.isNaN(new Date(localValue).getTime());
}

/**
 * "YYYY-MM-DDTHH:mm" (valor local do input) -> ISO (UTC) com o horario
 * normalizado para 00:00 local. Usado somente quando is_all_day === true.
 * Vazio/invalido -> null (a validacao de starts_at obrigatorio barra o
 * submit antes de chegar aqui).
 */
export function normalizeDatetimeLocalToStartOfDay(localValue) {
  if (!localValue) return null;

  const date = new Date(localValue);
  if (Number.isNaN(date.getTime())) return null;

  const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  return startOfDay.toISOString();
}

// --- Validacao explicita (roda no submit, antes de chamar agenda.createItem) ----

/**
 * Retorna null quando o formulario e valido, ou uma mensagem de erro (a
 * primeira violacao encontrada) caso contrario. E a barreira real antes da
 * mutacao, nao depende de `required`/`disabled` no JSX.
 */
export function validateAgendaItemForm(form) {
  if (!form.title?.trim()) {
    return 'Título do compromisso é obrigatório.';
  }

  if (!AGENDA_ITEM_TYPES.includes(form.item_type)) {
    return 'Selecione o tipo do compromisso.';
  }

  if (!isValidDatetimeLocalValue(form.starts_at) || !form.starts_at) {
    return 'Data e hora de início são obrigatórias.';
  }

  if (!isValidDatetimeLocalValue(form.ends_at)) {
    return 'Data e hora de término inválidas.';
  }

  if (!form.is_all_day && form.ends_at) {
    const startsAtIso = parseDatetimeLocalValue(form.starts_at);
    const endsAtIso = parseDatetimeLocalValue(form.ends_at);
    if (startsAtIso && endsAtIso && endsAtIso < startsAtIso) {
      return 'A data e hora de término deve ser igual ou posterior ao início.';
    }
  }

  return null;
}

// --- Payload de criacao e edicao ---------------------------------------------
//
// Lista fechada de campos, montada por atribuicao explicita (nunca por
// spread do form inteiro) -- garante estruturalmente que status,
// assigned_user_id, workspace_id, created_by, id, created_at, updated_at
// jamais sejam produzidos aqui. Mesmo padrao de
// buildClientMutationPayload/buildOpportunityCreationPayload.
//
// Reutilizado tanto por agenda.createItem quanto por agenda.updateItem
// (AgendaFormModal.jsx) -- diferente de CRM/Clientes, os 8 campos deste
// formulario tem exatamente a mesma editabilidade nos dois modos (nenhum
// campo vira somente-leitura na edicao), entao nao ha necessidade de um
// builder de update separado.
//
// Deve ser chamado somente apos validateAgendaItemForm(form) retornar null.

export function buildAgendaItemCreationPayload(form) {
  return {
    item_type: form.item_type,
    title: form.title.trim(),
    description: form.description?.trim() ? form.description.trim() : null,
    location: form.location?.trim() ? form.location.trim() : null,
    starts_at: form.is_all_day
      ? normalizeDatetimeLocalToStartOfDay(form.starts_at)
      : parseDatetimeLocalValue(form.starts_at),
    ends_at: form.is_all_day ? null : parseDatetimeLocalValue(form.ends_at),
    is_all_day: form.is_all_day,
    client_id: form.client_id || null,
  };
}
