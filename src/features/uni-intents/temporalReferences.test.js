// Testes do resolvedor de referências temporais (veio do uni-engine, Fase 16).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTemporalReferences } from './temporalReferences.js';

test('temporal: texto vazio retorna out_of_scope', () => {
  const result = resolveTemporalReferences('');
  assert.equal(result.status, 'out_of_scope');
  assert.equal(result.confidence, 0);
});

test('temporal: "este mês" resolve para mês corrente', () => {
  const result = resolveTemporalReferences('este mês', '2026-08-15');
  assert.equal(result.status, 'resolved');
  assert.equal(result.resolved.type, 'current_month');
  assert.equal(result.resolved.start, '2026-08-01');
  assert.equal(result.resolved.end, '2026-08-31');
});

test('temporal: "mês passado" resolve para mês anterior', () => {
  const result = resolveTemporalReferences('mês passado', '2026-08-15');
  assert.equal(result.status, 'resolved');
  assert.equal(result.resolved.type, 'previous_month');
  assert.equal(result.resolved.start, '2026-07-01');
  assert.equal(result.resolved.end, '2026-07-31');
});

test('temporal: "últimos 3 meses" resolve janela de 3 meses', () => {
  const result = resolveTemporalReferences('últimos 3 meses', '2026-08-15');
  assert.equal(result.status, 'resolved');
  assert.equal(result.resolved.type, 'last_n_months');
  assert.equal(result.resolved.n, 3);
});

test('temporal: "janeiro 2026" resolve mês específico', () => {
  const result = resolveTemporalReferences('janeiro 2026', '2026-08-15');
  assert.equal(result.status, 'resolved');
  assert.equal(result.resolved.type, 'specific_month');
  assert.equal(result.resolved.year, 2026);
  assert.equal(result.resolved.month, 1);
});

test('temporal: "desde 01/01/2026" resolve data inicial', () => {
  const result = resolveTemporalReferences('desde 01/01/2026', '2026-08-15');
  assert.equal(result.status, 'resolved');
  assert.equal(result.resolved.type, 'since_date');
  assert.equal(result.resolved.date, '2026-01-01');
});

test('temporal: "até 31/12/2026" resolve data final', () => {
  const result = resolveTemporalReferences('até 31/12/2026', '2026-08-15');
  assert.equal(result.status, 'resolved');
  assert.equal(result.resolved.type, 'until_date');
  assert.equal(result.resolved.date, '2026-12-31');
});

test('temporal: "15/01/2026 a 20/01/2026" resolve range de datas', () => {
  const result = resolveTemporalReferences('15/01/2026 a 20/01/2026', '2026-08-15');
  assert.equal(result.status, 'resolved');
  assert.equal(result.resolved.type, 'specific_date_range');
  assert.equal(result.resolved.start, '2026-01-15');
  assert.equal(result.resolved.end, '2026-01-20');
});

test('temporal: texto ambíguo retorna ambiguous', () => {
  const result = resolveTemporalReferences('algum dia', '2026-08-15');
  assert.equal(result.status, 'ambiguous');
});

// ============================================================================
// Sprint 3 — correção do bug de fuso horário na ORIGEM (mesma causa raiz de
// resolveRuntimeTemporal.js/Fase 17: `new Date(referenceDate)` + getters
// LOCAIS deslocava o resultado em 1 dia em fusos de offset negativo, ex.
// America/Sao_Paulo -- o fuso real deste ambiente de testes).
// ============================================================================

test('Sprint 3 (fuso horário): "este mês"/"mês passado" com referenceDate no primeiro dia do mês', () => {
  const thisMonth = resolveTemporalReferences('este mês', '2026-08-01');
  assert.equal(thisMonth.resolved.start, '2026-08-01');
  assert.equal(thisMonth.resolved.end, '2026-08-31');
  const lastMonth = resolveTemporalReferences('mês passado', '2026-08-01');
  assert.equal(lastMonth.resolved.start, '2026-07-01');
  assert.equal(lastMonth.resolved.end, '2026-07-31');
});

test('Sprint 3 (fuso horário): virada de ano -- "mês passado" e "últimos 3 meses" a partir de 1º de janeiro', () => {
  const lastMonth = resolveTemporalReferences('mês passado', '2026-01-01');
  assert.equal(lastMonth.resolved.start, '2025-12-01');
  assert.equal(lastMonth.resolved.end, '2025-12-31');
  const last3Months = resolveTemporalReferences('últimos 3 meses', '2026-01-01');
  assert.equal(last3Months.resolved.start, '2025-11-01');
  assert.equal(last3Months.resolved.end, '2026-01-31');
});

test('Sprint 3 (fuso horário): "últimos N dias" nunca deslocam 1 dia perto de virada de mês', () => {
  const result = resolveTemporalReferences('7 dias atrás', '2026-08-01');
  assert.equal(result.resolved.start, '2026-07-26');
  assert.equal(result.resolved.end, '2026-08-01');
});

test('Sprint 3 (fuso horário): "este ano" (year_to_date) com referenceDate em 1º de janeiro', () => {
  const result = resolveTemporalReferences('este ano', '2026-01-01');
  assert.equal(result.resolved.start, '2026-01-01');
  assert.equal(result.resolved.end, '2026-01-01');
});

test('Sprint 3 (fuso horário): mês nomeado sem ano, próximo à virada de ano', () => {
  // Em dezembro de 2026, janeiro já passou neste ano: resolve para 2026.
  const result = resolveTemporalReferences('janeiro', '2026-12-15');
  assert.equal(result.resolved.year, 2026);
});
