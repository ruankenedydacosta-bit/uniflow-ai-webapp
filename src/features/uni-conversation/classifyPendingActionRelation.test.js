// BUG 2 (Sprint 4, Bloco 4.0): testes comportamentais do classificador
// central de relação pending-action/mensagem-nova. Reproduz o defeito real
// relatado ("Estou gastando demais?" sendo tratada como nome de conta) e
// confirma que frases inequívocas continuam rápidas.
import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyPendingActionRelation, PENDING_ACTION_RELATIONS } from './classifyPendingActionRelation.js';

const ACCOUNTS = [
  { id: 'acc-nubank', name: 'Nubank', is_active: true },
  { id: 'acc-itau', name: 'Itaú', is_active: true },
];
const CATEGORIES = [
  { id: 'cat-food', name: 'Alimentação', is_active: true },
];

function pendingAccount() {
  return { field: 'account', issues: [{ field: 'account' }] };
}
function pendingCategory() {
  return { field: 'category', issues: [{ field: 'category' }] };
}
function pendingDate() {
  return { field: 'date', issues: [{ field: 'date' }] };
}

test('BUG 2: reprodução exata do defeito -- "Estou gastando demais?" durante pendência de conta muda de assunto, nunca vira nome de conta', () => {
  const result = classifyPendingActionRelation({
    pendingAction: pendingAccount(),
    userText: 'Estou gastando demais?',
    availableAccounts: ACCOUNTS,
    availableCategories: CATEGORIES,
  });
  assert.equal(result.relation, PENDING_ACTION_RELATIONS.CHANGES_SUBJECT);
  assert.notEqual(result.normalizedInput, 'Estou gastando demais?');
});

test('"Nubank" responde à pendência de conta', () => {
  const result = classifyPendingActionRelation({
    pendingAction: pendingAccount(),
    userText: 'Nubank',
    availableAccounts: ACCOUNTS,
  });
  assert.equal(result.relation, PENDING_ACTION_RELATIONS.ANSWERS_PENDING);
  assert.equal(result.normalizedInput, 'Nubank');
});

test('"Foi no Nubank" responde à pendência de conta (match por substring, mesmo padrão já usado em pendingActionInput.js)', () => {
  const result = classifyPendingActionRelation({
    pendingAction: pendingAccount(),
    userText: 'Foi no Nubank',
    availableAccounts: ACCOUNTS,
  });
  assert.equal(result.relation, PENDING_ACTION_RELATIONS.ANSWERS_PENDING);
  assert.equal(result.normalizedInput, 'Nubank');
});

test('"Alimentação" responde à pendência de categoria', () => {
  const result = classifyPendingActionRelation({
    pendingAction: pendingCategory(),
    userText: 'Alimentação',
    availableCategories: CATEGORIES,
  });
  assert.equal(result.relation, PENDING_ACTION_RELATIONS.ANSWERS_PENDING);
  assert.equal(result.normalizedInput, 'Alimentação');
});

test('"Foi ontem" responde à pendência de data', () => {
  const result = classifyPendingActionRelation({
    pendingAction: pendingDate(),
    userText: 'Foi ontem',
    conversationContext: { referenceDate: '2026-08-05' },
  });
  assert.equal(result.relation, PENDING_ACTION_RELATIONS.ANSWERS_PENDING);
  assert.equal(result.normalizedInput, '2026-08-04');
  assert.equal(result.reason, 'matches_date_expression');
});

test('"Cancelar" é classificado como resposta à pendência (o caller decide cancelar, esta função só sinaliza a relação)', () => {
  const result = classifyPendingActionRelation({
    pendingAction: pendingAccount(),
    userText: 'Cancelar',
    availableAccounts: ACCOUNTS,
  });
  assert.equal(result.relation, PENDING_ACTION_RELATIONS.ANSWERS_PENDING);
  assert.equal(result.reason, 'reply_cancel');
});

test('"Confirmar" é classificado como resposta à pendência', () => {
  const result = classifyPendingActionRelation({
    pendingAction: pendingAccount(),
    userText: 'Confirmar',
  });
  assert.equal(result.relation, PENDING_ACTION_RELATIONS.ANSWERS_PENDING);
  assert.equal(result.reason, 'reply_confirm');
});

test('"Quanto tenho de saldo?" muda de assunto', () => {
  const result = classifyPendingActionRelation({
    pendingAction: pendingAccount(),
    userText: 'Quanto tenho de saldo?',
    availableAccounts: ACCOUNTS,
  });
  assert.equal(result.relation, PENDING_ACTION_RELATIONS.CHANGES_SUBJECT);
});

test('"Quem foi Einstein?" muda de assunto', () => {
  const result = classifyPendingActionRelation({
    pendingAction: pendingAccount(),
    userText: 'Quem foi Einstein?',
    availableAccounts: ACCOUNTS,
  });
  assert.equal(result.relation, PENDING_ACTION_RELATIONS.CHANGES_SUBJECT);
});

test('"Nessa conta" sem contexto suficiente é ambíguo (depende de memória, que roda antes deste classificador)', () => {
  const result = classifyPendingActionRelation({
    pendingAction: pendingAccount(),
    userText: 'Nessa conta',
    availableAccounts: ACCOUNTS,
  });
  assert.equal(result.relation, PENDING_ACTION_RELATIONS.AMBIGUOUS);
  assert.ok(result.suggestedClarification);
});

test('"Pode ser essa" é ambíguo sem contexto suficiente', () => {
  const result = classifyPendingActionRelation({
    pendingAction: pendingAccount(),
    userText: 'Pode ser essa',
    availableAccounts: ACCOUNTS,
  });
  assert.equal(result.relation, PENDING_ACTION_RELATIONS.AMBIGUOUS);
});

test('baixa confiança (ambíguo) sempre vem com suggestedClarification preenchida', () => {
  const result = classifyPendingActionRelation({
    pendingAction: pendingAccount(),
    userText: 'talvez',
    availableAccounts: ACCOUNTS,
  });
  assert.equal(result.relation, PENDING_ACTION_RELATIONS.AMBIGUOUS);
  assert.equal(typeof result.suggestedClarification, 'string');
  assert.ok(result.suggestedClarification.length > 0);
});

test('entrada vazia nunca lança e é tratada como ambígua, nunca como resposta', () => {
  const result = classifyPendingActionRelation({
    pendingAction: pendingAccount(),
    userText: '   ',
    availableAccounts: ACCOUNTS,
  });
  assert.equal(result.relation, PENDING_ACTION_RELATIONS.AMBIGUOUS);
});

test('nenhuma escrita é realizada por esta função -- ela só classifica (contrato: retorno sempre um objeto puro, nunca um efeito colateral)', () => {
  const before = JSON.stringify(ACCOUNTS);
  classifyPendingActionRelation({ pendingAction: pendingAccount(), userText: 'Nubank', availableAccounts: ACCOUNTS });
  assert.equal(JSON.stringify(ACCOUNTS), before);
});

test('pendência de conta com texto que também termina em "?" mas bate em conta real prioriza a resposta sobre a heurística de pergunta', () => {
  const result = classifyPendingActionRelation({
    pendingAction: pendingAccount(),
    userText: 'Foi no Nubank?',
    availableAccounts: ACCOUNTS,
  });
  assert.equal(result.relation, PENDING_ACTION_RELATIONS.ANSWERS_PENDING);
});

test('sem pendingAction.field (formato desconhecido) nunca lança -- cai em ambiguous/changes_subject com segurança', () => {
  const result = classifyPendingActionRelation({
    pendingAction: {},
    userText: 'Estou gastando demais?',
    availableAccounts: ACCOUNTS,
  });
  assert.equal(result.relation, PENDING_ACTION_RELATIONS.CHANGES_SUBJECT);
});

test('conta arquivada nunca é oferecida como match válido de resposta', () => {
  const result = classifyPendingActionRelation({
    pendingAction: pendingAccount(),
    userText: 'Conta Antiga',
    availableAccounts: [{ id: 'acc-old', name: 'Conta Antiga', is_active: false }],
  });
  assert.equal(result.relation, PENDING_ACTION_RELATIONS.AMBIGUOUS);
});
