import { isValidIsoDate } from '../uni-intents/index.js';
import {
  FINANCIAL_OPERATION_TYPES,
  FINANCIAL_PLAN_DECISIONS,
  FINANCIAL_PLAN_VERSION,
  INSTALLMENT_ROUNDING_TOLERANCE,
  KNOWN_MISSING_FIELD_NAMES,
  MAX_ACCOUNT_REFERENCE_CHARS,
  MAX_CLARIFICATION_CHARS,
  MAX_OPERATIONS_PER_PLAN,
  MAX_OPERATION_DESCRIPTION_CHARS,
  MAX_REASON_CHARS,
  RECURRENCE_FREQUENCIES,
} from './financialPlanConfig.js';

// BLOCO E: contrato estruturado estrito do plano financeiro retornado pela
// camada neural (modo financial_plan). A IA NUNCA persiste, nunca chama
// RPC, nunca escolhe conta/categoria por ID -- ela apenas propoe um plano,
// validado aqui campo a campo antes de alimentar os resolutores
// deterministicos ja existentes (resolveFinancialAccount/
// resolveFinancialCategory). Qualquer coisa fora do contrato invalida a
// resposta inteira -- fallback seguro, nunca quebra o fluxo manual.

const VALID_DECISIONS = new Set(Object.values(FINANCIAL_PLAN_DECISIONS));
const VALID_OPERATION_TYPES = new Set(Object.values(FINANCIAL_OPERATION_TYPES));
const VALID_FREQUENCIES = new Set(RECURRENCE_FREQUENCIES);
const KNOWN_MISSING_FIELDS = new Set(KNOWN_MISSING_FIELD_NAMES);

function clampText(value, max) {
  if (typeof value !== 'string') return null;
  const withoutControlCharacters = [...value]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127 ? ' ' : character;
    })
    .join('');
  const cleaned = withoutControlCharacters.replace(/\s+/g, ' ').trim();
  const limited = Number.isFinite(max) && max > 0 ? cleaned.slice(0, max) : cleaned;
  return limited || null;
}

function isFiniteNumber(value) {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function isConfidence(value) {
  const number = isFiniteNumber(value);
  return number !== null && number >= 0 && number <= 1 ? number : null;
}

function invalid(reason) {
  return Object.freeze({ valid: false, reason, plan: null });
}

function validateInstallments(raw) {
  if (raw === null || raw === undefined) return { valid: true, installments: null };
  if (typeof raw !== 'object' || Array.isArray(raw)) return { valid: false };

  const count = Number.isInteger(raw.count) ? raw.count : Number(raw.count);
  const installmentAmount = isFiniteNumber(raw.installment_amount);
  const totalAmount = isFiniteNumber(raw.total_amount);

  if (!Number.isInteger(count) || count <= 0) return { valid: false };
  if (installmentAmount === null || installmentAmount <= 0) return { valid: false };
  if (totalAmount === null || totalAmount <= 0) return { valid: false };

  const expectedTotal = count * installmentAmount;
  if (Math.abs(expectedTotal - totalAmount) > INSTALLMENT_ROUNDING_TOLERANCE * count) {
    return { valid: false };
  }

  return {
    valid: true,
    installments: Object.freeze({
      count,
      installmentAmount: Number(installmentAmount.toFixed(2)),
      totalAmount: Number(totalAmount.toFixed(2)),
    }),
  };
}

function validateRecurrence(raw) {
  if (raw === null || raw === undefined) return { valid: true, recurrence: null };
  if (typeof raw !== 'object' || Array.isArray(raw)) return { valid: false };

  const frequency = raw.frequency;
  if (typeof frequency !== 'string' || !VALID_FREQUENCIES.has(frequency)) return { valid: false };

  const interval = Number.isInteger(raw.interval) ? raw.interval : Number(raw.interval ?? 1);
  if (!Number.isInteger(interval) || interval <= 0) return { valid: false };

  let dayOfMonth = null;
  if (raw.day_of_month !== null && raw.day_of_month !== undefined) {
    const day = Number.isInteger(raw.day_of_month) ? raw.day_of_month : Number(raw.day_of_month);
    if (!Number.isInteger(day) || day < 1 || day > 31) return { valid: false };
    dayOfMonth = day;
  }

  let startDate = null;
  if (raw.start_date !== null && raw.start_date !== undefined) {
    if (!isValidIsoDate(raw.start_date)) return { valid: false };
    startDate = raw.start_date;
  }
  let endDate = null;
  if (raw.end_date !== null && raw.end_date !== undefined) {
    if (!isValidIsoDate(raw.end_date)) return { valid: false };
    endDate = raw.end_date;
  }

  return {
    valid: true,
    recurrence: Object.freeze({
      frequency, interval, dayOfMonth, startDate, endDate,
    }),
  };
}

function validateOperation(raw, seenTemporaryIds) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const temporaryId = clampText(raw.temporary_id, 40);
  if (!temporaryId || seenTemporaryIds.has(temporaryId)) return null;

  const operationType = raw.operation_type;
  if (typeof operationType !== 'string' || !VALID_OPERATION_TYPES.has(operationType)) return null;

  const amount = isFiniteNumber(raw.amount);
  if (amount === null || amount <= 0) return null;

  // Moeda -- so BRL e aceito neste escopo (nenhuma outra moeda suportada
  // pelo app ainda).
  if (raw.currency !== undefined && raw.currency !== null && raw.currency !== 'BRL') return null;

  const confidence = isConfidence(raw.confidence);
  if (confidence === null) return null;

  const description = clampText(raw.description, MAX_OPERATION_DESCRIPTION_CHARS);
  const dateExpression = clampText(raw.date_expression, 60);
  const sourceAccountReference = clampText(raw.source_account_reference, MAX_ACCOUNT_REFERENCE_CHARS);
  const destinationAccountReference = clampText(raw.destination_account_reference, MAX_ACCOUNT_REFERENCE_CHARS);
  const categoryReference = clampText(raw.category_reference, MAX_ACCOUNT_REFERENCE_CHARS);

  // Transferencia exige origem E destino textualmente distintos -- nunca
  // suposicao. Se a IA nao tiver certeza, o correto e devolver
  // clarification_required no nivel do plano, nao uma operacao invalida.
  if (operationType === FINANCIAL_OPERATION_TYPES.TRANSFER) {
    if (!sourceAccountReference || !destinationAccountReference) return null;
    if (sourceAccountReference.trim().toLowerCase() === destinationAccountReference.trim().toLowerCase()) {
      return null;
    }
  }

  const installmentsResult = operationType === FINANCIAL_OPERATION_TYPES.INSTALLMENT_PURCHASE
    ? validateInstallments(raw.installments)
    : { valid: true, installments: null };
  if (!installmentsResult.valid) return null;
  if (operationType === FINANCIAL_OPERATION_TYPES.INSTALLMENT_PURCHASE && !installmentsResult.installments) {
    return null;
  }

  const isRecurring = operationType === FINANCIAL_OPERATION_TYPES.RECURRING_EXPENSE
    || operationType === FINANCIAL_OPERATION_TYPES.RECURRING_INCOME;
  const recurrenceResult = isRecurring ? validateRecurrence(raw.recurrence) : { valid: true, recurrence: null };
  if (!recurrenceResult.valid) return null;
  if (isRecurring && !recurrenceResult.recurrence) return null;

  const missingFields = Array.isArray(raw.missing_fields)
    ? raw.missing_fields.filter((field) => typeof field === 'string' && KNOWN_MISSING_FIELDS.has(field))
    : [];

  const reason = clampText(raw.reason, MAX_REASON_CHARS) ?? '';

  seenTemporaryIds.add(temporaryId);

  return Object.freeze({
    temporaryId,
    operationType,
    amount: Number(amount.toFixed(2)),
    currency: 'BRL',
    description,
    dateExpression,
    sourceAccountReference,
    destinationAccountReference,
    categoryReference,
    installments: installmentsResult.installments,
    recurrence: recurrenceResult.recurrence,
    confidence,
    missingFields: Object.freeze(missingFields),
    reason,
  });
}

export function validateFinancialPlanResponse(raw) {
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return invalid('invalid_json');
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return invalid('invalid_json');
  }

  if (parsed.version !== FINANCIAL_PLAN_VERSION) {
    return invalid('invalid_version');
  }

  const decision = parsed.decision;
  if (typeof decision !== 'string' || !VALID_DECISIONS.has(decision)) {
    return invalid('invalid_decision');
  }

  const globalConfidence = isConfidence(parsed.global_confidence);
  if (globalConfidence === null) {
    return invalid('invalid_confidence');
  }

  const rawOperations = Array.isArray(parsed.operations) ? parsed.operations : [];
  if (rawOperations.length > MAX_OPERATIONS_PER_PLAN) {
    return invalid('too_many_operations');
  }

  const requiresOperations = decision === FINANCIAL_PLAN_DECISIONS.SINGLE_OPERATION
    || decision === FINANCIAL_PLAN_DECISIONS.MULTIPLE_OPERATIONS;
  if (requiresOperations && rawOperations.length === 0) {
    return invalid('missing_operations');
  }
  if (decision === FINANCIAL_PLAN_DECISIONS.SINGLE_OPERATION && rawOperations.length !== 1) {
    return invalid('single_operation_count_mismatch');
  }

  const seenTemporaryIds = new Set();
  const operations = [];
  for (const rawOperation of rawOperations) {
    const operation = validateOperation(rawOperation, seenTemporaryIds);
    if (!operation) return invalid('invalid_operation');
    operations.push(operation);
  }

  const clarificationQuestion = clampText(parsed.clarification_question, MAX_CLARIFICATION_CHARS);
  if (decision === FINANCIAL_PLAN_DECISIONS.CLARIFICATION_REQUIRED && !clarificationQuestion) {
    return invalid('missing_clarification_question');
  }

  return Object.freeze({
    valid: true,
    reason: null,
    plan: Object.freeze({
      version: FINANCIAL_PLAN_VERSION,
      decision,
      operations: Object.freeze(operations),
      clarificationQuestion,
      globalConfidence,
    }),
  });
}
