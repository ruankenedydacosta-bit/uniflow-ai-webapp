// Uni Engine — Sprint 1 (IA Conversacional): testes do conversor OpenAI tools.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildOpenAiToolsSchema } from './openAiToolsSchema.js';
import { FINANCIAL_READ_TOOL_NAMES, FINANCIAL_READ_TOOL_META } from './registry.js';

test('gera exatamente os 6 tools de leitura já aprovados, na mesma ordem', () => {
  const tools = buildOpenAiToolsSchema();
  assert.equal(tools.length, FINANCIAL_READ_TOOL_NAMES.length);
  assert.deepEqual(tools.map((t) => t.function.name), FINANCIAL_READ_TOOL_NAMES);
});

test('cada tool respeita o formato exigido pela OpenAI (type:function, function.parameters é JSON Schema)', () => {
  for (const tool of buildOpenAiToolsSchema()) {
    assert.equal(tool.type, 'function');
    assert.equal(typeof tool.function.name, 'string');
    assert.equal(typeof tool.function.description, 'string');
    assert.equal(tool.function.parameters.type, 'object');
    assert.equal(typeof tool.function.parameters.properties, 'object');
  }
});

test('descrição de cada tool é reaproveitada de FINANCIAL_READ_TOOL_META (nenhuma duplicação)', () => {
  const tools = buildOpenAiToolsSchema();
  for (const tool of tools) {
    assert.equal(tool.function.description, FINANCIAL_READ_TOOL_META[tool.function.name].description);
  }
});

test('campos obrigatórios do schema interno viram "required" no JSON Schema', () => {
  const tools = buildOpenAiToolsSchema();
  const compare = tools.find((t) => t.function.name === 'compare_financial_periods');
  assert.deepEqual(compare.function.parameters.required.sort(), ['periodA', 'periodB']);
  assert.ok(Object.prototype.hasOwnProperty.call(compare.function.parameters.properties, 'compare_type'));
});

test('tool sem campos (get_recurring_expenses) gera properties vazio e sem "required"', () => {
  const tools = buildOpenAiToolsSchema();
  const recurring = tools.find((t) => t.function.name === 'get_recurring_expenses');
  assert.deepEqual(recurring.function.parameters.properties, {});
  assert.equal('required' in recurring.function.parameters, false);
});

test('resultado é sempre JSON-safe e determinístico entre chamadas', () => {
  const first = buildOpenAiToolsSchema();
  const second = buildOpenAiToolsSchema();
  assert.doesNotThrow(() => JSON.stringify(first));
  assert.deepEqual(first, second);
});

test('nenhuma ferramenta de escrita é exposta (todas as 6 são reads=true/writes=false na origem)', () => {
  for (const name of FINANCIAL_READ_TOOL_NAMES) {
    assert.equal(FINANCIAL_READ_TOOL_META[name].writes, false);
  }
});
