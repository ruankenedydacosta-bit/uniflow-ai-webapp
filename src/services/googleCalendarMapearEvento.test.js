// Épico #98 (#101): evento do Google -> item da agenda, e a decisão de cada
// evento na importação (mapearEvento.js).
import assert from 'node:assert/strict';
import test from 'node:test';
import { montarEventoGoogle } from '../../supabase/functions/_shared/googleCalendar/eventoGoogle.js';
import {
  camposDaAtualizacao,
  decidirImportacao,
  instanteNoFuso,
  janelaDeImportacao,
  mapearEvento,
  passaNoCorte,
  planejarLote,
  TITULO_PADRAO,
} from '../../supabase/functions/_shared/googleCalendar/mapearEvento.js';

const ESPACO = '11111111-1111-4111-8111-111111111111';
const OUTRO_ESPACO = '33333333-3333-4333-8333-333333333333';
const AGORA = new Date('2026-10-13T12:00:00.000Z');
const JANELA = janelaDeImportacao(AGORA);

function eventoComHorario(extra = {}) {
  return {
    id: 'evt1',
    etag: '"e1"',
    status: 'confirmed',
    updated: '2026-10-13T10:00:00.000Z',
    summary: 'Dentista',
    description: 'Levar exames',
    location: 'Rua A, 10',
    start: { dateTime: '2026-10-20T14:00:00-03:00', timeZone: 'America/Sao_Paulo' },
    end: { dateTime: '2026-10-20T15:00:00-03:00', timeZone: 'America/Sao_Paulo' },
    ...extra,
  };
}

function itemAtual(extra = {}) {
  return {
    id: 'item-1',
    item_type: 'meeting',
    title: 'Dentista',
    description: 'Levar exames',
    location: 'Rua A, 10',
    starts_at: '2026-10-20T17:00:00+00:00',
    ends_at: '2026-10-20T18:00:00+00:00',
    is_all_day: false,
    has_explicit_time: true,
    status: 'scheduled',
    updated_at: '2026-10-12T09:00:00.123456+00:00',
    ...extra,
  };
}

const VINCULO = { id: 'link-1', agenda_item_id: 'item-1', etag: '"e0"', origin: 'provider' };

function decidir(bruto, { vinculo = VINCULO, item = itemAtual(), escritoPelaImportacao = false, corte = null } = {}) {
  return decidirImportacao({
    evento: mapearEvento(bruto, { workspaceId: ESPACO }), vinculo, item, escritoPelaImportacao, janela: JANELA, corte,
  });
}

test('janela de importação: 30 dias antes a 365 dias depois', () => {
  assert.deepEqual(JANELA, { inicio: '2026-09-13T12:00:00.000Z', fim: '2027-10-13T12:00:00.000Z' });
});

test('instanteNoFuso: meia-noite de São Paulo e a virada do horário de verão em outro fuso', () => {
  assert.equal(instanteNoFuso('2026-10-15'), '2026-10-15T03:00:00.000Z');
  assert.equal(instanteNoFuso('2026-10-15', { hora: 23, minuto: 30 }), '2026-10-16T02:30:00.000Z');
  assert.equal(instanteNoFuso('2026-03-08', { hora: 3 }, 'America/New_York'), '2026-03-08T07:00:00.000Z');
  assert.equal(instanteNoFuso('15/10/2026'), null);
});

test('evento com horário vira meeting com início e fim', () => {
  const { campos, ignorar } = mapearEvento(eventoComHorario(), { workspaceId: ESPACO });
  assert.equal(ignorar, null);
  assert.deepEqual(campos, {
    title: 'Dentista',
    description: 'Levar exames',
    location: 'Rua A, 10',
    starts_at: '2026-10-20T17:00:00.000Z',
    ends_at: '2026-10-20T18:00:00.000Z',
    is_all_day: false,
    has_explicit_time: true,
    item_type: 'meeting',
  });
});

test('evento de dia inteiro vira other; vários dias guardam o último dia em ends_at', () => {
  const umDia = mapearEvento({ id: 'a', start: { date: '2026-10-20' }, end: { date: '2026-10-21' } }, { workspaceId: ESPACO });
  assert.equal(umDia.campos.item_type, 'other');
  assert.equal(umDia.campos.is_all_day, true);
  assert.equal(umDia.campos.has_explicit_time, false);
  assert.equal(umDia.campos.starts_at, '2026-10-20T03:00:00.000Z');
  assert.equal(umDia.campos.ends_at, null);

  const tresDias = mapearEvento({ id: 'b', start: { date: '2026-10-20' }, end: { date: '2026-10-23' } }, { workspaceId: ESPACO });
  assert.equal(tresDias.campos.ends_at, '2026-10-22T03:00:00.000Z');

  // Na volta ao Google, a mesma duração (end.date exclusivo).
  const deVolta = montarEventoGoogle({ id: 'x', workspace_id: ESPACO, title: 'Férias', ...tresDias.campos });
  assert.deepEqual([deVolta.start.date, deVolta.end.date], ['2026-10-20', '2026-10-23']);
});

test('sem título vira "Sem título"; texto vazio vira null; fim antes do início é descartado', () => {
  const { campos } = mapearEvento(eventoComHorario({
    summary: '  ',
    description: '',
    location: undefined,
    end: { dateTime: '2026-10-20T13:00:00-03:00' },
  }), { workspaceId: ESPACO });
  assert.equal(campos.title, TITULO_PADRAO);
  assert.equal(campos.description, null);
  assert.equal(campos.location, null);
  assert.equal(campos.ends_at, null);
});

test('evento com a marca de outro espaço é ignorado', () => {
  const evento = mapearEvento(eventoComHorario({
    extendedProperties: { private: { uniflow_item_id: 'i', uniflow_workspace_id: OUTRO_ESPACO } },
  }), { workspaceId: ESPACO });
  assert.equal(evento.ignorar, 'outro_espaco');
  assert.equal(decidir(eventoComHorario({
    extendedProperties: { private: { uniflow_workspace_id: OUTRO_ESPACO } },
  }), { vinculo: null, item: null }).tipo, 'ignorar');
});

test('evento novo: entra; privado, confidencial, cancelado, gravado pelo app e fora da janela não entram', () => {
  const novo = (extra) => decidir(eventoComHorario(extra), { vinculo: null, item: null });
  assert.equal(novo({}).tipo, 'inserir');
  assert.equal(novo({ visibility: 'private' }).motivo, 'privado');
  assert.equal(novo({ visibility: 'confidential' }).motivo, 'privado');
  assert.equal(novo({ status: 'cancelled' }).motivo, 'cancelado');
  assert.equal(novo({ extendedProperties: { private: { uniflow_workspace_id: ESPACO } } }).motivo, 'gravado_pelo_app');
  assert.equal(novo({ start: { dateTime: '2028-01-01T10:00:00Z' }, end: { dateTime: '2028-01-01T11:00:00Z' } }).motivo, 'fora_da_janela');
  assert.equal(novo({ start: { dateTime: '2026-08-01T10:00:00Z' }, end: { dateTime: '2026-08-01T11:00:00Z' } }).motivo, 'fora_da_janela');
});

test('privado não leva título nem descrição adiante', () => {
  const evento = mapearEvento(eventoComHorario({ visibility: 'private' }), { workspaceId: ESPACO });
  assert.equal(evento.naoEntra, 'privado');
  assert.equal(evento.campos, null);
});

test('local de trabalho, ausência, foco e convite recusado não entram', () => {
  const novo = (extra) => decidir(eventoComHorario(extra), { vinculo: null, item: null });
  assert.equal(novo({ eventType: 'workingLocation' }).motivo, 'tipo_de_evento');
  assert.equal(novo({ eventType: 'outOfOffice' }).motivo, 'tipo_de_evento');
  assert.equal(novo({ eventType: 'focusTime' }).motivo, 'tipo_de_evento');
  assert.equal(novo({ eventType: 'birthday' }).motivo, 'tipo_de_evento');
  assert.equal(novo({ eventType: 'default' }).tipo, 'inserir');
  assert.equal(novo({ eventType: 'fromGmail' }).tipo, 'inserir');
  const recusado = { attendees: [{ email: 'outra@x', responseStatus: 'accepted' }, { email: 'eu@x', self: true, responseStatus: 'declined' }] };
  assert.equal(novo(recusado).motivo, 'recusado');
  // Já importado e recusado depois: cancela.
  assert.deepEqual(decidir(eventoComHorario(recusado)), { tipo: 'cancelar', motivo: 'recusado' });
});

test('mesmo etag do vínculo: só marca como visto', () => {
  assert.deepEqual(decidir(eventoComHorario({ etag: '"e0"', summary: 'Outro' })), { tipo: 'visto', motivo: 'mesmo_etag' });
});

test('conflito: o app mais novo vence e só grava remote_seen_at', () => {
  const decisao = decidir(eventoComHorario({ summary: 'Mudou no Google', updated: '2026-10-12T08:00:00.000Z' }));
  assert.deepEqual(decisao, { tipo: 'visto', motivo: 'app_mais_novo' });
});

test('conflito: o Google mais novo atualiza o item, sem trocar o tipo', () => {
  const decisao = decidir(eventoComHorario({ summary: 'Dentista (remarcado)', start: { dateTime: '2026-10-21T09:00:00-03:00' }, end: { dateTime: '2026-10-21T10:00:00-03:00' } }), {
    item: itemAtual({ item_type: 'appointment' }),
  });
  assert.equal(decisao.tipo, 'atualizar');
  assert.equal(decisao.campos.title, 'Dentista (remarcado)');
  assert.equal(decisao.campos.starts_at, '2026-10-21T12:00:00.000Z');
  assert.equal('item_type' in decisao.campos, false);
});

test('nada mudou no conteúdo: visto, sem regravar o item', () => {
  assert.deepEqual(decidir(eventoComHorario()), { tipo: 'visto', motivo: 'sem_mudanca' });
});

test('apagado no Google: cancela; já cancelado: visto', () => {
  assert.deepEqual(decidir(eventoComHorario({ status: 'cancelled' })), { tipo: 'cancelar' });
  assert.equal(decidir(eventoComHorario({ status: 'cancelled' }), { item: itemAtual({ status: 'cancelled' }) }).tipo, 'visto');
});

test('item cancelado no app não é reaberto por uma edição no Google', () => {
  const decisao = decidir(eventoComHorario({ description: 'Nova pauta' }), { item: itemAtual({ status: 'cancelled' }) });
  assert.equal(decisao.tipo, 'atualizar');
  assert.equal('status' in decisao.campos, false);
});

test('última gravação foi da importação: o Google vence mesmo com updated_at maior', () => {
  // A importação gravou a versão anterior às 12h; o Google mudou às 11h59,
  // entre a listagem e a gravação.
  const item = itemAtual({ updated_at: '2026-10-13T12:00:00.000+00:00' });
  const evento = eventoComHorario({ summary: 'Mudou durante o sync', updated: '2026-10-13T11:59:00.000Z' });
  assert.equal(decidir(evento, { item }).tipo, 'visto');
  assert.equal(decidir(evento, { item, escritoPelaImportacao: true }).tipo, 'atualizar');
});

test('sync completo repetido não traz de volta evento antigo sem vínculo (item excluído no app)', () => {
  const corte = { desde: '2026-10-10T00:00:00.000Z', fimDaJanelaAnterior: '2027-10-10T00:00:00.000Z' };
  const antigo = eventoComHorario({ updated: '2026-10-01T00:00:00.000Z' });
  assert.deepEqual(decidir(antigo, { vinculo: null, item: null, corte }), { tipo: 'ignorar', motivo: 'anterior_ao_ultimo_completo' });
  assert.equal(decidir(eventoComHorario({ updated: '2026-10-11T00:00:00.000Z' }), { vinculo: null, item: null, corte }).tipo, 'inserir');
  // Ocorrência que acabou de entrar na janela entra mesmo sem mudança.
  const novaNaJanela = mapearEvento(eventoComHorario({
    updated: '2026-01-01T00:00:00.000Z', start: { dateTime: '2027-10-11T10:00:00Z' }, end: { dateTime: '2027-10-11T11:00:00Z' },
  }), { workspaceId: ESPACO });
  assert.equal(passaNoCorte(novaNaJanela, corte), true);
  assert.equal(passaNoCorte(mapearEvento(antigo, { workspaceId: ESPACO }), null), true);
});

test('ficou privado: cancela o item que veio do Google e deixa o item criado no app', () => {
  assert.deepEqual(decidir(eventoComHorario({ visibility: 'private' })), { tipo: 'cancelar', motivo: 'privado' });
  assert.equal(decidir(eventoComHorario({ visibility: 'private' }), { vinculo: { ...VINCULO, origin: 'app' } }).tipo, 'visto');
});

test('pagamento: data local igual mantém starts_at e is_all_day', () => {
  const item = itemAtual({
    item_type: 'payment_due', starts_at: '2026-10-20T02:30:00+00:00', ends_at: null, is_all_day: false, has_explicit_time: true,
  });
  const campos = camposDaAtualizacao(item, mapearEvento({
    id: 'p', summary: 'Aluguel', start: { date: '2026-10-19' }, end: { date: '2026-10-20' },
  }, { workspaceId: ESPACO }).campos);
  assert.equal(campos.title, 'Aluguel');
  assert.equal(campos.starts_at, item.starts_at);
  assert.equal(campos.is_all_day, false);
  assert.equal(campos.has_explicit_time, true);
});

test('pagamento: data diferente troca só a data e mantém a hora local', () => {
  const item = itemAtual({
    item_type: 'receivable', starts_at: '2026-10-20T02:30:00+00:00', ends_at: null, is_all_day: false, has_explicit_time: true,
  });
  // 19/10 às 23h30 em São Paulo; o Google mostra o dia inteiro 19/10, movido para 25/10.
  const campos = camposDaAtualizacao(item, mapearEvento({
    id: 'p', summary: 'Recebimento', start: { date: '2026-10-25' }, end: { date: '2026-10-26' },
  }, { workspaceId: ESPACO }).campos);
  assert.equal(campos.starts_at, '2026-10-26T02:30:00.000Z');
  assert.equal(campos.is_all_day, false);
  assert.equal(campos.has_explicit_time, true);
  assert.equal(campos.ends_at, null);
});

test('item sem horário continua sem horário quando o Google move o dia', () => {
  const item = itemAtual({ item_type: 'task', starts_at: '2026-10-20T03:00:00+00:00', ends_at: null, is_all_day: false, has_explicit_time: false });
  const campos = camposDaAtualizacao(item, mapearEvento({ id: 't', summary: 'Tarefa', start: { date: '2026-10-22' }, end: { date: '2026-10-23' } }, { workspaceId: ESPACO }).campos);
  assert.equal(campos.starts_at, '2026-10-22T03:00:00.000Z');
  assert.equal(campos.is_all_day, false);
  assert.equal(campos.has_explicit_time, false);
});

test('item com horário e sem fim volta sem fim quando o Google mantém os 30 minutos', () => {
  const item = itemAtual({ ends_at: null });
  const campos = camposDaAtualizacao(item, mapearEvento(eventoComHorario({
    summary: 'Novo título', end: { dateTime: '2026-10-20T14:30:00-03:00' },
  }), { workspaceId: ESPACO }).campos);
  assert.equal(campos.ends_at, null);
});

test('planejarLote: monta as operações da RPC com o updated_at como veio do banco', () => {
  const operacoes = planejarLote({
    eventos: [
      eventoComHorario({ id: 'novo', etag: '"n1"' }),
      eventoComHorario({ id: 'evt1', etag: '"e2"', summary: 'Remarcado' }),
      eventoComHorario({ id: 'privado-novo', visibility: 'private' }),
      { id: 'apagado', status: 'cancelled', etag: '"c"', updated: '2026-10-13T11:00:00Z' },
    ],
    estado: [
      { external_id: 'evt1', vinculo: VINCULO, item: itemAtual(), escrito_pela_importacao: false },
      { external_id: 'apagado', vinculo: { ...VINCULO, id: 'link-2', agenda_item_id: 'item-2' }, item: itemAtual({ id: 'item-2' }) },
    ],
    workspaceId: ESPACO,
    janela: JANELA,
  });

  assert.deepEqual(operacoes.map((operacao) => [operacao.tipo, operacao.external_id]), [
    ['inserir', 'novo'],
    ['atualizar', 'evt1'],
    ['cancelar', 'apagado'],
  ]);
  assert.equal(operacoes[0].campos.item_type, 'meeting');
  assert.equal(operacoes[0].etag, '"n1"');
  assert.equal(operacoes[1].agenda_item_id, 'item-1');
  assert.equal(operacoes[1].esperado_updated_at, '2026-10-12T09:00:00.123456+00:00');
  assert.equal(operacoes[2].agenda_item_id, 'item-2');
});

test('planejarLote: vínculo existente com evento ilegível ainda é marcado como visto', () => {
  const operacoes = planejarLote({
    eventos: [{ id: 'evt1', etag: '"x"', updated: '2026-10-13T11:00:00Z', start: {}, end: {} }],
    estado: [{ external_id: 'evt1', vinculo: VINCULO, item: itemAtual() }],
    workspaceId: ESPACO,
    janela: JANELA,
  });
  assert.deepEqual(operacoes, [{ tipo: 'visto', external_id: 'evt1' }]);
});
