// Testes do Motor de Consultas Financeiras Inteligentes (Fase 3 a 8).
//
// Cobre: extração de valor/data/descrição/conta, classificação da consulta,
// resolução por descrição → valor → data → categoria → conta, ambiguidade
// (nunca adivinhar), conta/categoria removida (frases fixas), contexto da
// conversa, estilo simple e a regra de ouro "nunca inventar resposta".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyQueryType,
  extractAccountReference,
  extractDescriptionKeywords,
  extractQueryAmount,
  extractQueryDate,
  findAccountsByPhrase,
  findCategoriesByPhrase,
  resolveFinancialQuery,
} from './financialQueryEngine.js';
import { buildFinancialSnapshot } from './financialSnapshot.js';

const REFERENCE_DATE = '2026-07-15';

const ACCOUNTS = [
  { id: 'acc-nubank', name: 'Nubank', current_balance: 500 },
  { id: 'acc-itau', name: 'Itaú', current_balance: 200 },
];

const CATEGORIES = [
  { id: 'cat-food', name: 'Alimentação' },
  { id: 'cat-transport', name: 'Transporte' },
];

const TRANSACTIONS = [
  { id: 't1', account_id: 'acc-nubank', category_id: 'cat-food', transaction_type: 'expense', amount: 120.5, description: 'Mercado', transaction_date: '2026-07-14', status: 'confirmed' },
  { id: 't2', account_id: 'acc-itau', category_id: 'cat-transport', transaction_type: 'expense', amount: 45, description: 'Uber', transaction_date: '2026-07-10', status: 'confirmed' },
  { id: 't3', account_id: 'acc-nubank', category_id: null, transaction_type: 'income', amount: 3000, description: 'Salário', transaction_date: '2026-07-05', status: 'confirmed' },
  { id: 't4', account_id: 'acc-itau', category_id: 'cat-food', transaction_type: 'expense', amount: 90, description: 'Restaurante', transaction_date: '2026-06-28', status: 'confirmed' },
  { id: 't7', account_id: 'acc-nubank', category_id: 'cat-food', transaction_type: 'expense', amount: 33.33, description: 'Ifood', transaction_date: '2026-07-16', status: 'confirmed' },
  { id: 't8', account_id: 'acc-itau', category_id: 'cat-transport', transaction_type: 'expense', amount: 60, description: 'Gasolina', transaction_date: '2026-07-12', status: 'confirmed' },
  { id: 't10', account_id: 'acc-nubank', category_id: null, transaction_type: 'expense', amount: 50, description: 'Açougue', transaction_date: '2026-07-13', status: 'confirmed' },
  { id: 't11', account_id: 'acc-itau', category_id: null, transaction_type: 'expense', amount: 50, description: 'Farmácia', transaction_date: '2026-07-09', status: 'confirmed' },
];

const ACCOUNT_BALANCES = [
  { account_id: 'acc-nubank', derived_balance: 480.5 },
  { account_id: 'acc-itau', derived_balance: 260 },
];

function buildSnapshot(overrides = {}) {
  return buildFinancialSnapshot({
    accounts: ACCOUNTS,
    categories: CATEGORIES,
    transactions: TRANSACTIONS,
    workspaceBalance: 740.5,
    accountBalances: ACCOUNT_BALANCES,
    referenceDate: REFERENCE_DATE,
    ...overrides,
  });
}

// ── Extração de entidades (Fase 5) ──────────────────────────────────────────

test('extractQueryAmount entende valores explícitos, gírias e formatos BRL', () => {
  assert.equal(extractQueryAmount('quanto gastei 120 reais'), 120);
  assert.equal(extractQueryAmount('R$ 45,50 no ifood'), 45.5);
  assert.equal(extractQueryAmount('aquele gasto de 2 contos'), 2000);
  assert.equal(extractQueryAmount('cinquentão'), 50);
  assert.equal(extractQueryAmount('trintão'), 30);
  assert.equal(extractQueryAmount('quanto gastei?'), null);
});

test('extractQueryDate resolve datas relativas com a data de referência', () => {
  assert.equal(extractQueryDate('aquele gasto de ontem', REFERENCE_DATE), '2026-07-14');
  assert.equal(extractQueryDate('gastei anteontem', REFERENCE_DATE), '2026-07-13');
  assert.equal(extractQueryDate('sem data aqui', REFERENCE_DATE), null);
});

test('extractDescriptionKeywords remove scaffolding e palavras genéricas', () => {
  assert.deepEqual(extractDescriptionKeywords('em qual conta foi o mercado?'), ['mercado']);
  assert.deepEqual(extractDescriptionKeywords('quanto gastei com uber esse mês'), ['uber']);
  assert.deepEqual(extractDescriptionKeywords('aquele ifood de 50 reais'), ['ifood']);
  assert.deepEqual(extractDescriptionKeywords('qual meu saldo?'), []);
});

test('extractAccountReference captura a conta no fim da frase', () => {
  assert.equal(extractAccountReference('quanto tenho na conta Nubank'), 'conta nubank');
  assert.equal(extractAccountReference('quanto tenho no Itaú'), 'itau');
  assert.equal(extractAccountReference('qual meu saldo?'), null);
});

test('findAccountsByPhrase resolve por nome exato, contém e marca ambiguidade', () => {
  const snapshot = buildSnapshot();
  const nubank = findAccountsByPhrase(snapshot, 'nubank');
  assert.equal(nubank.matches.length, 1);
  assert.equal(nubank.matches[0].id, 'acc-nubank');
  assert.equal(nubank.ambiguous, false);

  const generic = findAccountsByPhrase(snapshot, 'conta');
  assert.equal(generic.matches.length, 0);

  const withName = findAccountsByPhrase(snapshot, 'conta nubank');
  assert.equal(withName.matches[0].id, 'acc-nubank');
});

test('findCategoriesByPhrase resolve categorias e marca ambiguidade', () => {
  const snapshot = buildSnapshot();
  const food = findCategoriesByPhrase(snapshot, 'alimentação');
  assert.equal(food.matches.length, 1);
  assert.equal(food.matches[0].id, 'cat-food');
});

// ── Classificação (Fase 3) ──────────────────────────────────────────────────

test('classifyQueryType reconhece os tipos de consulta suportados', () => {
  assert.equal(classifyQueryType('qual foi minha última receita?'), 'last_income');
  assert.equal(classifyQueryType('qual foi minha última despesa?'), 'last_expense');
  assert.equal(classifyQueryType('qual foi a última movimentação?'), 'last_transaction');
  assert.equal(classifyQueryType('em qual conta foi o mercado?'), 'transaction_account');
  assert.equal(classifyQueryType('quanto tenho na conta Nubank?'), 'account_balance');
  assert.equal(classifyQueryType('quanto gastei com mercado esse mês?'), 'category_expenses');
  assert.equal(classifyQueryType('quanto gastei em junho?'), 'category_expenses');
  assert.equal(classifyQueryType('aquele gasto de 120 reais'), 'transaction_reference');
  assert.equal(classifyQueryType('o mercado?'), 'transaction_reference');
});

test('classifyQueryType não classifica o que não é consulta', () => {
  assert.equal(classifyQueryType('Oi, tudo bem?'), null);
  assert.equal(classifyQueryType('registrar despesa de 50 reais'), null);
  assert.equal(classifyQueryType('qual a previsão do tempo?'), null);
  assert.equal(classifyQueryType(''), null);
});

// ── Resolução (Fase 4/6/8) ──────────────────────────────────────────────────

test('saldo por conta responde com o valor real do snapshot e conta nomeada', () => {
  const result = resolveFinancialQuery({
    text: 'quanto tenho na conta Nubank?',
    snapshot: buildSnapshot(),
  });
  assert.equal(result.handled, true);
  assert.match(result.response.text, /R\$\s*480,50/);
  assert.match(result.response.text, /Nubank/);
  assert.match(result.response.highlight, /R\$\s*480,50/);
});

test('saldo com contas ambíguas pergunta, nunca escolhe aleatoriamente', () => {
  const snapshot = buildSnapshot({
    accounts: [
      { id: 'acc-nubank', name: 'Nubank', current_balance: 500 },
      { id: 'acc-nuinvest', name: 'Nu Invest', current_balance: 100 },
    ],
  });
  const result = resolveFinancialQuery({
    text: 'quanto tenho na conta Nu?',
    snapshot,
  });
  assert.equal(result.handled, true);
  assert.match(result.response.text, /Encontrei 2 contas correspondentes/);
  assert.match(result.response.text, /Qual delas você quer consultar/);
});

test('conta inexistente é reportada com as contas disponíveis, sem inventar', () => {
  const result = resolveFinancialQuery({
    text: 'quanto tenho na conta Crefisa?',
    snapshot: buildSnapshot(),
  });
  assert.equal(result.handled, true);
  assert.match(result.response.text, /Não encontrei a conta "Crefisa"/);
  assert.match(result.response.text, /Nubank/);
  assert.match(result.response.text, /Itaú/);
});

test('saldo sem conta específica lista as contas e pergunta qual consultar', () => {
  const result = resolveFinancialQuery({
    text: 'quanto tenho nas minhas contas?',
    snapshot: buildSnapshot(),
  });
  assert.equal(result.handled, true);
  assert.match(result.response.text, /Qual conta você quer consultar/);
});

test('última despesa responde com descrição, valor, conta e data reais', () => {
  const result = resolveFinancialQuery({
    text: 'qual foi minha última despesa?',
    snapshot: buildSnapshot(),
  });
  assert.equal(result.handled, true);
  assert.match(result.response.text, /Sua última despesa foi Ifood/);
  assert.match(result.response.text, /R\$\s*33,33/);
  assert.match(result.response.text, /na conta Nubank/);
  assert.match(result.response.text, /16\/07\/2026/);
});

test('última receita e última movimentação seguem o mesmo padrão com dados reais', () => {
  const income = resolveFinancialQuery({
    text: 'qual foi minha última receita?',
    snapshot: buildSnapshot(),
  });
  assert.match(income.response.text, /Sua última receita foi Salário/);
  assert.match(income.response.text, /R\$\s*3\.000,00/);

  const last = resolveFinancialQuery({
    text: 'qual foi a última movimentação?',
    snapshot: buildSnapshot(),
  });
  assert.match(last.response.text, /Sua última movimentação foi Ifood/);
  assert.match(last.response.text, /na conta Nubank/);
});

test('sem movimentações, respostas usam frases fixas de ausência', () => {
  const empty = buildSnapshot({ transactions: [] });
  const expense = resolveFinancialQuery({ text: 'qual foi minha última despesa?', snapshot: empty });
  assert.match(expense.response.text, /Você ainda não tem despesas registradas/);

  const income = resolveFinancialQuery({ text: 'qual foi minha última receita?', snapshot: empty });
  assert.match(income.response.text, /Você ainda não tem receitas registradas/);

  const last = resolveFinancialQuery({ text: 'qual foi a última movimentação?', snapshot: empty });
  assert.match(last.response.text, /Você ainda não tem movimentações registradas/);
});

test('movimentação por descrição única resolve com conta e categoria nomeadas', () => {
  const result = resolveFinancialQuery({
    text: 'aquele gasto do mercado',
    snapshot: buildSnapshot(),
  });
  assert.equal(result.handled, true);
  assert.match(result.response.text, /Foi na conta Nubank/);
  assert.match(result.response.text, /em Alimentação/);
  assert.match(result.response.text, /R\$\s*120,50/);
});

test('movimentação por valor único resolve sem ambigüidade', () => {
  const result = resolveFinancialQuery({
    text: 'aquele gasto de 45 reais',
    snapshot: buildSnapshot(),
  });
  assert.equal(result.handled, true);
  assert.match(result.response.text, /Foi na conta Itaú/);
  assert.match(result.response.text, /R\$\s*45,00/);
});

test('valores ambíguos geram pergunta com opções e nunca escolhem sozinhos', () => {
  const result = resolveFinancialQuery({
    text: 'aquele gasto de 50 reais',
    snapshot: buildSnapshot(),
  });
  assert.equal(result.handled, true);
  assert.match(result.response.text, /Encontrei 2 gastos de R\$\s*50,00/);
  assert.match(result.response.text, /Nubank — Açougue/);
  assert.match(result.response.text, /Itaú — Farmácia/);
  assert.match(result.response.text, /Qual deles você quis dizer/);
  assert.doesNotMatch(result.response.text, /Foi na conta/);
});

test('movimentação não encontrada é informada explicitamente, sem inventar', () => {
  const result = resolveFinancialQuery({
    text: 'aquele gasto de 999 reais',
    snapshot: buildSnapshot(),
  });
  assert.equal(result.handled, true);
  assert.match(result.response.text, /Não encontrei nenhuma movimentação de R\$\s*999,00/);
});

test('conta removida usa a frase fixa e nunca inventa o nome', () => {
  const snapshot = buildSnapshot({ accounts: [] });
  const result = resolveFinancialQuery({
    text: 'qual foi minha última despesa?',
    snapshot,
  });
  assert.match(result.response.text, /Essa movimentação pertence a uma conta que não está mais disponível/);
  assert.doesNotMatch(result.response.text, /Nubank|Itaú/);
});

test('categoria removida usa a frase fixa e nunca inventa o nome', () => {
  const snapshot = buildSnapshot({ categories: [] });
  const result = resolveFinancialQuery({
    text: 'qual foi minha última despesa?',
    snapshot,
  });
  assert.match(result.response.text, /A categoria dessa movimentação não está mais disponível/);
});

test('"qual conta usei?" sem critérios usa o contexto da conversa primeiro', () => {
  const history = [
    { from: 'user', text: 'gastei 45 reais ontem no uber' },
  ];
  const result = resolveFinancialQuery({
    text: 'qual conta usei?',
    snapshot: buildSnapshot(),
    history,
  });
  assert.equal(result.handled, true);
  assert.match(result.response.text, /Foi na conta Itaú/);
  assert.match(result.response.text, /R\$\s*45,00/);
});

test('"qual conta usei?" sem contexto responde com a última movimentação real', () => {
  const result = resolveFinancialQuery({
    text: 'qual conta usei?',
    snapshot: buildSnapshot(),
  });
  assert.equal(result.handled, true);
  assert.match(result.response.text, /A última movimentação que você fez foi na conta Nubank/);
  assert.match(result.response.text, /16\/07\/2026/);
});

test('gastos por categoria resolvem o total real da categoria no mês corrente', () => {
  const result = resolveFinancialQuery({
    text: 'quanto gastei com alimentação esse mês?',
    snapshot: buildSnapshot(),
  });
  assert.equal(result.handled, true);
  assert.match(result.response.text, /Em julho, você gastou R\$\s*153,83 com Alimentação/);
});

test('sem categoria correspondente, gastos usam inferência por descrição com dados reais', () => {
  const result = resolveFinancialQuery({
    text: 'quanto gastei com mercado esse mês?',
    snapshot: buildSnapshot(),
  });
  assert.equal(result.handled, true);
  assert.match(result.response.text, /gastou R\$\s*120,50 com mercado/);
});

test('gastos por mês nomeado usam o total real daquele mês', () => {
  const result = resolveFinancialQuery({
    text: 'quanto gastei em junho?',
    snapshot: buildSnapshot(),
  });
  assert.equal(result.handled, true);
  assert.match(result.response.text, /Em Junho, você gastou R\$\s*90,00/);
});

test('referência vaga pede mais informações em vez de chutar', () => {
  const result = resolveFinancialQuery({
    text: 'aquilo',
    snapshot: buildSnapshot(),
  });
  assert.equal(result.handled, true);
  assert.match(result.response.text, /Sobre qual movimentação você quer saber/);
});

test('consulta em espaço empresa mantém a resolução com o mesmo dado', () => {
  const result = resolveFinancialQuery({
    text: 'quanto tenho na conta Itaú?',
    snapshot: buildSnapshot(),
    mode: 'empresa',
  });
  assert.equal(result.handled, true);
  assert.match(result.response.text, /R\$\s*260,00/);
  assert.match(result.response.text, /Itaú/);
});

test('estilo simple condensa respostas em linha única', () => {
  const result = resolveFinancialQuery({
    text: 'aquele gasto de 50 reais',
    snapshot: buildSnapshot(),
    conversationStyle: 'simple',
  });
  assert.equal(result.handled, true);
  assert.ok(!result.response.text.includes('\n'));
  assert.match(result.response.text, /Qual deles você quis dizer/);
});

test('estilo padrão mantém a estrutura em tópicos', () => {
  const result = resolveFinancialQuery({
    text: 'aquele gasto de 50 reais',
    snapshot: buildSnapshot(),
  });
  assert.ok(result.response.text.includes('\n'));
});

test('textos que não são consulta financeira não são tratados pelo motor', () => {
  assert.deepEqual(resolveFinancialQuery({ text: 'Oi, tudo bem?', snapshot: buildSnapshot() }), { handled: false });
  assert.deepEqual(resolveFinancialQuery({ text: '', snapshot: buildSnapshot() }), { handled: false });
  assert.deepEqual(resolveFinancialQuery({ text: 'registrar gasto de 50 reais', snapshot: buildSnapshot() }), { handled: false });
  assert.deepEqual(resolveFinancialQuery({ text: 'quanto gastei?', snapshot: buildSnapshot() }), { handled: false });
});

test('motor é determinístico: mesma consulta e snapshot produzem a mesma resposta', () => {
  const first = resolveFinancialQuery({ text: 'aquele gasto do mercado', snapshot: buildSnapshot() });
  const second = resolveFinancialQuery({ text: 'aquele gasto do mercado', snapshot: buildSnapshot() });
  assert.equal(first.response.text, second.response.text);
});
