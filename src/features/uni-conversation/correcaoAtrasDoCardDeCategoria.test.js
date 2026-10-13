// Fluxo de verdade (hook real em react-test-renderer, sem regex no código) do
// que UniChatPage faz quando a pessoa corrige o lançamento que espera atrás do
// card "Criar categoria para continuar": cancela a dependência, restaura o
// rascunho suspenso e reaplica a correção (correctDraftBehindCategoryCreation).
//
// BUG REAL (voz): "Registre hoje um salário de 2500" virava despesa e a
// correção "Salário não é despesa, salário é uma receita" caía no aviso
// "confirme a criação da categoria", com o card igual na tela.
import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { act, create } from 'react-test-renderer';
import {
  cancelCategoryCreationDependency,
  startCategoryCreationDependency,
} from './financialPendingActionFlow.js';
import { getActivePendingAction } from './pendingActionStack.js';
import { resolvePendingActionInput } from './pendingActionInput.js';
import { useUniConversation } from './useUniConversation.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const REFERENCE_DATE = '2026-10-08';
const IDENTITY = { userId: 'user-1', workspaceId: 'workspace-1', conversationId: 'conversation-1' };
const ACCOUNTS = [{ id: 'account-nubank', name: 'Nubank', institution_name: 'Nubank', is_active: true }];
const CATEGORIES = [
  { id: 'category-food', name: 'Alimentação', category_type: 'expense', is_active: true },
  { id: 'category-income', name: 'Salário', category_type: 'income', is_active: true },
];

function mountConversation(categories = CATEGORIES) {
  let current;
  function Harness() {
    current = useUniConversation({
      accounts: ACCOUNTS,
      categories,
      referenceDate: REFERENCE_DATE,
    });
    return null;
  }
  act(() => { create(React.createElement(Harness)); });
  return {
    get hook() { return current; },
    run(callback) {
      let output;
      act(() => { output = callback(current); });
      return output;
    },
  };
}

// O que openCategoryCreationDependency faz ao receber category_not_found.
function openCategoryCreationCard(proposal, now = '2026-10-08T12:00:00.000Z') {
  const { action } = proposal;
  return startCategoryCreationDependency({
    stack: null,
    identity: IDENTITY,
    financialSnapshot: { parsed: proposal.parsed, action, response: proposal.response?.text ?? '' },
    proposedCategory: {
      name: action.proposedCategoryName,
      category_type: action.transactionType,
      applies_to: 'personal',
    },
    now,
  }).stack;
}

// O que correctDraftBehindCategoryCreation faz com a frase da pessoa.
function correctBehindCard(conversation, stack, text) {
  const parentSnapshot = stack.actions.find((item) => item.type === 'financial_transaction').fields.snapshot;
  const resolved = resolvePendingActionInput({
    value: text,
    action: parentSnapshot.action,
    accounts: ACCOUNTS,
    categories: conversation.categories ?? CATEGORIES,
    referenceDate: REFERENCE_DATE,
  });
  if (resolved.kind !== 'correction') return { resolved };

  const proposedCategoryName = getActivePendingAction(stack)?.fields?.category?.name ?? null;
  const transition = cancelCategoryCreationDependency(stack);
  assert.equal(transition.changed, true);
  const snapshot = transition.resumedAction.fields.snapshot;
  const result = conversation.run((hook) => {
    hook.restore(snapshot);
    return hook.provideInput(
      { ...resolved.overrides, ...(proposedCategoryName ? { categoryName: proposedCategoryName } : {}) },
      snapshot.parsed,
    );
  });
  return { resolved, result, transition };
}

// Frase que o classificador ainda lê como despesa, para exercitar a troca.
const EXPENSE_PHRASE = 'Gastei 2500 de salário';

// #80: a palavra "salário" não propõe categoria. O card de criação aparece
// quando a categoria é pedida pelo nome ("na categoria Salário") e só existe
// como entrada.
function proposeSalaryCategory(conversation) {
  const { parsed } = conversation.run((hook) => hook.interpret(EXPENSE_PHRASE));
  const proposal = conversation.run((hook) => hook.provideInput({ categoryName: 'Salário' }));
  return { ...proposal, parsed };
}

test('correção de tipo atrás do card: o lançamento volta como receita pronta, sem categoria para criar', () => {
  const conversation = mountConversation();
  const proposal = proposeSalaryCategory(conversation);
  assert.equal(proposal.action.issues[0].code, 'category_not_found');
  assert.equal(proposal.action.proposedCategoryName, 'Salário');
  assert.equal(proposal.action.transactionType, 'expense');

  const stack = openCategoryCreationCard(proposal);
  assert.equal(getActivePendingAction(stack).type, 'create_financial_category');

  const { resolved, result } = correctBehindCard(
    conversation,
    stack,
    'Salário não é despesa, salário é uma receita.',
  );
  assert.equal(resolved.kind, 'correction');
  assert.equal(result.action.status, 'ready');
  assert.equal(result.action.transactionType, 'income');
  assert.equal(result.action.category.id, 'category-income');
  assert.equal(result.action.amount, 2500);
  assert.equal(result.action.payload.transaction_type, 'income');
  assert.equal(conversation.hook.state.action.transactionType, 'income');
});

test('o id de categoria do tipo antigo não sobrevive à troca de tipo', () => {
  const conversation = mountConversation();
  // Despesa que já tinha categoria de saída guardada nos overrides do hook.
  const proposal = conversation.run((hook) => hook.interpret('Gastei 80 no mercado'));
  assert.equal(proposal.action.issues[0].code, 'category_required');
  conversation.run((hook) => hook.provideInput({ categoryId: 'category-food' }));

  const draft = conversation.hook.state.action;
  const resolved = resolvePendingActionInput({
    value: 'É receita',
    action: draft,
    accounts: ACCOUNTS,
    categories: CATEGORIES,
    referenceDate: REFERENCE_DATE,
  });
  assert.equal(resolved.overrides.transactionType, 'income');

  const result = conversation.run((hook) => hook.provideInput(resolved.overrides));
  // Sem apagar o categoryId antigo, aqui sairia "categoria incompatível".
  assert.notEqual(result.action.issues[0]?.code, 'category_incompatible');
  assert.equal(result.action.transactionType, 'income');
});

test('correção de valor atrás do card mantém a categoria proposta por quem falou', () => {
  const conversation = mountConversation();
  const proposal = conversation.run((hook) => hook.interpret('Gastei 80 no mercado'));
  assert.equal(proposal.action.issues[0].code, 'category_required');

  // A pessoa pediu "Pets"; o card propõe Pets, que o parser não deduziria.
  const withPets = {
    ...proposal,
    action: { ...proposal.action, proposedCategoryName: 'Pets' },
  };
  const stack = openCategoryCreationCard(withPets);
  assert.equal(getActivePendingAction(stack).fields.category.name, 'Pets');

  const { resolved, result } = correctBehindCard(conversation, stack, 'Na verdade foram 120 reais');
  assert.equal(resolved.overrides.amount, 120);
  // A categoria Pets continua faltando, com o mesmo nome, e o valor novo.
  assert.equal(result.action.amount, 120);
  assert.equal(result.action.issues[0].code, 'category_not_found');
  assert.equal(result.action.proposedCategoryName, 'Pets');
});

test('frase que não é correção clara deixa o card como está', () => {
  const conversation = mountConversation();
  const proposal = proposeSalaryCategory(conversation);
  const stack = openCategoryCreationCard(proposal);

  for (const phrase of ['Hum, não sei', 'Qual categoria você usou?', 'A categoria é Receita']) {
    const { resolved } = correctBehindCard(conversation, stack, phrase);
    assert.notEqual(resolved.kind, 'correction', phrase);
  }
});

test('retomar um rascunho que já virou receita não volta ao tipo da frase original', () => {
  const conversation = mountConversation();
  const proposal = conversation.run((hook) => hook.interpret(EXPENSE_PHRASE));
  const corrected = conversation.run((hook) => hook.provideInput({ transactionType: 'income' }));
  assert.equal(corrected.action.transactionType, 'income');

  // Ao retomar depois de criar uma categoria (ou ao recarregar), o hook recomeça
  // dos overrides do snapshot: o tipo precisa estar entre eles.
  const snapshot = { parsed: proposal.parsed, action: corrected.action, response: 'ok' };
  conversation.run((hook) => hook.reset());
  assert.equal(conversation.run((hook) => hook.restore(snapshot)), true);
  const resumed = conversation.run(
    (hook) => hook.provideInput({ description: 'Salário de outubro' }, proposal.parsed),
  );
  assert.equal(resumed.action.transactionType, 'income');
  assert.equal(resumed.action.description, 'Salário de outubro');
});
