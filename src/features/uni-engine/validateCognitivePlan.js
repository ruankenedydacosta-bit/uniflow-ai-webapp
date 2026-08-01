// Validador do plano cognitivo do Uni Engine (Fase 1).
//
// Verificação ESTRUTURAL do plano (puramente local — nunca consulta
// autorização no Supabase, nunca toca em RPCs).
import { UNI_ENGINE_THEORETICAL_EXECUTORS } from './uniEngineContracts.js';

const KNOWN_ACTION_PLAN_TYPES = new Set([
  'register_income',
  'register_expense',
  'register_transfer',
  'set_balance',
  'create_goal',
  'ambiguous_balance_or_income',
  'confirm_pending_action',
  'cancel_pending',
  'financial_query',
  'financial_statement',
  'small_talk',
  'unsupported',
  'unknown_pending',
]);

function isValidAmount(amount) {
  return Number.isFinite(Number(amount)) && Number(amount) > 0;
}

export function validateCognitivePlan(input, options = {}) {
  const safeInput = input && typeof input === 'object' ? input : {};
  const session = safeInput.session ?? {};
  const plan = options.plan ?? null;
  const classification = options.classification ?? null;
  const epistemic = options.epistemic ?? null;

  const errors = [];
  const warnings = [];
  const blockedReasons = [];
  let requiresClarification = false;

  if (!plan) {
    return {
      valid: false,
      errors: ['PLAN_MISSING'],
      warnings: [],
      blockedReasons: ['PLAN_MISSING'],
      requiresClarification: false,
    };
  }

  if (!session?.userId) {
    errors.push('USER_MISSING');
    blockedReasons.push('USER_MISSING');
  }

  if (!session?.workspaceId) {
    errors.push('WORKSPACE_MISSING');
    blockedReasons.push('WORKSPACE_MISSING');
  }

  if (!KNOWN_ACTION_PLAN_TYPES.has(plan.planType)) {
    errors.push(`UNKNOWN_PLAN_TYPE_${String(plan.planType).toUpperCase()}`);
    blockedReasons.push('UNKNOWN_PLAN_TYPE');
  }

  const isFinancialAction =
    plan.planType === 'register_income'
    || plan.planType === 'register_expense'
    || plan.planType === 'register_transfer'
    || plan.planType === 'set_balance'
    || plan.planType === 'create_goal';

  if (isFinancialAction) {
    const amount = epistemic?.amount?.value;
    if (amount == null || !isValidAmount(amount)) {
      errors.push('AMOUNT_INVALID');
      requiresClarification = true;
    }
  }

  if (plan.missingFields?.length > 0) {
    requiresClarification = true;
    plan.missingFields.forEach((field) => {
      if (field === 'account') {
        warnings.push('ACCOUNT_MISSING');
      }
      if (field === 'destinationAccount') {
        warnings.push('DESTINATION_ACCOUNT_MISSING');
      }
      if (field === 'category') {
        warnings.push('CATEGORY_MISSING');
      }
      if (field === 'amount') {
        warnings.push('AMOUNT_MISSING');
      }
      if (field === 'intent') {
        warnings.push('INTENT_AMBIGUOUS');
      }
    });
  }

  if (epistemic?.account?.status === 'ambiguous') {
    errors.push('ACCOUNT_AMBIGUOUS');
    requiresClarification = true;
  }

  if (epistemic?.account?.status === 'conflicting') {
    errors.push('ACCOUNT_CONFLICT');
    blockedReasons.push('ACCOUNT_CONFLICT');
    requiresClarification = true;
  }

  if (epistemic?.category?.status === 'missing' && plan.planType === 'register_expense') {
    warnings.push('CATEGORY_REQUIRED_FOR_EXPENSE');
  }

  const pendingIntent = options.analyzed?.compatibility?.pendingIntent ?? null;
  if (
    pendingIntent
    && classification?.messageType === 'action'
    && pendingIntent !== classification.primaryIntent
  ) {
    warnings.push('INTENT_VS_PENDING_CONFLICT');
  }

  if (plan.requiresConfirmation) {
    warnings.push('CONFIRMATION_REQUIRED');
  }

  const executorAllowed = UNI_ENGINE_THEORETICAL_EXECUTORS.includes(plan.theoreticalExecutor);
  if (!executorAllowed) {
    errors.push('EXECUTOR_NOT_ALLOWED');
    blockedReasons.push('EXECUTOR_NOT_ALLOWED');
  }

  const decision = plan.decision;
  if (
    decision === 'execute'
    && plan.planType !== 'financial_query'
    && !plan.requiresConfirmation
  ) {
    errors.push('EXECUTION_WITHOUT_CONFIRMATION');
    blockedReasons.push('EXECUTION_WITHOUT_CONFIRMATION');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    blockedReasons,
    requiresClarification,
  };
}
