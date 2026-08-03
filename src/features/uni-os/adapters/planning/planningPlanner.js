import { classifyAttention } from '../../attention/index.js';

const DESCRIPTIONS = Object.freeze({
  identify_account: 'Identificar a conta necessária no contexto disponível.',
  identify_category: 'Identificar a categoria necessária no contexto disponível.',
  identify_amount: 'Identificar o valor estruturado necessário.',
  identify_date: 'Identificar a data estruturada necessária.',
  ask_confirmation: 'Solicitar confirmação explícita antes de qualquer ação futura.',
  create_account_candidate: 'Representar uma possível conta para confirmação futura.',
  reuse_account: 'Representar o uso de uma conta já conhecida e válida.',
  reactivate_account_candidate: 'Representar uma possível reativação para confirmação futura.',
  persist_transaction: 'Representar uma persistência futura após confirmação e permissões.',
  respond_question: 'Organizar os fatos necessários para responder à pergunta.',
  inform_user: 'Preparar uma orientação clara sem executar alterações.',
});

function step(type) {
  return { type, description: DESCRIPTIONS[type], status: 'planned' };
}

function normalizedNames(values) {
  if (!Array.isArray(values)) return new Set();
  return new Set(values.map((value) => value?.normalized).filter(Boolean));
}

function resolveAccountStep(parsedIntent, memorySnapshot) {
  const requestedAccounts = normalizedNames(parsedIntent?.entities?.accounts);
  if (!requestedAccounts.size) return 'identify_account';
  const rememberedAccounts = normalizedNames(
    memorySnapshot?.financial?.accounts?.map((entry) => entry?.account),
  );
  return [...requestedAccounts].some((name) => rememberedAccounts.has(name))
    ? 'reuse_account'
    : 'create_account_candidate';
}

function financialActionSteps(parsedIntent, memorySnapshot) {
  const intent = parsedIntent?.intent;
  if (intent === 'create_goal') {
    return [step('identify_amount'), step('identify_date'), step('ask_confirmation'), step('inform_user')];
  }
  const steps = [step(resolveAccountStep(parsedIntent, memorySnapshot))];
  if (intent !== 'register_transfer') steps.push(step('identify_category'));
  steps.push(step('identify_amount'), step('identify_date'), step('ask_confirmation'));
  if (['register_income', 'register_expense', 'register_transfer'].includes(intent)) {
    steps.push(step('persist_transaction'));
  }
  return steps;
}

const PLAN_BUILDERS = Object.freeze({
  financial_question: () => [step('respond_question'), step('inform_user')],
  casual: () => [step('inform_user')],
  explanation: () => [step('respond_question'), step('inform_user')],
  planning: () => [step('respond_question'), step('inform_user')],
  configuration: () => [step('ask_confirmation'), step('inform_user')],
  emergency: () => [step('inform_user')],
});

export function buildPlanningSteps({ parsedIntent, memorySnapshot } = {}) {
  const attentionType = classifyAttention(parsedIntent);
  if (attentionType === 'financial_action') {
    return financialActionSteps(parsedIntent, memorySnapshot);
  }
  return (PLAN_BUILDERS[attentionType] ?? PLAN_BUILDERS.explanation)();
}

export function resolvePlanningConfirmation(parsedIntent = {}) {
  const attentionType = classifyAttention(parsedIntent);
  return parsedIntent.requiresConfirmation === true
    || attentionType === 'financial_action'
    || attentionType === 'configuration';
}
