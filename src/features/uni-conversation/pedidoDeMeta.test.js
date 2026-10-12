import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ACTION_KIND_META,
  montarPedidoDeMeta,
  respostaAoPedidoDeMeta,
  textoDaConsultaDeMetas,
  textoDaMeta,
  textoDaMetaComAportes,
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
  assert.equal(textoDoPedidoDeMetaFeito(pedido), 'Meta Reserva de emergência criada. Quando guardar dinheiro para ela, registre o aporte na tela Metas.');
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
  assert.match(montarPedidoDeMeta({ ...VAZIO, acao: 'editar', alvo: { id: 'x' }, valor: 1 }, { metas: [] }).erro, /ainda não tem metas em aberto/);
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
  assert.match(montarPedidoDeMeta({ ...VAZIO, acao: 'aportar' }, CONTEXTO).erro, /Não entendi o que fazer com a meta/);
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
