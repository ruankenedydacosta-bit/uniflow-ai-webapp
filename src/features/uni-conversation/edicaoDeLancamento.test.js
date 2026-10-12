import assert from 'node:assert/strict';
import test from 'node:test';
import {
  analisarAlvo,
  escolherCandidato,
  FORMAS_DE_EDICAO,
  interpretarPedidoDeEdicao,
  lerAjusteDaAlteracao,
  linhasDaAlteracao,
  localizarLancamento,
  montarAlteracao,
  motivoDeBloqueio,
  textoDaAlteracao,
  textoDaAlteracaoFeita,
  textoDaEscolha,
} from './edicaoDeLancamento.js';

// Quinta-feira, 08/10/2026: ontem é 07/10, segunda é 05/10, sexta é 02/10.
const HOJE = '2026-10-08';
const accounts = [
  { id: 'nubank', name: 'Nubank' },
  { id: 'itau', name: 'Itaú' },
  { id: 'antiga', name: 'Conta antiga', is_active: false },
];
const categories = [
  { id: 'lazer', name: 'Lazer', category_type: 'expense' },
  { id: 'alimentacao', name: 'Alimentação', category_type: 'expense' },
  { id: 'transporte', name: 'Transporte', category_type: 'expense' },
  { id: 'salario', name: 'Salário', category_type: 'income' },
];
const contexto = { accounts, categories, referenceDate: HOJE };

// O Intl separa "R$" do número com espaço não separável.
function semNbsp(valor) {
  return JSON.parse(JSON.stringify(valor).replace(/\\u00a0|\u00a0/g, ' '));
}

function lancamento(campos) {
  return {
    transaction_type: 'expense',
    status: 'paid',
    source_type: 'manual',
    account_id: 'itau',
    category_id: 'alimentacao',
    created_at: `${campos.transaction_date}T12:00:00Z`,
    ...campos,
  };
}

const mercadoOntem = lancamento({ id: 't1', description: 'Mercado', amount: 32, transaction_date: '2026-10-07' });
const mercadoSemanaPassada = lancamento({ id: 't2', description: 'Mercado Extra', amount: 85, transaction_date: '2026-09-30', account_id: 'nubank' });
const uberSegunda = lancamento({ id: 't3', description: 'Uber', amount: 18.9, transaction_date: '2026-10-05', category_id: 'transporte' });
const ifoodSexta = lancamento({ id: 't4', description: 'iFood', amount: 45, transaction_date: '2026-10-02' });
const salario = lancamento({ id: 't5', description: 'Salário', amount: 5000, transaction_date: '2026-10-05', transaction_type: 'income', category_id: 'salario' });
const transacoes = [mercadoOntem, mercadoSemanaPassada, uberSegunda, ifoodSexta, salario];

test('pedido com verbo separa o lançamento procurado da mudança', () => {
  assert.deepEqual(
    interpretarPedidoDeEdicao('corrige o mercado de ontem pra cinquenta reais', contexto),
    { forma: FORMAS_DE_EDICAO.VERBO, alvo: 'mercado de ontem', mudancas: { amount: 50 } },
  );
  assert.deepEqual(
    interpretarPedidoDeEdicao('Muda a categoria do iFood de sexta pra Lazer.', contexto),
    { forma: FORMAS_DE_EDICAO.VERBO, alvo: 'ifood de sexta', mudancas: { categoryId: 'lazer' } },
  );
  assert.deepEqual(
    interpretarPedidoDeEdicao('troca a conta do Uber pro Itaú', contexto),
    { forma: FORMAS_DE_EDICAO.VERBO, alvo: 'uber', mudancas: { accountId: 'itau' } },
  );
});

test('a data pedida não vira filtro do lançamento procurado', () => {
  const pedido = interpretarPedidoDeEdicao('muda a data do mercado pra anteontem', contexto);
  assert.deepEqual(pedido, { forma: FORMAS_DE_EDICAO.VERBO, alvo: 'mercado', mudancas: { date: '2026-10-06' } });
  assert.equal(analisarAlvo(pedido.alvo, contexto).data, null);
});

test('o valor dito no lançamento procurado vira filtro e não mudança', () => {
  const pedido = interpretarPedidoDeEdicao('Uni, corrige o aluguel de 1500 pra 1600', contexto);
  assert.deepEqual(pedido.mudancas, { amount: 1600 });
  assert.equal(analisarAlvo(pedido.alvo, contexto).valor, 1500);
});

test('descrição e categoria pedida mantêm a caixa e o acento de quem falou', () => {
  assert.deepEqual(
    interpretarPedidoDeEdicao('muda a descrição do mercado pra Feira de Sábado', contexto).mudancas,
    { description: 'Feira de Sábado' },
  );
  assert.equal(
    interpretarPedidoDeEdicao('muda a categoria do iFood pra Animais de Estimação', contexto).categoriaPedida,
    'Animais de Estimação',
  );
});

test('forma sem verbo só vale para conta ou categoria que existem', () => {
  assert.deepEqual(
    interpretarPedidoDeEdicao('O Uber de segunda foi no Nubank.', contexto),
    { forma: FORMAS_DE_EDICAO.COPULA, alvo: 'uber de segunda', mudancas: { accountId: 'nubank' } },
  );
  assert.deepEqual(
    interpretarPedidoDeEdicao('o iFood de sexta era da categoria Lazer', contexto).mudancas,
    { categoryId: 'lazer' },
  );
  // Lançamento novo, não edição.
  assert.equal(interpretarPedidoDeEdicao('o almoço foi 30 reais', contexto), null);
  assert.equal(interpretarPedidoDeEdicao('o almoço de 30 foi no Nubank', contexto), null);
  // Conta que não existe: segue o caminho de sempre.
  assert.equal(interpretarPedidoDeEdicao('o mercado foi no débito', contexto), null);
});

test('pedido sem lançamento citado se refere ao último confirmado', () => {
  for (const frase of ['corrige pra 50', 'muda o valor pra 50', 'na verdade foi 50', 'Ops, na verdade foram 50 reais', 'muda esse pra 50']) {
    assert.deepEqual(
      interpretarPedidoDeEdicao(frase, contexto),
      { forma: FORMAS_DE_EDICAO.ULTIMO, alvo: '', mudancas: { amount: 50 }, ...(frase.includes('esse') ? { ultimoExplicito: false } : {}) },
      frase,
    );
  }
  assert.equal(interpretarPedidoDeEdicao('muda o valor do último lançamento pra 80', contexto).ultimoExplicito, true);
});

test('pergunta, lançamento novo e conversa não são pedido de edição', () => {
  for (const frase of [
    'corrige o mercado de ontem pra 50?',
    'gastei 50 no mercado',
    'quanto gastei no mercado ontem',
    'qual meu saldo',
    'corrige o saldo',
    'bom dia',
  ]) {
    assert.equal(interpretarPedidoDeEdicao(frase, contexto), null, frase);
  }
});

test('localiza o lançamento só quando todos os critérios batem', () => {
  const alvo = analisarAlvo('mercado de ontem', contexto);
  assert.deepEqual(localizarLancamento(alvo, transacoes, { categories }), { tipo: 'unico', transacao: mercadoOntem });
  // Não afrouxa para "algum mercado" quando a data não bate.
  assert.equal(localizarLancamento(analisarAlvo('mercado de segunda', contexto), transacoes, { categories }).tipo, 'nenhum');
});

test('busca ignora acento e caixa nos dois lados e olha a categoria', () => {
  const ifood = analisarAlvo('IFOOD de sexta', contexto);
  assert.equal(localizarLancamento(ifood, transacoes, { categories }).transacao, ifoodSexta);
  const salarioSemAcento = analisarAlvo('salario', contexto);
  assert.equal(localizarLancamento(salarioSemAcento, transacoes, { categories }).transacao, salario);
  const porCategoria = analisarAlvo('transporte de segunda', contexto);
  assert.equal(localizarLancamento(porCategoria, transacoes, { categories }).transacao, uberSegunda);
});

test('mais de um lançamento devolve a lista, do mais recente ao mais antigo', () => {
  const resultado = localizarLancamento(analisarAlvo('mercado', contexto), transacoes, { categories });
  assert.equal(resultado.tipo, 'varios');
  assert.deepEqual(resultado.candidatos.map((t) => t.id), ['t1', 't2']);
  assert.equal(resultado.total, 2);
});

test('conta citada no lançamento procurado filtra pela conta', () => {
  const alvo = analisarAlvo('mercado do Nubank', contexto);
  assert.equal(alvo.contaId, 'nubank');
  assert.equal(localizarLancamento(alvo, transacoes, { categories }).transacao, mercadoSemanaPassada);
});

test('cancelado não é encontrado; parcela, transferência e importado são bloqueados', () => {
  const cancelado = lancamento({ id: 'c', description: 'Padaria', amount: 10, transaction_date: '2026-10-07', status: 'canceled' });
  assert.equal(localizarLancamento(analisarAlvo('padaria', contexto), [cancelado], { categories }).tipo, 'nenhum');

  const parcela = lancamento({ id: 'p', description: 'Geladeira', amount: 300, transaction_date: '2026-10-01', metadata: { installment_group_id: 'g' } });
  const bloqueado = localizarLancamento(analisarAlvo('geladeira', contexto), [parcela], { categories });
  assert.equal(bloqueado.tipo, 'bloqueado');
  assert.match(bloqueado.motivo, /parcela/);

  assert.match(motivoDeBloqueio({ transaction_type: 'transfer' }), /Transferências/);
  assert.match(motivoDeBloqueio({ transaction_type: 'adjustment' }), /Ajustes de saldo/);
  assert.match(motivoDeBloqueio({ transaction_type: 'expense', source_type: 'open_finance' }), /importação/);
  assert.equal(motivoDeBloqueio(mercadoOntem), null);
});

test('lançamento editável ganha do bloqueado com o mesmo nome', () => {
  const parcela = lancamento({ id: 'p', description: 'Mercado', amount: 300, transaction_date: '2026-10-07', installment_total: 3 });
  const resultado = localizarLancamento(analisarAlvo('mercado de ontem', contexto), [parcela, mercadoOntem], { categories });
  assert.deepEqual(resultado, { tipo: 'unico', transacao: mercadoOntem });
});

test('escolhe na lista pela posição, pelo valor, pela conta ou pela data', () => {
  const lista = [mercadoOntem, mercadoSemanaPassada];
  assert.equal(escolherCandidato('o segundo', lista, contexto), mercadoSemanaPassada);
  assert.equal(escolherCandidato('2', lista, contexto), mercadoSemanaPassada);
  assert.equal(escolherCandidato('o primeiro.', lista, contexto), mercadoOntem);
  assert.equal(escolherCandidato('o último', lista, contexto), mercadoSemanaPassada);
  assert.equal(escolherCandidato('o de 85', lista, contexto), mercadoSemanaPassada);
  assert.equal(escolherCandidato('o do Nubank', lista, contexto), mercadoSemanaPassada);
  assert.equal(escolherCandidato('o de ontem', lista, contexto), mercadoOntem);
  assert.equal(escolherCandidato('o terceiro', lista, contexto), null);
  assert.equal(escolherCandidato('o mercado', lista, contexto), null);
});

test('monta a alteração só com o que muda', () => {
  const alteracao = montarAlteracao(mercadoOntem, { amount: 50, accountId: 'itau' }, contexto);
  assert.deepEqual(alteracao.alteracoes, { amount: 50 });
  assert.deepEqual(alteracao.campos, [{ campo: 'amount', antes: 32, depois: 50 }]);
});

test('recusa categoria de outro tipo, conta inativa e mudança que não muda nada', () => {
  assert.match(montarAlteracao(mercadoOntem, { categoryId: 'salario' }, contexto).erro, /categoria de receita/);
  assert.match(montarAlteracao(salario, { categoryId: 'lazer' }, contexto).erro, /categoria de despesa/);
  assert.match(montarAlteracao(mercadoOntem, { accountId: 'antiga' }, contexto).erro, /não está ativa/);
  assert.match(montarAlteracao(mercadoOntem, { amount: 32 }, contexto).erro, /já está assim/);
  assert.match(montarAlteracao(mercadoOntem, { amount: 0 }, contexto).erro, /maior que zero/);
});

test('card mostra o lançamento e cada mudança como antes → depois', () => {
  const { campos } = montarAlteracao(mercadoOntem, { amount: 50, date: '2026-10-06' }, contexto);
  assert.deepEqual(semNbsp(linhasDaAlteracao(mercadoOntem, campos, contexto)), [
    { key: 'edit-target', label: 'Lançamento', value: 'Mercado' },
    { key: 'edit-account', label: 'Conta', value: 'Itaú' },
    { key: 'edit-change-amount', label: 'Valor', value: 'R$ 32,00 → R$ 50,00', emphasis: true },
    { key: 'edit-change-date', label: 'Data', value: '07/10/2026 → 06/10/2026', emphasis: true },
  ]);
  assert.equal(
    semNbsp(textoDaAlteracao(mercadoOntem, campos)),
    'Vou alterar Mercado de 07/10/2026: valor de R$ 32,00 para R$ 50,00 e data de 07/10/2026 para 06/10/2026. Posso confirmar?',
  );
});

test('lista de escolha numera os lançamentos e avisa quando há mais', () => {
  assert.equal(
    semNbsp(textoDaEscolha([mercadoOntem, mercadoSemanaPassada], 7, contexto)),
    'Encontrei 7 lançamentos assim. Os 2 mais recentes são:\n1. Mercado, R$ 32,00, Itaú, 07/10/2026\n2. Mercado Extra, R$ 85,00, Nubank, 30/09/2026\nQual deles você quer alterar?',
  );
});

test('ajuste falado com o card na tela vale para o mesmo lançamento', () => {
  for (const [frase, mudancas] of [
    ['não, pra 60', { amount: 60 }],
    ['Não, foi 60 reais.', { amount: 60 }],
    ['na verdade foi 60', { amount: 60 }],
    ['muda a data pra anteontem', { date: '2026-10-06' }],
    ['e pro Nubank', { accountId: 'nubank' }],
  ]) {
    assert.deepEqual(lerAjusteDaAlteracao(frase, contexto)?.mudancas, mudancas, frase);
  }
  assert.equal(lerAjusteDaAlteracao('gastei 50 no mercado', contexto), null);
  assert.equal(lerAjusteDaAlteracao('foi quanto?', contexto), null);
});

test('texto de sucesso diz como o lançamento ficou', () => {
  assert.equal(
    semNbsp(textoDaAlteracaoFeita(mercadoOntem, [{ campo: 'amount', antes: 32, depois: 50 }, { campo: 'account', antes: 'Itaú', depois: 'Nubank' }])),
    'Pronto, alterei Mercado. Agora está com valor R$ 50,00 e conta Nubank.',
  );
});

test('número de data não vira valor e valor com ponto ou vírgula fica inteiro', () => {
  assert.deepEqual(
    [analisarAlvo('mercado do dia 5', contexto).data, analisarAlvo('mercado do dia 5', contexto).valor],
    ['2026-10-05', null],
  );
  assert.deepEqual(
    [analisarAlvo('mercado de 05/10', contexto).data, analisarAlvo('mercado de 05/10', contexto).valor],
    ['2026-10-05', null],
  );
  // Sem ano e no futuro: é o do ano passado.
  assert.equal(analisarAlvo('mercado de 20/12', contexto).data, '2025-12-20');
  assert.equal(analisarAlvo('aluguel de 1.500', contexto).valor, 1500);
  assert.equal(analisarAlvo('mercado de ontem de 32,50', contexto).valor, 32.5);
  assert.deepEqual(analisarAlvo('aluguel de 1.500', contexto).palavras, ['aluguel']);
  assert.deepEqual(
    interpretarPedidoDeEdicao('corrige o aluguel de 1.500 pra 1.600', contexto),
    { forma: FORMAS_DE_EDICAO.VERBO, alvo: 'aluguel de 1.500', mudancas: { amount: 1600 } },
  );
});

test('substantivo com verbo de edição é lançamento novo', () => {
  for (const frase of ['Troca de óleo do carro por 200 reais', 'troca de pneu por 300', 'Ajuste do relógio por 50 reais']) {
    assert.equal(interpretarPedidoDeEdicao(frase, contexto), null, frase);
  }
  // Com o nome do campo, "do" é só a ligação.
  assert.deepEqual(
    interpretarPedidoDeEdicao('muda o valor do pneu pra 300', contexto),
    { forma: FORMAS_DE_EDICAO.VERBO, alvo: 'pneu', mudancas: { amount: 300 } },
  );
});

test('descrição nova pode ter "pra" no meio', () => {
  assert.deepEqual(
    interpretarPedidoDeEdicao('muda a descrição do presente pra Presente pra mãe', contexto),
    { forma: FORMAS_DE_EDICAO.VERBO, alvo: 'presente', mudancas: { description: 'Presente pra mãe' } },
  );
});

test('ajuste de descrição com o card na tela mantém caixa e acento', () => {
  assert.deepEqual(
    lerAjusteDaAlteracao('Não, muda a descrição pra Feira de Sábado', contexto)?.mudancas,
    { description: 'Feira de Sábado' },
  );
});

test('lançamento cancelado não é alterado', () => {
  assert.match(
    montarAlteracao({ ...mercadoOntem, status: 'canceled' }, { amount: 50 }, contexto).erro,
    /cancelado/,
  );
});

test('"a segunda" na lista é segunda-feira, não a segunda posição', () => {
  const daSegunda = lancamento({ id: 's', description: 'Mercado', amount: 40, transaction_date: '2026-10-05' });
  const lista = [mercadoOntem, mercadoSemanaPassada, daSegunda];
  assert.equal(escolherCandidato('a segunda', lista, contexto), daSegunda);
  assert.equal(escolherCandidato('o segundo', lista, contexto), mercadoSemanaPassada);
});

test('mudar a data de um realizado para depois de hoje vira previsto, e o card mostra', () => {
  const realizado = { ...mercadoOntem, status: 'completed' };
  const alteracao = montarAlteracao(realizado, { date: '2026-10-15' }, contexto);
  assert.deepEqual(alteracao.alteracoes, { transaction_date: '2026-10-15', status: 'pending' });
  const linhas = semNbsp(linhasDaAlteracao(realizado, alteracao.campos, contexto));
  assert.deepEqual(linhas.at(-1), {
    key: 'edit-change-status', label: 'Situação', value: 'realizado → previsto', emphasis: true,
  });
});

test('data de hoje ou passada não muda a situação', () => {
  const realizado = { ...mercadoOntem, status: 'completed' };
  assert.deepEqual(montarAlteracao(realizado, { date: HOJE }, contexto).alteracoes, { transaction_date: HOJE });
  const previsto = { ...mercadoOntem, status: 'pending', transaction_date: '2026-10-20' };
  assert.deepEqual(montarAlteracao(previsto, { date: '2026-10-25' }, contexto).alteracoes, { transaction_date: '2026-10-25' });
});
