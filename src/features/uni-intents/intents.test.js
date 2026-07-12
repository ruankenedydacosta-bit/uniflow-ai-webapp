import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createConversationContext,
  parseFinancialConversation,
  parseFinancialText,
} from './index.js';

function assertEntityShape(result) {
  assert.deepEqual(Object.keys(result.entities), [
    'amount',
    'category',
    'description',
    'account',
    'date',
  ]);
  assert.doesNotThrow(() => JSON.stringify(result));
}

test('interpreta pagamento de gasolina como despesa', () => {
  const result = parseFinancialText('paguei 80 reais de gasolina');

  assert.equal(result.intent, 'register_expense');
  assert.equal(result.entities.amount, 80);
  assert.equal(result.entities.category, 'Transporte');
  assert.equal(result.entities.description, 'Gasolina');
  assert.equal(result.ready, true);
  assert.equal(result.requiresConfirmation, true);
  assertEntityShape(result);
});

test('interpreta recebimento de salario como entrada', () => {
  const result = parseFinancialText('recebi 3000 de salário');

  assert.equal(result.intent, 'register_income');
  assert.equal(result.entities.amount, 3000);
  assert.equal(result.entities.category, 'Salário');
  assert.equal(result.entities.description, 'Salário');
  assert.equal(result.ready, true);
});

test('interpreta transferencia e extrai conta de destino', () => {
  const result = parseFinancialText('transferi 500 para o Nubank');

  assert.equal(result.intent, 'register_transfer');
  assert.equal(result.entities.amount, 500);
  assert.equal(result.entities.category, 'Transferência');
  assert.equal(result.entities.account, 'Nubank');
  assert.equal(result.entities.description, 'Transferência para Nubank');
  assert.equal(result.ready, true);
});

test('interpreta pergunta de capacidade de gasto como forecast', () => {
  const result = parseFinancialText('quanto posso gastar esse mês?');

  assert.equal(result.intent, 'forecast');
  assert.equal(result.requiresConfirmation, false);
  assert.equal(result.ready, true);
  assertEntityShape(result);
});

test('interpreta objetivo com valor abreviado e finalidade', () => {
  const result = parseFinancialText('quero juntar 20 mil para uma casa');

  assert.equal(result.intent, 'create_goal');
  assert.equal(result.entities.amount, 20000);
  assert.equal(result.entities.category, 'Moradia');
  assert.equal(result.entities.description, 'Casa');
  assert.equal(result.entities.account, null);
  assert.equal(result.ready, true);
});

test('distingue consulta de saldo de pergunta generica', () => {
  assert.equal(parseFinancialText('qual meu saldo?').intent, 'check_balance');
  assert.equal(
    parseFinancialText('por que organizar minhas finanças?').intent,
    'question',
  );
});

test('herda despesa e categoria em frase sequencial', () => {
  const first = parseFinancialText('Paguei 80 no mercado.');
  const second = parseFinancialText('Mais 30.', {
    context: first.nextContext,
  });

  assert.equal(first.intent, 'register_expense');
  assert.equal(first.entities.category, 'Alimentação');
  assert.equal(second.intent, 'register_expense');
  assert.equal(second.entities.amount, 30);
  assert.equal(second.entities.category, 'Alimentação');
  assert.equal(second.entities.description, 'Mercado');
  assert.equal(second.context.usedPreviousTurn, true);
  assert.deepEqual(second.context.inheritedEntities, [
    'category',
    'description',
  ]);
});

test('processa conversa inteira sem mutar contexto inicial', () => {
  const initialContext = createConversationContext();
  const snapshot = JSON.stringify(initialContext);
  const conversation = parseFinancialConversation(
    ['Paguei 80 no mercado.', 'Mais 30.'],
    { context: initialContext },
  );

  assert.equal(conversation.results.length, 2);
  assert.equal(conversation.results[1].entities.amount, 30);
  assert.equal(conversation.context.turns.length, 2);
  assert.equal(JSON.stringify(initialContext), snapshot);
});

test('entrada vazia retorna JSON seguro e nao pronto', () => {
  const result = parseFinancialText(null);

  assert.equal(result.intent, 'question');
  assert.equal(result.ready, false);
  assert.deepEqual(result.errors, ['EMPTY_INPUT']);
  assertEntityShape(result);
  assert.equal(parseFinancialText(undefined, null).ready, false);
  assert.deepEqual(parseFinancialConversation(null, null).results, []);
});

test('datas relativas dependem de referencia explicita', () => {
  const result = parseFinancialText('paguei 45 de mercado ontem', {
    referenceDate: '2026-07-11',
  });

  assert.equal(result.entities.date, '2026-07-10');
});
