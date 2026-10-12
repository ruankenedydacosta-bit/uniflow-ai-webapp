import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ACTION_KIND_META,
  metaTemDinheiro,
  montarPedidoDeMeta,
  respostaAoPedidoDeMeta,
  textoDaConsultaDeMetas,
  textoDaMeta,
  textoDaMetaComAportes,
  textoDoErroDoMovimento,
  textoDoPedidoDeMetaFeito,
} from './pedidoDeMeta.js';

const METAS = [
  { id: 'meta-via', name: 'Viagem para o Chile', status: 'active', target_amount: 8000, current_amount: 3200, target_date: '2027-07-31', planned_monthly_amount: null, archived_at: null },
  { id: 'meta-cas', name: 'Casamento', status: 'paused', target_amount: 20000, current_amount: 0, target_date: null, planned_monthly_amount: 500, archived_at: null },
  { id: 'meta-ok', name: 'Notebook', status: 'completed', target_amount: 5000, current_amount: 5000, target_date: null, planned_monthly_amount: null, archived_at: null },
];
const CONTEXTO = { metas: METAS, hoje: '2026-10-02' };
const VAZIO = { acao: null, alvo: null, nome: null, valor: null, data: null, porMes: null, ajustes: [] };

test('criar: card com nome, valor, prazo e por mês; payload no formato da tela Metas', () => {
  const pedido = montarPedidoDeMeta({ ...VAZIO, acao: 'criar', nome: 'reserva de emergência', valor: 6000, data: '2027-03-31', porMes: 500 }, CONTEXTO);
  assert.equal(pedido.nome, 'Reserva de emergência');
  assert.equal(pedido.texto, 'Vou criar a meta Reserva de emergência de R$ 6.000,00 até 31/03/2027, guardando R$ 500,00 por mês. Posso criar?');
  assert.deepEqual(pedido.card, {
    title: 'Criar meta',
    status: 'pending',
    actionKind: ACTION_KIND_META,
    editable: false,
    rows: [
      { label: 'Meta', value: 'Reserva de emergência' },
      { label: 'Valor', value: 'R$ 6.000,00' },
      { label: 'Prazo', value: '31/03/2027' },
      { label: 'Por mês', value: 'R$ 500,00' },
    ],
  });
  assert.deepEqual(pedido.payload, {
    name: 'Reserva de emergência',
    target_amount: 6000,
    target_date: '2027-03-31',
    planned_monthly_amount: 500,
    start_date: '2026-10-02',
    category: 'other',
    priority: 'medium',
  });
  // #161: o aporte já pode ser feito pela conversa.
  assert.equal(textoDoPedidoDeMetaFeito(pedido), 'Meta Reserva de emergência criada. Quando guardar dinheiro para ela, me diga quanto, como "guardei 200 na Reserva de emergência".');
  // Sem prazo nem por mês: o card e a frase ficam só com o essencial.
  const simples = montarPedidoDeMeta({ ...VAZIO, acao: 'criar', nome: 'Carro', valor: 40000 }, CONTEXTO);
  assert.equal(simples.texto, 'Vou criar a meta Carro de R$ 40.000,00. Posso criar?');
  assert.equal(simples.card.rows.length, 2);
  assert.equal('target_date' in simples.payload, false);
});

test('criar: sem nome, sem valor, prazo descartado ou nome repetido pede de novo em vez de montar o card', () => {
  assert.match(montarPedidoDeMeta({ ...VAZIO, acao: 'criar', valor: 500 }, CONTEXTO).erro, /Diga o nome da meta/);
  assert.equal(montarPedidoDeMeta({ ...VAZIO, acao: 'criar', nome: 'Carro' }, CONTEXTO).erro, 'Diga quanto você quer juntar na meta Carro.');
  assert.match(montarPedidoDeMeta({ ...VAZIO, acao: 'criar', nome: 'Carro', valor: 10, ajustes: ['data_descartada'] }, CONTEXTO).erro, /Não entendi o prazo/);
  assert.equal(
    montarPedidoDeMeta({ ...VAZIO, acao: 'criar', nome: 'viagem para o chile', valor: 10 }, CONTEXTO).erro,
    'Já existe uma meta chamada Viagem para o Chile. Diga outro nome ou peça para mudar essa.',
  );
  // Meta concluída não bloqueia o nome: ela saiu da lista de abertas.
  assert.equal(montarPedidoDeMeta({ ...VAZIO, acao: 'criar', nome: 'Notebook', valor: 10 }, CONTEXTO).erro, undefined);
});

test('editar: só os campos que mudam entram no card, no payload e na frase', () => {
  const pedido = montarPedidoDeMeta({ ...VAZIO, acao: 'editar', alvo: { id: 'meta-via' }, valor: 15000, data: '2027-12-31' }, CONTEXTO);
  assert.equal(pedido.texto, 'Vou alterar a meta Viagem para o Chile: valor de R$ 8.000,00 para R$ 15.000,00 e prazo de 31/07/2027 para 31/12/2027. Posso confirmar?');
  assert.deepEqual(pedido.payload, { target_amount: 15000, target_date: '2027-12-31' });
  assert.deepEqual(pedido.card.rows, [
    { label: 'Meta', value: 'Viagem para o Chile' },
    { key: 'goal-change-target_amount', label: 'Valor', value: 'R$ 8.000,00 → R$ 15.000,00', emphasis: true },
    { key: 'goal-change-target_date', label: 'Prazo', value: '31/07/2027 → 31/12/2027', emphasis: true },
  ]);
  assert.equal(pedido.card.title, 'Alterar meta');
  assert.equal(textoDoPedidoDeMetaFeito(pedido), 'Meta Viagem para o Chile alterada.');
  // Renomear mostra o nome novo e o texto de feito usa o nome novo.
  const renomear = montarPedidoDeMeta({ ...VAZIO, acao: 'editar', alvo: { id: 'meta-cas' }, nome: 'Festa de casamento', porMes: 800 }, CONTEXTO);
  assert.deepEqual(renomear.payload, { name: 'Festa de casamento', planned_monthly_amount: 800 });
  assert.equal(renomear.texto, 'Vou alterar a meta Casamento: nome de Casamento para Festa de casamento e por mês de R$ 500,00 para R$ 800,00. Posso confirmar?');
  assert.equal(textoDoPedidoDeMetaFeito(renomear), 'Meta Festa de casamento alterada.');
});

test('editar: alvo desconhecido, nada para mudar, valor igual ou nome repetido pedem de novo', () => {
  assert.equal(
    montarPedidoDeMeta({ ...VAZIO, acao: 'editar', alvo: null, valor: 10 }, CONTEXTO).erro,
    'Não encontrei essa meta. As suas metas em aberto são: Viagem para o Chile e Casamento.',
  );
  // Com o nome que a pessoa disse, a Uni diz qual não achou.
  assert.equal(
    montarPedidoDeMeta({ ...VAZIO, acao: 'editar', alvo: null, nome: 'carro', valor: 10 }, CONTEXTO).erro,
    'Não encontrei a meta Carro. As suas metas em aberto são: Viagem para o Chile e Casamento.',
  );
  // Mesmo nome com outra caixa não é renomear.
  assert.match(montarPedidoDeMeta({ ...VAZIO, acao: 'editar', alvo: { id: 'meta-via' }, nome: 'viagem para o chile' }, CONTEXTO).erro, /O que você quer mudar/);
  assert.equal(
    montarPedidoDeMeta({ ...VAZIO, acao: 'editar', alvo: { id: 'meta-via' } }, CONTEXTO).erro,
    'O que você quer mudar na meta Viagem para o Chile? Pode ser o nome, o valor, o prazo ou quanto guardar por mês.',
  );
  assert.match(montarPedidoDeMeta({ ...VAZIO, acao: 'editar', alvo: { id: 'meta-via' }, valor: 8000 }, CONTEXTO).erro, /O que você quer mudar/);
  assert.equal(
    montarPedidoDeMeta({ ...VAZIO, acao: 'editar', alvo: { id: 'meta-via' }, nome: 'casamento' }, CONTEXTO).erro,
    'Já existe uma meta chamada Casamento. Escolha outro nome.',
  );
  // Meta concluída não é alvo: a lista de abertas é a da aba Ativas.
  assert.match(montarPedidoDeMeta({ ...VAZIO, acao: 'editar', alvo: { id: 'meta-ok' }, valor: 1 }, CONTEXTO).erro, /Não encontrei essa meta/);
  // Sem nenhuma meta, a Uni ensina a criar.
  assert.match(montarPedidoDeMeta({ ...VAZIO, acao: 'editar', alvo: { id: 'x' }, valor: 1 }, { metas: [] }).erro, /não tem metas em aberto/);
});

test('excluir: card com valor e guardado; aporte registrado manda para a tela', () => {
  const pedido = montarPedidoDeMeta({ ...VAZIO, acao: 'excluir', alvo: { id: 'meta-via' } }, CONTEXTO);
  assert.equal(pedido.texto, 'Vou excluir a meta Viagem para o Chile. Posso excluir?');
  assert.deepEqual(pedido.card.rows, [
    { label: 'Meta', value: 'Viagem para o Chile' },
    { label: 'Valor', value: 'R$ 8.000,00' },
    { label: 'Guardado', value: 'R$ 3.200,00' },
  ]);
  assert.equal(textoDoPedidoDeMetaFeito(pedido), 'Meta Viagem para o Chile excluída.');
  assert.equal(textoDaMetaComAportes(METAS[0], 1), 'A meta Viagem para o Chile tem 1 aporte registrado. Para excluir, abra a tela Metas: lá você vê o que seria apagado.');
  assert.match(textoDaMetaComAportes(METAS[0], 3), /3 aportes registrados/);
  // Valor guardado sem aporte (valor inicial) também segura a exclusão.
  assert.equal(metaTemDinheiro(METAS[0], 0), true);
  assert.equal(metaTemDinheiro(METAS[1], 0), false);
  assert.equal(metaTemDinheiro(METAS[1], 2), true);
  assert.match(textoDaMetaComAportes(METAS[0], 0), /tem R\$\u00a03\.200,00 guardados\./);
  assert.match(montarPedidoDeMeta({ ...VAZIO, acao: 'arquivar' }, CONTEXTO).erro, /Não entendi o que fazer com a meta/);
});

test('consultar: uma meta diz guardado, falta, prazo e por mês; sem alvo resume as abertas', () => {
  const texto = textoDaMeta(METAS[0]);
  assert.match(texto, /^Meta Viagem para o Chile: R\$\u00a03\.200,00 guardados de R\$\u00a08\.000,00\. Faltam R\$\u00a04\.800,00 até 31\/07\/2027, cerca de R\$\u00a0[\d.,]+ por mês\.$/);
  assert.equal(textoDaMeta(METAS[2]), 'Meta Notebook: R$ 5.000,00 guardados de R$ 5.000,00. Você já chegou lá.');
  assert.equal(textoDaConsultaDeMetas({ ...VAZIO, acao: 'consultar', alvo: { id: 'meta-via' } }, CONTEXTO), texto);
  assert.equal(
    textoDaConsultaDeMetas({ ...VAZIO, acao: 'consultar' }, CONTEXTO),
    'Você tem 2 metas em aberto, com R$ 3.200,00 guardados de R$ 28.000,00: Viagem para o Chile, R$ 3.200,00 de R$ 8.000,00; Casamento, R$ 0,00 de R$ 20.000,00.',
  );
  assert.equal(textoDaConsultaDeMetas({ ...VAZIO, acao: 'consultar' }, { metas: [METAS[0]] }), texto);
  assert.match(textoDaConsultaDeMetas({ ...VAZIO, acao: 'consultar' }, { metas: [] }), /ainda não tem metas/);
  assert.match(textoDaConsultaDeMetas({ ...VAZIO, acao: 'consultar', alvo: { id: 'meta-ok' } }, CONTEXTO), /Não encontrei essa meta/);
  // Perguntou por uma meta fora da lista: não resume as outras.
  assert.equal(
    textoDaConsultaDeMetas({ ...VAZIO, acao: 'consultar', nome: 'Carro' }, CONTEXTO),
    'Não encontrei a meta Carro. As suas metas em aberto são: Viagem para o Chile e Casamento.',
  );
  // Mais de quatro: as outras ficam na tela.
  const muitas = Array.from({ length: 6 }, (_, i) => ({ ...METAS[1], id: `m${i}`, name: `Meta ${i + 1}` }));
  assert.match(textoDaConsultaDeMetas({ ...VAZIO, acao: 'consultar' }, { metas: muitas }), /As outras 2 estão na tela Metas\.$/);
});

test('resposta ao card: o verbo da ação confirma, "não" cancela, outro assunto segue', () => {
  const excluir = montarPedidoDeMeta({ ...VAZIO, acao: 'excluir', alvo: { id: 'meta-via' } }, CONTEXTO);
  assert.equal(respostaAoPedidoDeMeta('pode excluir', excluir), 'confirm');
  assert.equal(respostaAoPedidoDeMeta('sim, apaga a meta Viagem para o Chile', excluir), 'confirm');
  assert.equal(respostaAoPedidoDeMeta('não', excluir), 'cancel');
  assert.equal(respostaAoPedidoDeMeta('quanto gastei esse mês?', excluir), 'input');
  const criar = montarPedidoDeMeta({ ...VAZIO, acao: 'criar', nome: 'Carro', valor: 1000 }, CONTEXTO);
  assert.equal(respostaAoPedidoDeMeta('pode criar', criar), 'confirm');
  assert.equal(respostaAoPedidoDeMeta('confirmar', criar), 'confirm');
  const editar = montarPedidoDeMeta({ ...VAZIO, acao: 'editar', alvo: { id: 'meta-via' }, valor: 9000 }, CONTEXTO);
  assert.equal(respostaAoPedidoDeMeta('pode mudar', editar), 'confirm');
  assert.equal(respostaAoPedidoDeMeta('muda pra 12 mil', editar), 'input');
});

// #161: aporte e retirada pela conversa, com as regras da folha da tela.
const CONTAS = [
  { id: 'conta-poup', name: 'Poupança' },
  { id: 'conta-nu', name: 'Nubank' },
  { id: 'conta-itau', name: 'Itaú' },
];
const VIAGEM_VINCULADA = { ...METAS[0], linked_account_id: 'conta-poup' };
const COM_CONTAS = { metas: [VIAGEM_VINCULADA, METAS[1], METAS[2]], contas: CONTAS, hoje: '2026-10-02' };
const APORTE = { ...VAZIO, acao: 'aportar', alvo: { id: 'meta-via', name: 'Viagem para o Chile' }, valor: 400, conta: null, soNaMeta: false };

test('aportar: com a conta citada, card com a transferência para a conta vinculada e payload da folha', () => {
  const pedido = montarPedidoDeMeta({ ...APORTE, conta: { id: 'conta-nu', name: 'Nubank' } }, COM_CONTAS);
  assert.equal(pedido.texto, 'Vou registrar R$ 400,00 na meta Viagem para o Chile e lançar a transferência de Nubank para Poupança no Financeiro. Posso registrar?');
  assert.deepEqual(pedido.card.rows, [
    { label: 'Meta', value: 'Viagem para o Chile' },
    { label: 'Aporte', value: 'R$ 400,00', emphasis: true },
    { label: 'Data', value: '02/10/2026' },
    { label: 'Financeiro', value: 'Transferência de Nubank para Poupança' },
    { label: 'Guardado depois', value: 'R$ 3.600,00 de R$ 8.000,00' },
  ]);
  assert.equal(pedido.card.title, 'Registrar aporte');
  assert.deepEqual(pedido.payload, {
    amount: 400,
    contribution_date: '2026-10-02',
    linked_account_id: 'conta-nu',
    registrar_no_financeiro: true,
  });
  assert.equal(
    textoDoPedidoDeMetaFeito(pedido, { metaAtualizada: { current_amount: 3600, target_amount: 8000 } }),
    'Aporte de R$ 400,00 registrado na meta Viagem para o Chile. Agora ela tem R$ 3.600,00 de R$ 8.000,00. A transferência de Nubank para Poupança entrou no Financeiro.',
  );
});

test('aportar: várias contas e nenhuma citada pergunta a conta; a vinculada citada não conta como origem', () => {
  const pergunta = 'De qual conta saiu o dinheiro para a meta Viagem para o Chile: Nubank ou Itaú? Se não quiser lançar no Financeiro, diga "só na meta".';
  assert.equal(montarPedidoDeMeta(APORTE, COM_CONTAS).erro, pergunta);
  assert.equal(montarPedidoDeMeta({ ...APORTE, conta: { id: 'conta-poup', name: 'Poupança' } }, COM_CONTAS).erro, pergunta);
  // Uma conta só do outro lado já vem escolhida, como na folha.
  const umaSo = montarPedidoDeMeta(APORTE, { ...COM_CONTAS, contas: CONTAS.slice(0, 2) });
  assert.equal(umaSo.payload.linked_account_id, 'conta-nu');
});

test('aportar: só na meta, meta sem conta vinculada ou conta arquivada não lançam no Financeiro', () => {
  const soNaMeta = montarPedidoDeMeta({ ...APORTE, soNaMeta: true }, COM_CONTAS);
  assert.equal(soNaMeta.texto, 'Vou registrar R$ 400,00 na meta Viagem para o Chile, sem lançar no Financeiro. Posso registrar?');
  assert.deepEqual(soNaMeta.payload, { amount: 400, contribution_date: '2026-10-02', registrar_no_financeiro: false });
  assert.equal(soNaMeta.card.rows[3].value, 'Não lança');
  const semVinculada = montarPedidoDeMeta(APORTE, { ...COM_CONTAS, metas: METAS });
  assert.match(semVinculada.texto, /, sem lançar no Financeiro: a meta não tem conta vinculada\. Posso registrar\?$/);
  const arquivada = montarPedidoDeMeta(APORTE, { ...COM_CONTAS, contas: CONTAS.slice(1) });
  assert.match(arquivada.texto, /a conta vinculada à meta foi arquivada/);
  assert.equal(textoDoPedidoDeMetaFeito(soNaMeta), 'Aporte de R$ 400,00 registrado na meta Viagem para o Chile. Agora ela tem R$ 3.600,00 de R$ 8.000,00.');
});

test('retirar: transferência da conta vinculada para a escolhida; passar do guardado é bloqueado', () => {
  const pedido = montarPedidoDeMeta({ ...APORTE, acao: 'retirar', valor: 200, conta: { id: 'conta-itau', name: 'Itaú' }, data: '2026-10-01' }, COM_CONTAS);
  assert.equal(pedido.texto, 'Vou tirar R$ 200,00 da meta Viagem para o Chile com data de 01/10/2026 e lançar a transferência de Poupança para Itaú no Financeiro. Posso registrar?');
  assert.equal(pedido.payload.amount, -200);
  assert.equal(pedido.card.title, 'Retirar da meta');
  assert.equal(pedido.card.rows[4].value, 'R$ 3.000,00 de R$ 8.000,00');
  assert.equal(
    montarPedidoDeMeta({ ...APORTE, acao: 'retirar', valor: 5000 }, COM_CONTAS).erro,
    'A retirada passa do valor guardado. A meta Viagem para o Chile tem R$ 3.200,00.',
  );
  assert.match(montarPedidoDeMeta({ ...APORTE, acao: 'retirar', valor: 10 }, COM_CONTAS).erro, /^Para qual conta foi o dinheiro da meta/);
  assert.match(textoDoPedidoDeMetaFeito(pedido), /^Retirada de R\$\s200,00 registrada na meta Viagem para o Chile\. Agora ela tem R\$\s3\.000,00/);
});

test('aportar e retirar: meta pausada, concluída, fora da lista, sem valor ou data descartada', () => {
  const pausada = { ...APORTE, alvo: { id: 'meta-cas', name: 'Casamento' } };
  assert.equal(montarPedidoDeMeta(pausada, COM_CONTAS).erro, 'A meta Casamento está pausada. Para registrar um aporte, retome a meta na tela Metas.');
  // Pausada aceita retirada, como no banco. Sem nada guardado, a retirada passa do guardado.
  assert.match(montarPedidoDeMeta({ ...pausada, acao: 'retirar', valor: 1 }, COM_CONTAS).erro, /passa do valor guardado/);
  assert.equal(
    montarPedidoDeMeta({ ...APORTE, alvo: null, nome: 'notebook' }, COM_CONTAS).erro,
    'A meta Notebook está concluída e não recebe aporte nem retirada.',
  );
  assert.match(montarPedidoDeMeta({ ...APORTE, alvo: null, nome: 'Carro' }, COM_CONTAS).erro, /^Não encontrei a meta Carro\./);
  assert.equal(montarPedidoDeMeta({ ...APORTE, valor: null }, COM_CONTAS).erro, 'Quanto você guardou na meta Viagem para o Chile?');
  assert.equal(montarPedidoDeMeta({ ...APORTE, acao: 'retirar', valor: null }, COM_CONTAS).erro, 'Quanto você quer tirar da meta Viagem para o Chile?');
  assert.match(montarPedidoDeMeta({ ...APORTE, ajustes: ['data_descartada'] }, COM_CONTAS).erro, /Não entendi a data/);
});

test('aportar e retirar: resposta ao card e erro do banco na conversa', () => {
  const aporte = montarPedidoDeMeta({ ...APORTE, soNaMeta: true }, COM_CONTAS);
  assert.equal(respostaAoPedidoDeMeta('pode registrar', aporte), 'confirm');
  assert.equal(respostaAoPedidoDeMeta('pode guardar', aporte), 'confirm');
  assert.equal(respostaAoPedidoDeMeta('guardei 500 no casamento', aporte), 'input');
  const retirada = montarPedidoDeMeta({ ...APORTE, acao: 'retirar', valor: 100, soNaMeta: true }, COM_CONTAS);
  assert.equal(respostaAoPedidoDeMeta('pode tirar', retirada), 'confirm');
  assert.equal(respostaAoPedidoDeMeta('não', retirada), 'cancel');
  assert.equal(textoDoErroDoMovimento({ message: 'retirada_maior_que_guardado' }, 'retirar'), 'A retirada passa do valor guardado na meta.');
  assert.equal(textoDoErroDoMovimento({ message: 'meta_nao_recebe_aporte' }, 'retirar'), 'Esta meta não aceita retirada.');
  assert.match(textoDoErroDoMovimento({ message: 'meta_sem_conta_vinculada' }, 'aportar'), /Peça de novo/);
  assert.equal(textoDoErroDoMovimento({ message: 'outro' }, 'aportar'), 'Não foi possível registrar o aporte. Tente de novo.');
});
