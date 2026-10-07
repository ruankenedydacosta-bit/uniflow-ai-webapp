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

for (const [input, expectedAmount, expectedDescription] of [
  ['Bom dia, Uni. Gastei 50 reais no mercado.', 50, 'Mercado'],
  ['Oi, Uni. Registra 200 reais de gasolina.', 200, 'Gasolina'],
]) {
  test(`saudação não contamina lançamento financeiro: ${input}`, () => {
    const result = parseFinancialText(input);
    assert.equal(result.intent, 'register_expense');
    assert.equal(result.entities.amount, expectedAmount);
    assert.equal(result.entities.description, expectedDescription);
    assert.equal(result.ready, true);
  });
}

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

test('vocabulário público Entradas/Saídas preserva todos os aliases e contratos internos', () => {
  const cases = [
    ['Gastei 200 reais no mercado', 'register_expense', 200],
    ['Paguei 100 reais de gasolina', 'register_expense', 100],
    ['Registra uma despesa de 50 reais', 'register_expense', 50],
    ['Saiu 300 reais de aluguel', 'register_expense', 300],
    ['Recebi 1.000 reais de um cliente', 'register_income', 1000],
    ['Entrou 500 reais hoje', 'register_income', 500],
    ['Registra uma receita de 800 reais', 'register_income', 800],
    ['Venda de 250 reais', 'register_income', 250],
  ];

  for (const [input, expectedIntent, expectedAmount] of cases) {
    const result = parseFinancialText(input, { referenceDate: '2026-08-13' });
    assert.equal(result.intent, expectedIntent, input);
    assert.equal(result.entities.amount, expectedAmount, input);
  }
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
// BUG REAL EM PRODUÇÃO: "Fala, Uni. Boa noite. Eu fiz uma compra de 200
// reais no mercado." caía em intent 'question' -- nem "comprei" (verbo
// conjugado) nem "reais de" (é "reais no mercado") batiam em nenhum padrão,
// então a frase ia direto para o chat geral em vez de perguntar a conta.
// "fiz/realizei uma compra" agora é reconhecida como register_expense.
test('BUG REAL: "Eu fiz uma compra de 200 reais no mercado." é reconhecida como despesa mesmo com saudação antes', () => {
  const withGreeting = parseFinancialText('Fala, Uni. Boa noite. Eu fiz uma compra de 200 reais no mercado.');
  const bare = parseFinancialText('Eu fiz uma compra de 200 reais no mercado.');

  assert.equal(withGreeting.intent, 'register_expense');
  assert.equal(withGreeting.entities.amount, 200);
  assert.equal(bare.intent, 'register_expense');
  assert.equal(bare.entities.amount, 200);
});
// BUG REAL EM PRODUÇÃO: classifyIntent já reconhecia "fiz/realizei uma
// compra" como despesa (teste acima), mas a lista de verbos usada só para
// LIMPAR a descrição (entityExtractor.js) nunca ganhou o mesmo padrão -- a
// frase inteira ficava colada na descrição ("Fiz Uma Compra" em vez de
// "Mercado"/nada). Sem nenhum outro sinal, a Uni chegava a PROPOR CRIAR uma
// categoria chamada literalmente "Fiz Uma Compra" em vez de perguntar a
// categoria normalmente.
test('BUG REAL: "Fiz uma compra de 200 reais no mercado." nunca deixa "Fiz" ou "compra" grudados na descrição', () => {
  const comMercado = parseFinancialText('Fiz uma compra de 200 reais no mercado.');
  const semMercado = parseFinancialText('Fiz uma compra de vinte reais.');

  assert.equal(comMercado.entities.category, 'Alimentação');
  assert.doesNotMatch(comMercado.entities.description ?? '', /fiz|compra/i);
  // Sem nenhum substantivo reconhecível na frase, a descrição fica vazia
  // (null) -- nunca a frase inteira usada como se fosse um nome de verdade.
  assert.equal(semMercado.entities.description, null);
});
// BUG REAL EM PRODUÇÃO: "Coloca pra mim aí setenta e cinco reais no
// mercado." caía em intent 'question' -- só o passado "coloquei" estava
// coberto, nunca o imperativo "coloca/bota/poe" (forma de pedido comum:
// "coloca aí...", "bota 50 no...", "poe 20 reais em..."). A frase inteira
// ia para o chat geral (resposta só em texto, sem card de confirmação), e a
// resposta seguinte "confirmar" não tinha nenhuma ação pendente para
// resolver -- virava consulta.
test('BUG REAL: "Coloca pra mim aí setenta e cinco reais no mercado." é reconhecida como despesa (imperativo, não só "coloquei")', () => {
  const coloca = parseFinancialText('Coloca pra mim aí setenta e cinco reais no mercado.');
  const bota = parseFinancialText('Bota 50 reais de gasolina.');
  const poe = parseFinancialText('Poe 20 reais no mercado.');

  assert.equal(coloca.intent, 'register_expense');
  assert.equal(coloca.entities.amount, 75);
  assert.equal(coloca.ready, true);
  assert.equal(bota.intent, 'register_expense');
  assert.equal(bota.entities.amount, 50);
  assert.equal(poe.intent, 'register_expense');
  assert.equal(poe.entities.amount, 20);
  // BUG REAL EM PRODUÇÃO: só a classificação de intenção reconhecia
  // "coloca/bota/poe" -- a limpeza de descrição (entityExtractor.js) tinha
  // sua própria lista de verbos, sem os mesmos, e "Bota"/"Poe" ficavam
  // colados na descrição.
  assert.doesNotMatch(bota.entities.description ?? '', /^bota\b/i);
  assert.doesNotMatch(poe.entities.description ?? '', /^poe\b/i);
  assert.equal(bota.entities.description, 'Gasolina');
});
// ============================================================================
// BUG REAL (BUG 2): "Entrou mil reais." e variações. O padrão antigo só
// aceitava o verbo no singular com valor em algarismo logo após o verbo --
// "Entraram mil reais." (plural), "Caiu quinhentos." (número por extenso
// sem "reais") e "Entrou meu salário." (sem valor) caíam em 'question' e o
// FinancialQueryEngine ainda as capturava como transaction_reference (e,
// com pendência ativa, a frase inteira virava nome de conta proposto).
// ============================================================================

test('BUG REAL: "Entraram mil reais." (plural) é reconhecida como receita com valor', () => {
  const result = parseFinancialText('Entraram mil reais.');

  assert.equal(result.intent, 'register_income');
  assert.equal(result.entities.amount, 1000);
  assert.equal(result.entities.description, null);
});

test('BUG REAL: "Caiu quinhentos." (número por extenso sem moeda no fim) é reconhecida como receita com valor 500', () => {
  const result = parseFinancialText('Caiu quinhentos.');

  assert.equal(result.intent, 'register_income');
  assert.equal(result.entities.amount, 500);
  assert.equal(result.entities.description, null);
});

test('BUG REAL: "Entrou meu salário." (verbo + possessivo, sem valor) é reconhecida como receita', () => {
  const result = parseFinancialText('Entrou meu salário.');

  assert.equal(result.intent, 'register_income');
  assert.equal(result.entities.amount, null);
  assert.equal(result.entities.description, 'Meu salário');
});

test('BUG REAL: "Recebi um Pix de mil." extrai valor 1000 e descrição "Um Pix" (número por extenso sem moeda)', () => {
  const result = parseFinancialText('Recebi um Pix de mil.');

  assert.equal(result.intent, 'register_income');
  assert.equal(result.entities.amount, 1000);
  assert.equal(result.entities.description, 'Um Pix');
});

test('BUG REAL: "Caiu um Pix de mil reais." extrai valor e não deixa preposição pendurada na descrição', () => {
  const result = parseFinancialText('Caiu um Pix de mil reais.');

  assert.equal(result.intent, 'register_income');
  assert.equal(result.entities.amount, 1000);
  assert.equal(result.entities.description, 'Um Pix');
});

test('BUG REAL: pergunta não financeira com número por extenso no fim continua sem valor ("Quanto é a nota do carro?")', () => {
  const result = parseFinancialText('Quanto é a nota do carro?');

  assert.equal(result.intent, 'question');
  assert.equal(result.entities.amount, null);
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
  // BUG REAL (BUG 2): "para o Nubank" é o DESTINO -- `account` é a ORIGEM
  // ("do/da X"). Sem origem explícita, `account` fica null e o destino
  // sai em destinationAccount.
  assert.equal(result.entities.account, null);
  assert.equal(result.entities.destinationAccount, 'Nubank');
  assert.equal(result.entities.description, 'Transferência para Nubank');
  // BUG REAL (BUG 2): sem origem explícita a ação não fica pronta no
  // parser -- o fluxo pergunta "de qual conta?" e o contexto herda a
  // origem (applyConversationContext), como qualquer campo de pendência.
  assert.deepEqual(result.missingEntities, ['account']);
  assert.equal(result.ready, false);
});

test('BUG REAL: transferencia com origem e destino extrai as duas contas', () => {
  const result = parseFinancialText('Transferir cem do Nubank para o Inter.');

  assert.equal(result.intent, 'register_transfer');
  assert.equal(result.entities.amount, 100);
  assert.equal(result.entities.account, 'Nubank');
  assert.equal(result.entities.destinationAccount, 'Inter');
  assert.equal(result.entities.description, 'Transferência para Inter');
  assert.equal(result.ready, true);
});

test('BUG REAL: gíria de número ("cinquentão") vira valor e não contamina a descrição', () => {
  const result = parseFinancialText('Gastei cinquentão no mercado.');

  assert.equal(result.intent, 'register_expense');
  assert.equal(result.entities.amount, 50);
  assert.equal(result.entities.account, null);
  assert.equal(result.entities.description, 'Mercado');
  assert.equal(result.ready, true);
});

test('BUG REAL: declaração de saldo com número por extenso ("Meu saldo no Nubank é mil") é ajuste, não vira nome de conta', () => {
  const result = parseFinancialText('Meu saldo no Nubank é mil.');

  assert.equal(result.intent, 'set_balance');
  assert.equal(result.entities.amount, 1000);
  assert.equal(result.entities.account, 'Nubank');
  assert.equal(result.entities.description, null);
  assert.equal(result.ready, true);
});

test('BUG REAL: número por extenso antes de preposição ("Gastei quinhentos no mercado") vira valor', () => {
  const result = parseFinancialText('Gastei quinhentos no mercado.');

  assert.equal(result.intent, 'register_expense');
  assert.equal(result.entities.amount, 500);
  assert.equal(result.entities.description, 'Mercado');
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

// ============================================================================
// CORREÇÃO URGENTE (prioridade das novas intenções de saldo e receita):
// declarações explícitas são classificadas como AÇÃO (set_balance /
// ambiguous_balance_or_income / register_income) -- nunca como consulta
// (check_balance) nem como 'question' -- mesmo quando contêm valor por
// extenso ("mil reais" não tem dígito) ou nome de conta.
// ============================================================================

test('CORREÇÃO URGENTE: "Meu saldo no Nubank é mil reais." é set_balance com valor e conta', () => {
  const result = parseFinancialText('Meu saldo no Nubank é mil reais.');

  assert.equal(result.intent, 'set_balance');
  assert.equal(result.entities.amount, 1000);
  assert.equal(result.entities.account, 'Nubank');
  assert.equal(result.entities.description, null);
  assert.equal(result.requiresConfirmation, true);
  assertEntityShape(result);
});

test('CORREÇÃO URGENTE: "Meu saldo é R$ 1.000." é set_balance', () => {
  const result = parseFinancialText('Meu saldo é R$ 1.000.');

  assert.equal(result.intent, 'set_balance');
  assert.equal(result.entities.amount, 1000);
  assert.equal(result.ready, true);
});

test('CORREÇÃO URGENTE: "Tenho mil reais." é ambiguous_balance_or_income (pergunta de decisão, nunca consulta)', () => {
  const result = parseFinancialText('Tenho mil reais.');

  assert.equal(result.intent, 'ambiguous_balance_or_income');
  assert.equal(result.entities.amount, 1000);
  assert.equal(result.ready, true);
});

test('CORREÇÃO URGENTE: "Tenho mil reais de saldo." é set_balance (valor + "de saldo" explícito)', () => {
  const result = parseFinancialText('Tenho mil reais de saldo.');

  assert.equal(result.intent, 'set_balance');
  assert.equal(result.entities.amount, 1000);
  assert.equal(result.ready, true);
});

test('CORREÇÃO URGENTE: "Recebi mil reais." é register_income, nunca consulta por valor', () => {
  const result = parseFinancialText('Recebi mil reais.');

  assert.equal(result.intent, 'register_income');
  assert.equal(result.entities.amount, 1000);
  assert.equal(result.ready, true);
});

test('CORREÇÃO URGENTE: "Entrou mil reais." é register_income (valor por extenso após o verbo)', () => {
  const result = parseFinancialText('Entrou mil reais.');

  assert.equal(result.intent, 'register_income');
  assert.equal(result.entities.amount, 1000);
  assert.equal(result.ready, true);
});

test('CORREÇÃO URGENTE: "Entrou 1000." continua register_income com valor em algarismo', () => {
  const result = parseFinancialText('Entrou 1000.');

  assert.equal(result.intent, 'register_income');
  assert.equal(result.entities.amount, 1000);
});

test('CORREÇÃO URGENTE: "Ganhei mil reais." e "Estou com mil reais." seguem como declaração (income e ambiguidade)', () => {
  assert.equal(parseFinancialText('Ganhei mil reais.').intent, 'register_income');
  assert.equal(parseFinancialText('Estou com mil reais.').intent, 'ambiguous_balance_or_income');
});

test('CORREÇÃO URGENTE: perguntas reais continuam check_balance, nunca viram declaração', () => {
  assert.equal(parseFinancialText('Quanto tenho no Nubank?').intent, 'check_balance');
  assert.equal(parseFinancialText('Qual é meu saldo?').intent, 'check_balance');
  assert.equal(parseFinancialText('Quanto recebi este mês?').intent, 'question');
});

// BUG REAL EM PRODUCAO (conversa por voz): pedidos falados caíam em
// 'question' e a Uni respondia que não entendeu.
test('BUG REAL: pedido falado de lançamento vira despesa com valor, descrição limpa e data', () => {
  const cases = [
    ['Eu queria registrar uma saída de cento e vinte e cinco reais com alimentação na data de ontem.', 125, 'Alimentação', '2026-10-05'],
    ['Queria registrar uma saída no valor de duzentos e cinquenta reais com gasolina.', 250, 'Gasolina', null],
    ['Oi Uni, gostaria que você lançasse R$50 de alimentação no dia de hoje.', 50, 'Alimentação', '2026-10-06'],
    ['Adicione 250 de despesas com gasolina na data de ontem', 250, 'Gasolina', '2026-10-05'],
    ['Registro uma saída de 50 reais com a alimentação de hoje.', 50, 'Alimentação', '2026-10-06'],
  ];
  for (const [text, amount, description, date] of cases) {
    const result = parseFinancialText(text, { referenceDate: '2026-10-06' });
    assert.equal(result.intent, 'register_expense', text);
    assert.equal(result.entities.amount, amount, text);
    assert.equal(result.entities.description, description, text);
    assert.equal(result.entities.date, date, text);
  }
  assert.equal(parseFinancialText('Eu quero que você lance uma saída no iFood de R$50,00.').entities.category, 'Alimentação');
});

test('BUG REAL: pedido falado de entrada vira receita; pergunta e pedido sem valor seguem como question', () => {
  const salario = parseFinancialText('Queria registrar uma entrada de mil reais de salário.');
  assert.equal(salario.intent, 'register_income');
  assert.equal(salario.entities.amount, 1000);
  assert.equal(parseFinancialText('Você pode lançar uma receita de 300 reais?').intent, 'register_income');
  assert.equal(parseFinancialText('Como eu registro uma despesa?').intent, 'question');
  assert.equal(parseFinancialText('Quero registrar').intent, 'question');
  assert.equal(parseFinancialText('Adicionar a conta Nubank com 500 reais de saldo').intent, 'question');
});
