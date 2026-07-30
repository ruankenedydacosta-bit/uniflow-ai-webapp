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

test('interpreta valores monetários em português por extenso', () => {
  assert.equal(parseFinancialText('Gastei cinquenta reais no almoço').entities.amount, 50);
  assert.equal(parseFinancialText('Gastei cento e vinte reais no almoço').entities.amount, 120);
  assert.equal(parseFinancialText('Gastei mil reais no almoço').entities.amount, 1000);
  assert.equal(
    parseFinancialText('Gastei cinquenta reais e noventa centavos no almoço').entities.amount,
    50.9,
  );
});

test('mantém formatos monetários numéricos e rejeita valores negativos ou ambíguos', () => {
  assert.equal(parseFinancialText('Gastei R$ 50 no almoço').entities.amount, 50);
  assert.equal(parseFinancialText('Gastei 50 reais no almoço').entities.amount, 50);
  assert.equal(parseFinancialText('Gastei 50,90 no almoço').entities.amount, 50.9);
  assert.equal(parseFinancialText('Gastei -50 reais no almoço').entities.amount, null);
  assert.equal(parseFinancialText('Gastei menos cinquenta reais no almoço').entities.amount, null);
  assert.equal(parseFinancialText('Gastei cinquenta ou sessenta reais no almoço').entities.amount, null);
});

test('interpreta recebimento de salario como entrada', () => {
  const result = parseFinancialText('recebi 3000 de salário');

  assert.equal(result.intent, 'register_income');
  assert.equal(result.entities.amount, 3000);
  assert.equal(result.entities.category, 'Salário');
  assert.equal(result.entities.description, 'Salário');
  assert.equal(result.ready, true);
});

// BUG REAL EM PRODUÇÃO: "Coloquei duzentos reais de gasolina." caía em
// intent 'question' (nenhum verbo reconhecido), o que fazia a frase inteira
// cair no chat geral em vez do fluxo transacional. "coloquei/botei" foram
// adicionados às regras de register_expense.
test('BUG REAL: "Coloquei duzentos reais de gasolina." é reconhecida como despesa (tipo, valor, descrição e categoria corretos)', () => {
  const result = parseFinancialText('Coloquei duzentos reais de gasolina.');

  assert.equal(result.intent, 'register_expense');
  assert.equal(result.entities.amount, 200);
  assert.equal(result.entities.description, 'Gasolina');
  assert.equal(result.entities.category, 'Transporte');
  assert.equal(result.entities.account, null);
  assert.equal(result.ready, true);
  assert.equal(result.requiresConfirmation, true);
});

// ============================================================================
// BUG REAL (fluxo de confirmação financeira simples): "Cinquenta reais de
// gasolina." não tem NENHUM verbo -- nem os catalogados em classifyIntent --
// e caía em 'question'/unsupported. O parser de uma única operação nunca
// chegava a criar a ação pendente (nem sequer o estado needs_clarification),
// e a frase inteira escapava para o chat geral (LLM em modo consultivo, sem
// nenhuma máquina de estados), que respondia em prosa livre pedindo/
// confirmando a conta repetidamente, sem nunca montar o card.
// ============================================================================

test('BUG REAL: "Cinquenta reais de gasolina." (sem nenhum verbo) é reconhecida como despesa -- pergunta somente a conta', () => {
  const result = parseFinancialText('Cinquenta reais de gasolina.');

  assert.equal(result.intent, 'register_expense');
  assert.equal(result.entities.amount, 50);
  assert.equal(result.entities.description, 'Gasolina');
  assert.equal(result.entities.category, 'Transporte');
  assert.equal(result.entities.account, null);
  assert.equal(result.missingEntities.length, 0, 'amount é o único campo exigido pelo parser -- account é resolvido depois, na ação');
});

test('BUG REAL: uma pergunta genuína que também contém "reais de" ("Quanto reais de desconto tem?") continua como question, nunca vira despesa', () => {
  const result = parseFinancialText('Quanto reais de desconto tem?');
  assert.equal(result.intent, 'question');
});

test('outras frases de lançamento com verbos ampliados também entram no fluxo financeiro (Foi/Lance/Registra)', () => {
  const foiPosto = parseFinancialText('Foi R$ 200 no posto.');
  assert.equal(foiPosto.intent, 'register_expense');
  assert.equal(foiPosto.entities.amount, 200);

  const lanceDespesa = parseFinancialText('Lance uma despesa de R$ 70.');
  assert.equal(lanceDespesa.intent, 'register_expense');
  assert.equal(lanceDespesa.entities.amount, 70);

  const registraAlimentacao = parseFinancialText('Registra R$ 120 de alimentação.');
  assert.equal(registraAlimentacao.intent, 'register_expense');
  assert.equal(registraAlimentacao.entities.amount, 120);
  assert.equal(registraAlimentacao.entities.description, 'Alimentação');
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
