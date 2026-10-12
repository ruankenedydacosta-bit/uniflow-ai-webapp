import assert from 'node:assert/strict';
import test from 'node:test';
import {
  lerData,
  linhaDeApoio,
  mesesEntre,
  mesesSemAporte,
  resumirMetasAtivas,
  seloDaMeta,
  separarPorAba,
} from './listaDeMetas.js';

function dataIso(data) {
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${data.getFullYear()}-${mes}-${dia}`;
}

function somarMeses(meses) {
  const data = new Date();
  data.setDate(1);
  data.setMonth(data.getMonth() + meses);
  return data;
}

test('lerData trata data pura como dia local, sem voltar um dia', () => {
  const data = lerData('2026-12-01');
  assert.equal(data.getFullYear(), 2026);
  assert.equal(data.getMonth(), 11);
  assert.equal(data.getDate(), 1);
  assert.equal(lerData(null), null);
  assert.equal(lerData('não é data'), null);
});

test('separarPorAba põe pausada em Ativas e ignora cancelada', () => {
  const { ativas, concluidas } = separarPorAba([
    { id: 'a', status: 'active' },
    { id: 'p', status: 'paused' },
    { id: 'c', status: 'completed' },
    { id: 'x', status: 'canceled' },
  ]);
  assert.deepEqual(ativas.map((m) => m.id), ['a', 'p']);
  assert.deepEqual(concluidas.map((m) => m.id), ['c']);
});

test('resumirMetasAtivas deixa pausada e concluída fora do topo', () => {
  const resumo = resumirMetasAtivas([
    { status: 'active', current_amount: 6800, target_amount: 10000 },
    { status: 'active', current_amount: '1200', target_amount: '4000' },
    { status: 'paused', current_amount: 400, target_amount: 4000 },
    { status: 'completed', current_amount: 5000, target_amount: 5000 },
  ]);
  assert.deepEqual(resumo, { quantidade: 2, guardado: 8000, total: 14000, progresso: 57 });
});

test('resumirMetasAtivas sem meta ativa não divide por zero', () => {
  assert.deepEqual(resumirMetasAtivas([]), { quantidade: 0, guardado: 0, total: 0, progresso: 0 });
});

test('seloDaMeta: pausada e concluída têm selo próprio; sem datas não há ritmo', () => {
  assert.deepEqual(seloDaMeta({ status: 'paused' }), { rotulo: 'Pausada', tom: 'neutro' });
  assert.deepEqual(seloDaMeta({ status: 'completed' }), { rotulo: 'Concluída', tom: 'verde' });
  assert.equal(seloDaMeta({ status: 'active', current_amount: 0, target_amount: 100 }), null);
});

test('seloDaMeta: no ritmo, atenção e atrasada pelo progresso esperado', () => {
  const inicio = dataIso(somarMeses(-6));
  const fim = dataIso(somarMeses(6));
  const base = { status: 'active', target_amount: 1000, start_date: inicio, target_date: fim };
  assert.equal(seloDaMeta({ ...base, current_amount: 600 }).rotulo, 'No ritmo');
  assert.equal(seloDaMeta({ ...base, current_amount: 450 }).rotulo, 'Atenção');
  assert.equal(seloDaMeta({ ...base, current_amount: 100 }).rotulo, 'Atrasada');
});

test('mesesEntre conta mês cheio', () => {
  assert.equal(mesesEntre('2026-08-11', '2026-10-11'), 2);
  assert.equal(mesesEntre('2026-08-12', '2026-10-11'), 1);
  assert.equal(mesesEntre('2026-10-11', '2026-08-11'), 0);
});

test('mesesSemAporte usa o último aporte e, sem aporte, o início da meta', () => {
  const hoje = new Date(2026, 9, 11);
  assert.equal(mesesSemAporte({ last_contribution_date: '2026-07-01', start_date: '2026-01-01' }, hoje), 3);
  assert.equal(mesesSemAporte({ last_contribution_date: null, start_date: '2026-08-01' }, hoje), 2);
  assert.equal(mesesSemAporte({}, hoje), 0);
});

test('linhaDeApoio avisa quem está sem aporte há 2 meses ou mais', () => {
  const meta = {
    status: 'active',
    current_amount: 400,
    target_amount: 4000,
    start_date: dataIso(somarMeses(-6)),
    last_contribution_date: dataIso(somarMeses(-3)),
  };
  assert.match(linhaDeApoio(meta), /^Sem aporte há \d+ meses$/);
});

test('linhaDeApoio no ritmo mostra o valor do mês e o alvo', () => {
  const alvo = somarMeses(6);
  const meta = {
    status: 'active',
    current_amount: 600,
    target_amount: 1000,
    start_date: dataIso(somarMeses(-6)),
    target_date: dataIso(alvo),
    last_contribution_date: dataIso(new Date()),
  };
  const linha = linhaDeApoio(meta);
  assert.match(linha, /^R\$\s?\d+,\d{2} por mês · alvo em /);
  const mes = new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(alvo);
  assert.ok(linha.includes(mes), linha);
});

test('linhaDeApoio fora do ritmo mostra quanto falta', () => {
  const meta = {
    status: 'active',
    current_amount: 1200,
    target_amount: 4000,
    start_date: dataIso(somarMeses(-6)),
    target_date: dataIso(somarMeses(2)),
    last_contribution_date: dataIso(new Date()),
  };
  assert.match(linhaDeApoio(meta), /^Faltam R\$\s?2\.800,00 · alvo em /);
});

test('linhaDeApoio sem data-alvo não fala de alvo', () => {
  const meta = { status: 'paused', current_amount: 100, target_amount: 300 };
  assert.match(linhaDeApoio(meta), /^Faltam R\$\s?200,00$/);
});

test('linhaDeApoio põe o ano quando o alvo não é deste ano', () => {
  const hoje = new Date(2026, 9, 11);
  const meta = { status: 'paused', current_amount: 0, target_amount: 300, target_date: '2027-03-10' };
  assert.match(linhaDeApoio(meta, hoje), /alvo em março de 2027$/);
});

test('linhaDeApoio de meta concluída e de valor alcançado', () => {
  assert.equal(
    linhaDeApoio({ status: 'completed', completed_at: '2026-03-12' }),
    'Concluída em 12 de março de 2026',
  );
  assert.equal(
    linhaDeApoio({ status: 'active', current_amount: 500, target_amount: 500 }),
    'Valor alcançado. Conclua a meta.',
  );
});
