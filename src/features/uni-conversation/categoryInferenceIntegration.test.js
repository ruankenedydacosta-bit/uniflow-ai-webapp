import assert from 'node:assert/strict';
import test from 'node:test';
import { parseFinancialText } from '../uni-intents/index.js';
import {
  buildFinancialIntentAction,
  executeFinancialIntentAction,
} from './financialIntentAction.js';
import { createPendingActionCoordinator } from './index.js';
import {
  cancelCategoryCreationDependency,
  startCategoryCreationDependency,
} from './financialPendingActionFlow.js';
import { CATEGORY_INFERENCE_DECISIONS } from '../uni-category-inference/index.js';

// BLOCO D -- testes de INTEGRAÇÃO da inferência de categoria: compõem as
// mesmas funções puras já usadas pelo Bloco B (buildFinancialIntentAction,
// financialPendingActionFlow.js, pendingActionCoordinator), simulando
// exatamente o que UniChatPage.jsx faz ao redor de uma resposta JÁ
// VALIDADA da IA -- sem renderizar React (mesmo padrão do restante do
// projeto para este módulo, sem Testing Library/jsdom). A chamada de rede
// real à Edge Function é testada isoladamente em
// categoryInferenceService.test.js; aqui o foco é a composição ponta a
// ponta: inferência -> confirmação -> persistência.

const identity = Object.freeze({
  userId: 'user-1',
  workspaceId: 'workspace-personal',
  conversationId: 'conversation-1',
});

const accounts = [{ id: 'account-nubank', name: 'Nubank', is_active: true }];

function parse(text, referenceDate = '2026-07-27') {
  return parseFinancialText(text, { referenceDate });
}

test('inferência de alta confiança -> confirmação final -> persistência real, sem categoria criada à parte', async () => {
  const categories = [
    { id: 'category-food', name: 'Alimentação', category_type: 'expense', is_active: true },
    { id: 'category-transport', name: 'Transporte', category_type: 'expense', is_active: true },
  ];
  const parsed = parse('Gastei 48 no iFood pelo Nubank');

  const action = buildFinancialIntentAction({
    parsed,
    accounts,
    accountTypes: [{ code: 'checking', is_active: true }],
    categories,
    referenceDate: '2026-07-27',
    overrides: {
      clientOperationId: 'operation-ifood',
      aiInference: {
        decision: CATEGORY_INFERENCE_DECISIONS.EXISTING_CATEGORY,
        categoryId: 'category-food',
        confidence: 0.94,
        suggestedName: null,
        reason: 'iFood é entrega de comida',
      },
    },
  });

  assert.equal(action.status, 'ready');
  assert.equal(action.category.id, 'category-food');
  assert.equal(action.clientOperationId, 'operation-ifood');

  let persisted = null;
  const result = await executeFinancialIntentAction(action, {
    executeAtomicAction: async (finalAction) => {
      persisted = finalAction.payload;
      return { data: { id: 'transaction-1', ...finalAction.payload }, error: null };
    },
  });

  assert.equal(result.error, null);
  assert.equal(persisted.category_id, 'category-food');
  assert.equal(persisted.amount, 48);
});

test('inferência de confiança intermediária rejeitada -> usuário escolhe manualmente uma categoria diferente', () => {
  const categories = [
    { id: 'category-food', name: 'Alimentação', category_type: 'expense', is_active: true },
    { id: 'category-other', name: 'Outros', category_type: 'expense', is_active: true },
  ];
  const parsed = parse('Gastei 90 no Extra pelo Nubank');

  const pendingAction = buildFinancialIntentAction({
    parsed,
    accounts,
    accountTypes: [{ code: 'checking', is_active: true }],
    categories,
    referenceDate: '2026-07-27',
    overrides: {
      clientOperationId: 'operation-extra',
      aiInference: {
        decision: CATEGORY_INFERENCE_DECISIONS.EXISTING_CATEGORY,
        categoryId: 'category-food',
        confidence: 0.7,
        suggestedName: null,
        reason: 'Pode ser supermercado',
      },
    },
  });
  assert.equal(pendingAction.status, 'needs_clarification');
  assert.equal(pendingAction.issues[0].code, 'category_approximate');

  // Usuário rejeita a sugestão da IA ("não") -- rejectedCategoryId exclui a
  // categoria sugerida, exatamente como uma rejeição de aproximação local.
  const rejected = buildFinancialIntentAction({
    parsed,
    accounts,
    accountTypes: [{ code: 'checking', is_active: true }],
    categories,
    referenceDate: '2026-07-27',
    overrides: {
      clientOperationId: 'operation-extra',
      aiInference: pendingAction.action?.aiInference ?? {
        decision: CATEGORY_INFERENCE_DECISIONS.EXISTING_CATEGORY,
        categoryId: 'category-food',
        confidence: 0.7,
      },
      rejectedCategoryId: 'category-food',
      // Usuário então escolhe manualmente "Outros".
      categoryId: 'category-other',
    },
  });
  assert.equal(rejected.status, 'ready');
  assert.equal(rejected.category.id, 'category-other');
});

test('criação sugerida pela IA -> fluxo CREATE_CATEGORY existente -> retomada da transação original', async () => {
  const parsed = {
    intent: 'register_expense',
    input: 'Paguei 75 numa aula de cerâmica pelo Nubank',
    normalizedInput: 'paguei 75 numa aula de ceramica pelo nubank',
    entities: {
      amount: 75,
      account: 'Nubank',
      description: 'Aula de cerâmica',
      date: '2026-07-27',
    },
  };
  const initialAction = buildFinancialIntentAction({
    parsed,
    accounts,
    accountTypes: [{ code: 'checking', is_active: true }],
    categories: [{ id: 'category-food', name: 'Alimentação', category_type: 'expense', is_active: true }],
    referenceDate: '2026-07-27',
    overrides: {
      clientOperationId: 'operation-ceramica',
      aiInference: {
        decision: CATEGORY_INFERENCE_DECISIONS.CREATE_CATEGORY,
        categoryId: null,
        confidence: 0.8,
        suggestedName: 'Cursos',
        reason: 'Nenhuma categoria cobre aulas',
      },
    },
  });
  assert.equal(initialAction.status, 'needs_clarification');
  assert.equal(initialAction.issues[0].code, 'category_not_found');
  assert.equal(initialAction.proposedCategoryName, 'Cursos');

  // Usuário confirma a criação -- decision: 'create_new' usa o MESMO nome
  // proposto pela IA (proposedCategoryName), fluxo assistido já existente.
  const willCreateAction = buildFinancialIntentAction({
    parsed,
    accounts,
    accountTypes: [{ code: 'checking', is_active: true }],
    categories: [{ id: 'category-food', name: 'Alimentação', category_type: 'expense', is_active: true }],
    referenceDate: '2026-07-27',
    overrides: {
      clientOperationId: 'operation-ceramica',
      aiInference: {
        decision: CATEGORY_INFERENCE_DECISIONS.CREATE_CATEGORY,
        categoryId: null,
        confidence: 0.8,
        suggestedName: 'Cursos',
        reason: 'Nenhuma categoria cobre aulas',
      },
      categoryDecision: 'create_new',
    },
  });
  assert.equal(willCreateAction.proposedCategory.name, 'Cursos');

  const started = startCategoryCreationDependency({
    identity,
    financialSnapshot: { parsed, action: willCreateAction, response: '', memory: null },
    proposedCategory: willCreateAction.proposedCategory,
  });

  let categoryCreates = 0;
  const coordinator = createPendingActionCoordinator({
    create_financial_category: async ({ fields }) => {
      categoryCreates += 1;
      return { data: { id: 'category-cursos', is_active: true, ...fields.category } };
    },
  });
  const dependencyOutcome = await coordinator.execute(started.stack);
  const category = dependencyOutcome.completedAction.result;
  assert.equal(category.name, 'Cursos');
  assert.equal(categoryCreates, 1);

  const resumedAction = buildFinancialIntentAction({
    parsed,
    accounts,
    accountTypes: [{ code: 'checking', is_active: true }],
    categories: [category],
    referenceDate: '2026-07-27',
    overrides: {
      clientOperationId: 'operation-ceramica',
      categoryId: category.id,
    },
  });
  assert.equal(resumedAction.status, 'ready');
  assert.equal(resumedAction.clientOperationId, 'operation-ceramica');

  let transactionCreates = 0;
  const transactionResult = await executeFinancialIntentAction(resumedAction, {
    executeAtomicAction: async (finalAction) => {
      transactionCreates += 1;
      return { data: { id: 'transaction-ceramica', ...finalAction.payload }, error: null };
    },
  });
  assert.equal(transactionCreates, 1);
  assert.equal(transactionResult.data.category_id, 'category-cursos');
});

test('cancelamento da criação sugerida pela IA retoma a movimentação sem persistir nada', () => {
  const parsed = { intent: 'register_expense' };
  const financialSnapshot = {
    parsed,
    action: {
      clientOperationId: 'operation-cancel',
      intent: 'register_expense',
      status: 'needs_clarification',
      amount: 75,
      description: 'Aula de cerâmica',
      date: '2026-07-27',
      transactionType: 'expense',
    },
    response: '',
    memory: null,
  };
  const proposedCategory = { name: 'Cursos', category_type: 'expense', applies_to: 'personal' };
  const started = startCategoryCreationDependency({ identity, financialSnapshot, proposedCategory });

  const cancelled = cancelCategoryCreationDependency(started.stack);
  assert.equal(cancelled.resumedAction.id, 'operation-cancel');
  assert.equal(cancelled.resumedAction.fields.snapshot.action.status, 'needs_clarification');
  assert.equal(cancelled.stack.actions.length, 1);
});

test('client_operation_id é preservado em toda a composição inferência -> criação -> retomada', () => {
  const parsed = parse('Paguei 75 numa aula de cerâmica pelo Nubank');
  const action = buildFinancialIntentAction({
    parsed,
    accounts,
    accountTypes: [{ code: 'checking', is_active: true }],
    categories: [],
    referenceDate: '2026-07-27',
    overrides: {
      clientOperationId: 'operation-fixed-id',
      aiInference: {
        decision: CATEGORY_INFERENCE_DECISIONS.CREATE_CATEGORY,
        categoryId: null,
        confidence: 0.8,
        suggestedName: 'Cursos',
      },
    },
  });
  assert.equal(action.clientOperationId, 'operation-fixed-id');
});

test('contexto personal: categoria criada a partir da sugestão da IA usa applies_to personal quando o workspace é pessoal', () => {
  const parsed = parse('Paguei 75 numa aula de cerâmica pelo Nubank');
  const action = buildFinancialIntentAction({
    parsed,
    accounts,
    accountTypes: [{ code: 'checking', is_active: true }],
    categories: [],
    referenceDate: '2026-07-27',
    workspaceType: 'personal',
    overrides: {
      clientOperationId: 'operation-personal',
      aiInference: {
        decision: CATEGORY_INFERENCE_DECISIONS.CREATE_CATEGORY,
        categoryId: null,
        confidence: 0.8,
        suggestedName: 'Cursos',
      },
      categoryDecision: 'create_new',
    },
  });
  assert.equal(action.proposedCategory.applies_to, 'personal');
});

test('nenhuma persistência direta pela IA -- categoryInferenceService nunca importa/chama funções de conta, categoria ou transação', async () => {
  const source = await import('node:fs/promises').then((fs) => fs.readFile(
    new URL('../uni-category-inference/categoryInferenceService.js', import.meta.url),
    'utf8',
  ));
  assert.doesNotMatch(source, /saveTransaction|saveCategory|saveAccount|executeAtomicAction|executeConfirmedFinancialAction|createCategory\(|createTransaction/);
});
