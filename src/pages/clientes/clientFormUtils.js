// Logica pura de formulario de clientes: valores iniciais, mapeamento de
// edicao, conversao de data local <-> timestamptz, validacao e montagem do
// payload de mutacao. Sem dependencia de React/Supabase -- testavel via
// node --test.

export const ENTITY_TYPES = Object.freeze(['person', 'company']);
export const LIFECYCLE_STAGES = Object.freeze([
  'lead',
  'potential',
  'active',
  'at_risk',
  'inactive',
]);
export const RELATIONSHIP_STATUSES = Object.freeze([
  'new',
  'in_negotiation',
  'waiting_customer',
  'waiting_company',
  'in_delivery',
  'completed',
  'paused',
]);

const SAFE_ERROR_CODES = new Set([
  'INVALID_CLIENT_REQUEST',
  'CLIENT_NOT_FOUND',
  'SUPABASE_NOT_CONFIGURED',
  'WORKSPACE_REQUIRED',
]);

export function getClientErrorMessage(error, fallbackMessage) {
  if (!error) return '';
  return SAFE_ERROR_CODES.has(error.code) ? error.message : fallbackMessage;
}

export function createEmptyClientForm() {
  return {
    name: '',
    entity_type: 'person',
    lifecycle_stage: 'lead',
    relationship_status: '',
    primary_contact_name: '',
    email: '',
    phone: '',
    document_number: '',
    estimated_value: '',
    last_contact_at: '',
    next_action: '',
  };
}

export function createClientEditForm(client) {
  return {
    name: client.name ?? '',
    entity_type: client.entity_type ?? 'person',
    lifecycle_stage: client.lifecycle_stage ?? 'lead',
    relationship_status: client.relationship_status ?? '',
    primary_contact_name: client.primary_contact_name ?? '',
    email: client.email ?? '',
    phone: client.phone ?? '',
    document_number: client.document_number ?? '',
    estimated_value: String(client.estimated_value ?? 0),
    last_contact_at: formatDatetimeLocalValue(client.last_contact_at),
    next_action: client.next_action ?? '',
  };
}

// --- Conversao de data local (input datetime-local) <-> timestamptz -------
//
// `Input type="datetime-local"` opera sempre em hora LOCAL do navegador, no
// formato "YYYY-MM-DDTHH:mm". Uma coluna timestamptz guarda um instante
// absoluto (normalmente serializado em ISO UTC pelo Supabase). Usar
// `slice(0, 16)` sobre o ISO UTC recortaria a hora ERRADA sempre que o fuso
// local nao for UTC+0 -- por isso as duas conversoes abaixo passam sempre
// por `Date`, que interpreta "YYYY-MM-DDTHH:mm" (sem sufixo de fuso) como
// hora local, exatamente o que o input datetime-local produz e espera.

/**
 * timestamptz (ISO/string vinda do banco) -> "YYYY-MM-DDTHH:mm" em hora
 * local, para popular um `Input type="datetime-local"` na edicao.
 * Valor ausente ou invalido retorna string vazia (campo fica em branco,
 * nunca "Invalid Date").
 */
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

/**
 * "YYYY-MM-DDTHH:mm" (valor local do input) -> ISO com timezone (UTC), para
 * enviar ao banco como timestamptz. Vazio -> null. Invalido -> null (a
 * validacao do formulario deve barrar o submit antes de chegar aqui --
 * ver `isValidDatetimeLocalValue`/`validateClientForm`).
 */
export function parseDatetimeLocalValue(localValue) {
  if (!localValue) return null;

  const date = new Date(localValue);
  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString();
}

/** Vazio conta como valido (campo opcional). */
export function isValidDatetimeLocalValue(localValue) {
  if (!localValue) return true;
  return !Number.isNaN(new Date(localValue).getTime());
}

// --- Validacao explicita (roda no submit, antes de chamar saveClient) -----

/**
 * Retorna null quando o formulario e valido, ou uma mensagem de erro (a
 * primeira violacao encontrada) caso contrario. Nao depende de `required`,
 * `min` ou de o botao estar desabilitado -- e a barreira real antes da
 * mutacao.
 */
export function validateClientForm(form) {
  if (!form.name?.trim()) {
    return 'Nome do cliente e obrigatorio.';
  }

  if (!ENTITY_TYPES.includes(form.entity_type)) {
    return 'Tipo de cliente invalido.';
  }

  if (!LIFECYCLE_STAGES.includes(form.lifecycle_stage)) {
    return 'Estagio do relacionamento invalido.';
  }

  if (form.relationship_status && !RELATIONSHIP_STATUSES.includes(form.relationship_status)) {
    return 'Condicao operacional invalida.';
  }

  if (form.estimated_value !== '') {
    const numericValue = Number(form.estimated_value);
    if (!Number.isFinite(numericValue) || numericValue < 0) {
      return 'Valor estimado deve ser um numero maior ou igual a zero.';
    }
  }

  if (!isValidDatetimeLocalValue(form.last_contact_at)) {
    return 'Data do ultimo contato invalida.';
  }

  return null;
}

// --- Payload de mutacao -----------------------------------------------------
//
// Lista fechada de campos, montada por atribuicao explicita (nunca por
// spread do form inteiro) -- garante estruturalmente que workspace_id,
// created_by, assigned_user_id, id, created_at, updated_at e is_archived
// jamais sejam produzidos aqui, mesmo que o form algum dia ganhe outras
// chaves. Convencao de texto opcional vazio -> null replica exatamente o
// padrao ja usado em `transactionFormUtils.js` (`buildTransactionMutationPayload`,
// campos `payment_method`/`notes`), nao uma convencao nova.
export function buildClientMutationPayload(form) {
  return {
    name: form.name.trim(),
    entity_type: form.entity_type,
    lifecycle_stage: form.lifecycle_stage,
    relationship_status: form.relationship_status || null,
    primary_contact_name: form.primary_contact_name?.trim()
      ? form.primary_contact_name.trim()
      : null,
    email: form.email?.trim() ? form.email.trim() : null,
    phone: form.phone?.trim() ? form.phone.trim() : null,
    document_number: form.document_number?.trim() ? form.document_number.trim() : null,
    estimated_value: form.estimated_value === '' ? 0 : Number(form.estimated_value),
    last_contact_at: parseDatetimeLocalValue(form.last_contact_at),
    next_action: form.next_action?.trim() ? form.next_action.trim() : null,
  };
}
