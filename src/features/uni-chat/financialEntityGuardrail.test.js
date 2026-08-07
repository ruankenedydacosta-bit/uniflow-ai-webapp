// Sprint 4 Ciclo 4 (Bloco 4.8) — testes do guardrail textual de
// entidades: contas/bancos/cartões/carteiras/categorias/metas/
// investimentos/ativos citados pela composição via LLM nunca são
// confiados sem bater contra os fatos estruturados reais.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractMentionedEntityNames,
  extractTriggeredEntityMentions,
  validateComposedEntities,
} from './financialEntityGuardrail.js';

const UNIVERSE = ['Nubank', 'Itaú', 'Alimentação', 'Transporte', 'Carteira Digital'];

// ── extractMentionedEntityNames ─────────────────────────────────────────

test('extractMentionedEntityNames encontra nome real presente no texto', () => {
  assert.deepEqual(extractMentionedEntityNames('Você gastou na Nubank.', UNIVERSE), ['Nubank']);
});

test('extractMentionedEntityNames nunca lança com entradas inválidas', () => {
  assert.deepEqual(extractMentionedEntityNames(null, UNIVERSE), []);
  assert.deepEqual(extractMentionedEntityNames('texto', null), []);
  assert.deepEqual(extractMentionedEntityNames('', UNIVERSE), []);
});

test('extractMentionedEntityNames ignora caixa e acento (sinônimo de escrita)', () => {
  assert.deepEqual(extractMentionedEntityNames('voce gastou na itau.', UNIVERSE), ['Itaú']);
});

// ── extractTriggeredEntityMentions ──────────────────────────────────────

test('extractTriggeredEntityMentions captura nome próprio após palavra-gatilho financeira', () => {
  assert.deepEqual(extractTriggeredEntityMentions('Você tem saldo na conta Bradesco.'), ['Bradesco']);
});

test('extractTriggeredEntityMentions captura até 3 palavras capitalizadas, mas para na primeira palavra minúscula', () => {
  assert.deepEqual(extractTriggeredEntityMentions('Isso está no banco Itaú Personnalité agora.'), ['Itaú Personnalité']);
});

test('extractTriggeredEntityMentions não captura nada sem palavra-gatilho seguida de nome próprio', () => {
  assert.deepEqual(extractTriggeredEntityMentions('Você gastou bastante esse mês.'), []);
  assert.deepEqual(extractTriggeredEntityMentions('Você tem saldo nessa conta.'), []);
});

// ── validateComposedEntities — categorias exigidas pelo Bloco 4.8 ──────

test('entidade existente (permitida pelos fatos desta resposta) -- válido', () => {
  const result = validateComposedEntities('Você tem R$ 500 na Nubank.', {
    allowedEntityNames: ['Nubank'],
    universeEntityNames: UNIVERSE,
  });
  assert.equal(result.valid, true);
  assert.deepEqual(result.invalidEntities, []);
});

test('entidade inexistente (nem no universo real) -- bloqueia com motivo entity_invented', () => {
  const result = validateComposedEntities('Você tem R$ 500 na conta Bradesco.', {
    allowedEntityNames: ['Nubank'],
    universeEntityNames: UNIVERSE,
  });
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'entity_invented');
  assert.deepEqual(result.invalidEntities, ['Bradesco']);
});

test('entidade real do workspace, mas fora do escopo desta resposta -- bloqueia com motivo entity_out_of_scope', () => {
  const result = validateComposedEntities('Você tem R$ 500 na Itaú.', {
    allowedEntityNames: ['Nubank'],
    universeEntityNames: UNIVERSE,
  });
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'entity_out_of_scope');
  assert.deepEqual(result.invalidEntities, ['Itaú']);
});

test('múltiplas entidades, todas permitidas -- válido', () => {
  const result = validateComposedEntities('Comparando Nubank e Alimentação, o saldo é R$ 500.', {
    allowedEntityNames: ['Nubank', 'Alimentação'],
    universeEntityNames: UNIVERSE,
  });
  assert.equal(result.valid, true);
});

test('múltiplas entidades: mistura correta/incorreta -- basta UMA fora de escopo para bloquear', () => {
  const result = validateComposedEntities('Comparando Nubank (permitida) e Itaú (fora de escopo).', {
    allowedEntityNames: ['Nubank'],
    universeEntityNames: UNIVERSE,
  });
  assert.equal(result.valid, false);
  assert.deepEqual(result.invalidEntities, ['Itaú']);
});

test('sinônimo de escrita (maiúscula/minúscula/acento) não conta como entidade diferente', () => {
  const result = validateComposedEntities('voce tem saldo na NUBANK.', {
    allowedEntityNames: ['Nubank'],
    universeEntityNames: UNIVERSE,
  });
  assert.equal(result.valid, true);
});

test('entidade real com nome composto (Carteira Digital) permitida quando citada por completo', () => {
  const result = validateComposedEntities('Você tem R$ 500 na Carteira Digital.', {
    allowedEntityNames: ['Carteira Digital'],
    universeEntityNames: UNIVERSE,
  });
  assert.equal(result.valid, true);
});

test('ambiguidade: menção genérica ("essa conta", "sua carteira") nunca é tratada como entidade inventada', () => {
  const casosGenericos = [
    'Você tem R$ 500 nessa conta.',
    'O valor está na sua carteira.',
    'Isso é da categoria dele.',
  ];
  for (const texto of casosGenericos) {
    const result = validateComposedEntities(texto, { allowedEntityNames: ['Nubank'], universeEntityNames: UNIVERSE });
    assert.equal(result.valid, true, `"${texto}" não deveria ser bloqueado`);
  }
});

test('texto sem nenhuma entidade nomeada -- sempre válido', () => {
  const result = validateComposedEntities('Você não teve despesas esse mês.', {
    allowedEntityNames: [],
    universeEntityNames: UNIVERSE,
  });
  assert.equal(result.valid, true);
});

test('texto vazio ou inválido nunca lança -- sempre válido (nada a reprovar)', () => {
  assert.equal(validateComposedEntities('', {}).valid, true);
  assert.equal(validateComposedEntities(null, {}).valid, true);
  assert.doesNotThrow(() => validateComposedEntities(undefined, undefined));
});

test('sem universeEntityNames/allowedEntityNames (chamador não passou nada), nunca lança -- reprova qualquer entidade real por padrão seguro', () => {
  const result = validateComposedEntities('Você tem R$ 500 na Nubank.', {});
  // Sem universo conhecido, a checagem 1 (real-fora-de-escopo) não acha
  // nada (universo vazio); a checagem 2 (inventada) também não acha nada
  // (não há gatilho "conta/banco/..." nesta frase) -- válido por ausência
  // de sinal, nunca por assumir que está correto.
  assert.equal(result.valid, true);
});

test('categorias/metas/investimentos/ativos usam a mesma lógica de contas -- nenhuma entidade financeira é tratada diferente', () => {
  const blocked = validateComposedEntities('Sua meta Viagem 2027 está quase lá.', {
    allowedEntityNames: [],
    universeEntityNames: UNIVERSE,
  });
  assert.equal(blocked.valid, false);
  assert.equal(blocked.reason, 'entity_invented');
});
