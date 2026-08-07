// Testes do Temporal Runtime (Fase 17, Bloco 4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveRuntimeTemporal,
  extractRuntimeTemporalEntities,
  getSupportedTemporalEntities,
  isValidTemporalEntity,
} from '../temporal/index.js';

test('temporal: "hoje" resolve para today', () => {
  const result = resolveRuntimeTemporal('hoje');
  assert.equal(result.entity, 'today');
  assert.equal(result.period, 'today');
  assert.ok(result.confidence > 0.8);
});

test('temporal: "ontem" resolve para yesterday', () => {
  const result = resolveRuntimeTemporal('ontem');
  assert.equal(result.entity, 'yesterday');
});

test('temporal: "esta semana" resolve para this_week', () => {
  const result = resolveRuntimeTemporal('esta semana');
  assert.equal(result.entity, 'this_week');
});

test('temporal: "semana passada" resolve para last_week', () => {
  const result = resolveRuntimeTemporal('semana passada');
  assert.equal(result.entity, 'last_week');
});

test('temporal: "este mês" resolve para this_month', () => {
  const result = resolveRuntimeTemporal('este mês');
  assert.equal(result.entity, 'this_month');
  assert.ok(result.start);
  assert.ok(result.end);
});

test('temporal: "mês passado" resolve para last_month', () => {
  const result = resolveRuntimeTemporal('mês passado');
  assert.equal(result.entity, 'last_month');
});

test('temporal: "julho 2026" resolve specific_month', () => {
  const result = resolveRuntimeTemporal('julho 2026');
  assert.equal(result.entity, 'specific_month');
  assert.equal(result.month, 7);
  assert.equal(result.year, 2026);
});

test('temporal: "2025" resolve specific_year', () => {
  const result = resolveRuntimeTemporal('2025');
  assert.equal(result.entity, 'specific_year');
  assert.equal(result.year, 2025);
});

test('temporal: "últimos 3 meses" resolve last_n_months', () => {
  const result = resolveRuntimeTemporal('últimos 3 meses');
  assert.equal(result.entity, 'last_n_months');
  assert.equal(result.n, 3);
});

test('temporal: "últimos 7 dias" resolve last_n_days', () => {
  const result = resolveRuntimeTemporal('últimos 7 dias');
  assert.equal(result.entity, 'last_n_days');
  assert.equal(result.n, 7);
});

test('temporal: "este ano" resolve this_year', () => {
  const result = resolveRuntimeTemporal('este ano');
  assert.equal(result.entity, 'this_year');
});

test('temporal: "ano passado" resolve last_year', () => {
  const result = resolveRuntimeTemporal('ano passado');
  assert.equal(result.entity, 'last_year');
});

test('temporal: "15/07/2026" resolve specific_date', () => {
  const result = resolveRuntimeTemporal('15/07/2026');
  assert.equal(result.entity, 'specific_date');
  assert.equal(result.date, '2026-07-15');
});

test('temporal: "01/07 a 31/07" resolve date_range', () => {
  const result = resolveRuntimeTemporal('01/07 a 31/07');
  assert.equal(result.entity, 'date_range');
  assert.ok(result.start);
  assert.ok(result.end);
});

test('temporal: texto ambíguo retorna null entity', () => {
  const result = resolveRuntimeTemporal('algum dia');
  assert.equal(result.entity, null);
  assert.equal(result.confidence, 0);
  assert.ok(result.suggestions);
});

test('temporal: extractRuntimeTemporalEntities encontra entidades', () => {
  const entities = extractRuntimeTemporalEntities('este mês e mês passado');
  assert.ok(entities.length >= 2);
  assert.ok(entities.some(e => e.type === 'this_month' || e.runtimeType === 'this_month'));
});

test('temporal: getSupportedTemporalEntities retorna lista', () => {
  const entities = getSupportedTemporalEntities();
  assert.ok(Array.isArray(entities));
  assert.ok(entities.includes('today'));
  assert.ok(entities.includes('this_month'));
  assert.ok(entities.includes('last_month'));
  assert.ok(entities.includes('specific_month'));
});

test('temporal: isValidTemporalEntity valida corretamente', () => {
  assert.ok(isValidTemporalEntity('this_month'));
  assert.ok(isValidTemporalEntity('last_month'));
  assert.ok(!isValidTemporalEntity('invalid_entity'));
});

test('temporal: resultado é serializável', () => {
  const result = resolveRuntimeTemporal('este mês');
  assert.doesNotThrow(() => JSON.stringify(result));
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});
// ============================================================================
// Sprint 3 — correção do bug de fuso horário na ORIGEM. O código antigo
// construía a data de referência com `new Date(referenceDate)` (uma string
// 'YYYY-MM-DD' vira meia-noite UTC) e depois lia/escrevia com getters
// LOCAIS -- em qualquer fuso de offset negativo (ex.: America/Sao_Paulo,
// UTC-3, que é o fuso real deste ambiente de testes), isso deslocava
// "esta semana"/"mês passado"/etc em 1 dia. Estes testes fixam datas de
// referência exatas e checam start/end literalmente -- os testes antigos
// acima só checavam o `entity`, nunca os valores, por isso nunca pegaram
// o bug.
// ============================================================================

test('Sprint 3 (fuso horário): "esta semana" a partir de uma quarta-feira -- segunda a domingo exatos', () => {
  // 2026-08-05 é uma quarta-feira.
  const result = resolveRuntimeTemporal('esta semana', '2026-08-05');
  assert.equal(result.start, '2026-08-03');
  assert.equal(result.end, '2026-08-09');
});

test('Sprint 3 (fuso horário): "semana passada" a partir da mesma quarta-feira', () => {
  const result = resolveRuntimeTemporal('semana passada', '2026-08-05');
  assert.equal(result.start, '2026-07-27');
  assert.equal(result.end, '2026-08-02');
});

test('Sprint 3 (fuso horário): "esta semana"/"semana passada" a partir de um DOMINGO (caso extremo do cálculo de início de semana)', () => {
  // 2026-08-09 é domingo.
  const thisWeek = resolveRuntimeTemporal('esta semana', '2026-08-09');
  assert.equal(thisWeek.start, '2026-08-03');
  assert.equal(thisWeek.end, '2026-08-09');
  const lastWeek = resolveRuntimeTemporal('semana passada', '2026-08-09');
  assert.equal(lastWeek.start, '2026-07-27');
  assert.equal(lastWeek.end, '2026-08-02');
});

test('Sprint 3 (fuso horário): "este mês"/"mês passado" com referenceDate no PRIMEIRO dia do mês -- caso mais sensível ao bug', () => {
  const thisMonth = resolveRuntimeTemporal('este mês', '2026-08-01');
  assert.equal(thisMonth.start, '2026-08-01');
  assert.equal(thisMonth.end, '2026-08-31');
  const lastMonth = resolveRuntimeTemporal('mês passado', '2026-08-01');
  assert.equal(lastMonth.start, '2026-07-01');
  assert.equal(lastMonth.end, '2026-07-31');
});

test('Sprint 3 (fuso horário): "este mês"/"mês que vem" com referenceDate no ÚLTIMO dia do mês', () => {
  const thisMonth = resolveRuntimeTemporal('este mês', '2026-08-31');
  assert.equal(thisMonth.start, '2026-08-01');
  assert.equal(thisMonth.end, '2026-08-31');
  const nextMonth = resolveRuntimeTemporal('mês que vem', '2026-08-31');
  assert.equal(nextMonth.start, '2026-09-01');
  assert.equal(nextMonth.end, '2026-09-30');
});

test('Sprint 3 (fuso horário): virada de ano -- "mês passado"/"ano passado" a partir de 1º de janeiro', () => {
  const lastMonth = resolveRuntimeTemporal('mês passado', '2026-01-01');
  assert.equal(lastMonth.start, '2025-12-01');
  assert.equal(lastMonth.end, '2025-12-31');
  const lastYear = resolveRuntimeTemporal('ano passado', '2026-01-01');
  assert.equal(lastYear.start, '2025-01-01');
  assert.equal(lastYear.end, '2025-12-31');
});

test('Sprint 3 (fuso horário): virada de ano -- "mês que vem" a partir de 31 de dezembro', () => {
  const nextMonth = resolveRuntimeTemporal('mês que vem', '2026-12-31');
  assert.equal(nextMonth.start, '2027-01-01');
  assert.equal(nextMonth.end, '2027-01-31');
});

test('Sprint 3 (fuso horário): "hoje"/"ontem" nunca deslocam 1 dia em nenhuma borda de mês/ano', () => {
  assert.equal(resolveRuntimeTemporal('hoje', '2026-01-01').start, '2026-01-01');
  assert.equal(resolveRuntimeTemporal('ontem', '2026-01-01').start, '2025-12-31');
  assert.equal(resolveRuntimeTemporal('hoje', '2026-03-01').start, '2026-03-01');
  assert.equal(resolveRuntimeTemporal('ontem', '2026-03-01').start, '2026-02-28');
});

test('Sprint 3 (fuso horário): "últimos 7/30 dias" contam a partir da referência, inclusive, sem deslocamento', () => {
  const last7 = resolveRuntimeTemporal('últimos 7 dias', '2026-08-05');
  assert.equal(last7.start, '2026-07-30');
  assert.equal(last7.end, '2026-08-05');
  const last30 = resolveRuntimeTemporal('últimos 30 dias', '2026-01-05');
  assert.equal(last30.start, '2025-12-07');
  assert.equal(last30.end, '2026-01-05');
});

test('Sprint 3 (fuso horário): "este ano"/"ano passado" com referenceDate em 31 de dezembro', () => {
  const thisYear = resolveRuntimeTemporal('este ano', '2026-12-31');
  assert.equal(thisYear.start, '2026-01-01');
  assert.equal(thisYear.end, '2026-12-31');
});
