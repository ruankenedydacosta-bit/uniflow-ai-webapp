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