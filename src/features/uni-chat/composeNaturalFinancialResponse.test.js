// Sprint 4 (Blocos 4.3.1/4.3.4/4.3.5/4.3.6) — testes comportamentais.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  composeNaturalFinancialResponse,
  explainFinancialTerm,
  extractMentionedCurrencyValues,
  validateComposedResponse,
} from './composeNaturalFinancialResponse.js';

// ── 4.3.1: composição natural ──────────────────────────────────────────

test('composição simples devolve o responseDraft sem alteração quando não há emoção nem dúvida de termo', () => {
  const text = composeNaturalFinancialResponse({ responseDraft: 'Você gastou R$ 117,80 neste mês.' });
  assert.equal(text, 'Você gastou R$ 117,80 neste mês.');
});

test('nunca inventa números -- a composição nunca recalcula, só encapsula o texto já pronto', () => {
  const responseDraft = 'Você gastou R$ 117,80 neste mês, R$ 212,20 a menos que no mês passado.';
  const text = composeNaturalFinancialResponse({ responseDraft });
  assert.ok(text.includes('117,80'));
  assert.ok(text.includes('212,20'));
});

test('responseDraft ausente ou vazio devolve null, nunca uma string vazia/inventada', () => {
  assert.equal(composeNaturalFinancialResponse({}), null);
  assert.equal(composeNaturalFinancialResponse({ responseDraft: '' }), null);
  assert.equal(composeNaturalFinancialResponse({ responseDraft: '   ' }), null);
});

// ── 4.3.4: acolhimento emocional ────────────────────────────────────────

test('reasoningTags com sinal emocional adiciona acolhimento curto antes do dado -- nunca substitui o dado', () => {
  const text = composeNaturalFinancialResponse({
    responseDraft: 'Neste mês, suas despesas somam R$ 117,80.',
    reasoningTags: ['emotional_concern'],
  });
  assert.equal(text, 'Entendo a preocupação. Neste mês, suas despesas somam R$ 117,80.');
});

test('sem sinal emocional, nenhum prefixo de acolhimento é adicionado', () => {
  const text = composeNaturalFinancialResponse({
    responseDraft: 'Neste mês, suas despesas somam R$ 117,80.',
    reasoningTags: ['expense_query'],
  });
  assert.equal(text, 'Neste mês, suas despesas somam R$ 117,80.');
});

test('acolhimento nunca usa discurso terapêutico excessivo -- é uma frase curta', () => {
  const text = composeNaturalFinancialResponse({
    responseDraft: 'Saldo: R$ 100,00.',
    reasoningTags: ['emotional_distress'],
  });
  const prefix = text.replace('Saldo: R$ 100,00.', '').trim();
  assert.ok(prefix.split(' ').length <= 5, `prefixo deve ser curto, recebido: "${prefix}"`);
});

// ── 4.3.5: explicação de termos ─────────────────────────────────────────

test('explainFinancialTerm reconhece termos conhecidos com explicação simples e exemplo', () => {
  const result = explainFinancialTerm('categoria');
  assert.ok(result);
  assert.match(result.explanation, /Alimentação/);
});

test('explainFinancialTerm devolve null para termo desconhecido -- nunca inventa uma explicação', () => {
  assert.equal(explainFinancialTerm('blockchain'), null);
  assert.equal(explainFinancialTerm(''), null);
  assert.equal(explainFinancialTerm(null), null);
});

test('composição com termToExplain prefixa a explicação e preserva o dado original', () => {
  const text = composeNaturalFinancialResponse({
    responseDraft: 'Em qual categoria você quer colocar essa despesa?',
    termToExplain: 'categoria',
  });
  assert.match(text, /grupo usado para organizar/);
  assert.match(text, /Em qual categoria você quer colocar/);
});

test('todos os termos do glossário obrigatório (Bloco 4.3.5) estão cobertos', () => {
  const required = ['categoria', 'saldo', 'receita', 'despesa', 'fluxo de caixa', 'período', 'conta', 'comparação', 'média', 'recorrência', 'orçamento'];
  for (const term of required) {
    assert.ok(explainFinancialTerm(term), `termo "${term}" deveria ter explicação`);
  }
});

// ── 4.3.6: guardrails ───────────────────────────────────────────────────

test('extractMentionedCurrencyValues extrai valores em formato BRL corretamente', () => {
  const values = extractMentionedCurrencyValues('Você gastou R$ 117,80 neste mês, R$ 1.212,20 a mais.');
  assert.deepEqual(values, [117.8, 1212.2]);
});

test('validateComposedResponse aprova texto cujos valores existem nos fatos', () => {
  const result = validateComposedResponse('Você gastou R$ 117,80 este mês.', { expenses: 117.8, income: 3000 });
  assert.equal(result.valid, true);
});

test('validateComposedResponse rejeita texto com valor que não está em nenhum fato -- nunca deixa passar número inventado', () => {
  const result = validateComposedResponse('Você gastou R$ 999,99 este mês.', { expenses: 117.8 });
  assert.equal(result.valid, false);
  assert.deepEqual(result.inventedValues, [999.99]);
});

test('validateComposedResponse aceita valores aninhados em arrays/objetos de fatos (ex.: parts de consulta composta)', () => {
  const facts = { parts: [{ data: { income: 3000 } }, { data: { items: [{ amount: 45 }] } }] };
  const result = validateComposedResponse('Você recebeu R$ 3.000,00 e sua maior despesa foi R$ 45,00.', facts);
  assert.equal(result.valid, true);
});

test('texto sem nenhum valor monetário sempre é válido (nada a checar)', () => {
  const result = validateComposedResponse('Não encontrei dados para este período.', {});
  assert.equal(result.valid, true);
  assert.deepEqual(result.inventedValues, []);
});

test('validateComposedResponse nunca lança para entradas malformadas', () => {
  assert.doesNotThrow(() => validateComposedResponse(null, null));
  assert.doesNotThrow(() => validateComposedResponse(undefined, undefined));
  assert.equal(validateComposedResponse(null, {}).valid, true);
});
