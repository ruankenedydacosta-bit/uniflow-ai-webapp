import assert from 'node:assert/strict';
import test from 'node:test';
import { composeFinancialResponseWithLlm } from './composeFinancialResponseWithLlm.js';

const FACTS = { balance: 1500.5, account: 'Nubank' };

test('sem composer disponível (não é função), devolve o texto determinístico sem tentar nada', async () => {
  const result = await composeFinancialResponseWithLlm({
    composeFinancialResponseViaLlm: null,
    structuredFacts: FACTS,
    deterministicText: 'Seu saldo é R$ 1.500,50.',
  });
  assert.equal(result.text, 'Seu saldo é R$ 1.500,50.');
  assert.equal(result.composerUsed, false);
  assert.equal(result.fallbackReason, 'unsupported');
  assert.equal(result.attempts, 0);
});

test('sem texto determinístico de fallback (contrato quebrado), nunca chama a LLM e devolve null', async () => {
  let called = false;
  const result = await composeFinancialResponseWithLlm({
    composeFinancialResponseViaLlm: async () => { called = true; return { text: 'x', error: null }; },
    structuredFacts: FACTS,
    deterministicText: '   ',
  });
  assert.equal(called, false);
  assert.equal(result.text, null);
  assert.equal(result.composerUsed, false);
});

test('LLM devolve texto válido (números batem com os fatos) na primeira tentativa -- usa o texto da LLM', async () => {
  let calls = 0;
  const result = await composeFinancialResponseWithLlm({
    composeFinancialResponseViaLlm: async () => {
      calls += 1;
      return { text: 'Você tem R$ 1.500,50 na Nubank.', error: null };
    },
    structuredFacts: FACTS,
    deterministicText: 'Seu saldo é R$ 1.500,50.',
  });
  assert.equal(calls, 1);
  assert.equal(result.text, 'Você tem R$ 1.500,50 na Nubank.');
  assert.equal(result.composerUsed, true);
  assert.equal(result.fallbackReason, null);
  assert.equal(result.attempts, 1);
});

test('LLM inventa um valor monetário não presente nos fatos -- reformula uma vez, depois cai no fallback', async () => {
  let calls = 0;
  const result = await composeFinancialResponseWithLlm({
    composeFinancialResponseViaLlm: async () => {
      calls += 1;
      return { text: 'Você tem R$ 9.999,00 disponível.', error: null };
    },
    structuredFacts: FACTS,
    deterministicText: 'Seu saldo é R$ 1.500,50.',
  });
  assert.equal(calls, 2);
  assert.equal(result.text, 'Seu saldo é R$ 1.500,50.');
  assert.equal(result.composerUsed, false);
  assert.equal(result.fallbackReason, 'GUARDRAIL_FAILED_NUMBER');
  assert.equal(result.attempts, 2);
});

test('reformulação corrige o problema na segunda tentativa -- usa o texto da segunda chamada', async () => {
  let calls = 0;
  const result = await composeFinancialResponseWithLlm({
    composeFinancialResponseViaLlm: async () => {
      calls += 1;
      if (calls === 1) return { text: 'Você tem R$ 9.999,00 disponível.', error: null };
      return { text: 'Você tem R$ 1.500,50 na Nubank.', error: null };
    },
    structuredFacts: FACTS,
    deterministicText: 'Seu saldo é R$ 1.500,50.',
  });
  assert.equal(calls, 2);
  assert.equal(result.text, 'Você tem R$ 1.500,50 na Nubank.');
  assert.equal(result.composerUsed, true);
  assert.equal(result.attempts, 2);
});

test('LLM retorna erro nas duas tentativas -- nunca mais que 2 chamadas, cai no fallback determinístico', async () => {
  let calls = 0;
  const result = await composeFinancialResponseWithLlm({
    composeFinancialResponseViaLlm: async () => {
      calls += 1;
      return { text: null, error: { code: 'TIMEOUT', message: 'x' } };
    },
    structuredFacts: FACTS,
    deterministicText: 'Seu saldo é R$ 1.500,50.',
  });
  assert.equal(calls, 2);
  assert.equal(result.text, 'Seu saldo é R$ 1.500,50.');
  assert.equal(result.composerUsed, false);
  assert.equal(result.fallbackReason, 'TIMEOUT');
});

test('LLM devolve texto vazio -- tratado como inválido, cai no fallback', async () => {
  const result = await composeFinancialResponseWithLlm({
    composeFinancialResponseViaLlm: async () => ({ text: '', error: null }),
    structuredFacts: FACTS,
    deterministicText: 'Seu saldo é R$ 1.500,50.',
  });
  assert.equal(result.text, 'Seu saldo é R$ 1.500,50.');
  assert.equal(result.composerUsed, false);
});

test('se o serviço da LLM lançar uma exceção inesperada, nunca propaga -- cai no fallback', async () => {
  const result = await composeFinancialResponseWithLlm({
    composeFinancialResponseViaLlm: async () => { throw new Error('boom'); },
    structuredFacts: FACTS,
    deterministicText: 'Seu saldo é R$ 1.500,50.',
  });
  assert.equal(result.text, 'Seu saldo é R$ 1.500,50.');
  assert.equal(result.composerUsed, false);
  assert.equal(result.fallbackReason, 'UNEXPECTED_ERROR');
});

test('texto sem nenhum valor monetário mencionado sempre passa no guardrail (nada a validar)', async () => {
  const result = await composeFinancialResponseWithLlm({
    composeFinancialResponseViaLlm: async () => ({ text: 'Não encontrei nenhuma despesa nesse período.', error: null }),
    structuredFacts: { transactions: [] },
    deterministicText: 'Não encontrei nenhuma despesa nesse período.',
  });
  assert.equal(result.composerUsed, true);
});

// ── Sprint 4 Ciclo 4 (Bloco 4.8) — guardrail textual de entidades ───────

test('LLM menciona uma conta real permitida pelos fatos desta resposta -- guardrail de entidade passa', async () => {
  const result = await composeFinancialResponseWithLlm({
    composeFinancialResponseViaLlm: async () => ({ text: 'Você tem R$ 1.500,50 na Nubank.', error: null }),
    structuredFacts: FACTS,
    deterministicText: 'Seu saldo é R$ 1.500,50.',
    allowedEntityNames: ['Nubank'],
    universeEntityNames: ['Nubank', 'Itaú'],
  });
  assert.equal(result.composerUsed, true);
  assert.equal(result.text, 'Você tem R$ 1.500,50 na Nubank.');
});

test('LLM menciona uma conta REAL mas fora do escopo desta resposta (trocou de conta) -- reformula, depois fallback', async () => {
  let calls = 0;
  const result = await composeFinancialResponseWithLlm({
    composeFinancialResponseViaLlm: async () => {
      calls += 1;
      return { text: 'Você tem R$ 1.500,50 na Itaú.', error: null };
    },
    structuredFacts: FACTS,
    deterministicText: 'Seu saldo é R$ 1.500,50.',
    allowedEntityNames: ['Nubank'],
    universeEntityNames: ['Nubank', 'Itaú'],
  });
  assert.equal(calls, 2);
  assert.equal(result.composerUsed, false);
  assert.equal(result.text, 'Seu saldo é R$ 1.500,50.');
  assert.equal(result.fallbackReason, 'GUARDRAIL_FAILED_ENTITY_OUT_OF_SCOPE');
});

test('LLM inventa uma conta que não existe em lugar nenhum do workspace -- reformula, depois fallback', async () => {
  let calls = 0;
  const result = await composeFinancialResponseWithLlm({
    composeFinancialResponseViaLlm: async () => {
      calls += 1;
      return { text: 'Você tem R$ 1.500,50 na conta Bradesco.', error: null };
    },
    structuredFacts: FACTS,
    deterministicText: 'Seu saldo é R$ 1.500,50.',
    allowedEntityNames: ['Nubank'],
    universeEntityNames: ['Nubank', 'Itaú'],
  });
  assert.equal(calls, 2);
  assert.equal(result.composerUsed, false);
  assert.equal(result.fallbackReason, 'GUARDRAIL_FAILED_ENTITY_INVENTED');
});

test('múltiplas entidades: mistura de conta permitida + conta fora de escopo ainda bloqueia', async () => {
  const result = await composeFinancialResponseWithLlm({
    composeFinancialResponseViaLlm: async () => ({ text: 'Comparando Nubank e Itaú, o saldo é R$ 1.500,50.', error: null }),
    structuredFacts: FACTS,
    deterministicText: 'Seu saldo é R$ 1.500,50.',
    allowedEntityNames: ['Nubank'],
    universeEntityNames: ['Nubank', 'Itaú'],
  });
  assert.equal(result.composerUsed, false);
  assert.equal(result.fallbackReason, 'GUARDRAIL_FAILED_ENTITY_OUT_OF_SCOPE');
});

test('sinônimo de caixa/acento (NUBANK vs Nubank) não é tratado como entidade diferente', async () => {
  const result = await composeFinancialResponseWithLlm({
    composeFinancialResponseViaLlm: async () => ({ text: 'Você tem R$ 1.500,50 na NUBANK.', error: null }),
    structuredFacts: FACTS,
    deterministicText: 'Seu saldo é R$ 1.500,50.',
    allowedEntityNames: ['Nubank'],
    universeEntityNames: ['Nubank', 'Itaú'],
  });
  assert.equal(result.composerUsed, true);
});

test('ambiguidade: menção genérica ("essa conta") sem nome próprio nunca é tratada como entidade inventada', async () => {
  const result = await composeFinancialResponseWithLlm({
    composeFinancialResponseViaLlm: async () => ({ text: 'Você tem R$ 1.500,50 nessa conta.', error: null }),
    structuredFacts: FACTS,
    deterministicText: 'Seu saldo é R$ 1.500,50.',
    allowedEntityNames: ['Nubank'],
    universeEntityNames: ['Nubank', 'Itaú'],
  });
  assert.equal(result.composerUsed, true);
});

test('sem allowedEntityNames explícito, deriva automaticamente de structuredFacts.entityNames (calculado pelo orquestrador)', async () => {
  const result = await composeFinancialResponseWithLlm({
    composeFinancialResponseViaLlm: async () => ({ text: 'Você tem R$ 1.500,50 na Nubank.', error: null }),
    structuredFacts: { ...FACTS, entityNames: ['Nubank'] },
    deterministicText: 'Seu saldo é R$ 1.500,50.',
    universeEntityNames: ['Nubank', 'Itaú'],
  });
  assert.equal(result.composerUsed, true);
});

test('sem allowedEntityNames nem structuredFacts.entityNames, qualquer entidade REAL do universo é tratada como fora de escopo (postura segura por padrão)', async () => {
  const result = await composeFinancialResponseWithLlm({
    composeFinancialResponseViaLlm: async () => ({ text: 'Você tem R$ 1.500,50 na Nubank.', error: null }),
    structuredFacts: FACTS,
    deterministicText: 'Seu saldo é R$ 1.500,50.',
    universeEntityNames: ['Nubank', 'Itaú'],
  });
  assert.equal(result.composerUsed, false);
  assert.equal(result.fallbackReason, 'GUARDRAIL_FAILED_ENTITY_OUT_OF_SCOPE');
});

test('sem universeEntityNames (não passado pelo chamador), o guardrail de entidade nunca bloqueia por si só -- comportamento idêntico ao Ciclo 3', async () => {
  const result = await composeFinancialResponseWithLlm({
    composeFinancialResponseViaLlm: async () => ({ text: 'Você tem R$ 1.500,50 na Nubank.', error: null }),
    structuredFacts: FACTS,
    deterministicText: 'Seu saldo é R$ 1.500,50.',
  });
  assert.equal(result.composerUsed, true);
});

// ── Sprint 4 Ciclo 4 (Bloco 4.9) — repasse de uso real de tokens ────────

test('sucesso na primeira tentativa repassa o usage real da chamada', async () => {
  const result = await composeFinancialResponseWithLlm({
    composeFinancialResponseViaLlm: async () => ({
      text: 'Seu saldo é R$ 1.500,50.',
      error: null,
      usage: { promptTokens: 120, completionTokens: 18 },
    }),
    structuredFacts: FACTS,
    deterministicText: 'Seu saldo é R$ 1.500,50.',
  });
  assert.equal(result.composerUsed, true);
  assert.deepEqual(result.usage, { promptTokens: 120, completionTokens: 18 });
});

test('reformulação soma o usage das DUAS tentativas (cada uma é uma chamada real, custa independente do resultado)', async () => {
  let calls = 0;
  const result = await composeFinancialResponseWithLlm({
    composeFinancialResponseViaLlm: async () => {
      calls += 1;
      if (calls === 1) {
        return { text: 'Você tem R$ 9.999,00 disponível.', error: null, usage: { promptTokens: 100, completionTokens: 15 } };
      }
      return { text: 'Seu saldo é R$ 1.500,50.', error: null, usage: { promptTokens: 110, completionTokens: 16 } };
    },
    structuredFacts: FACTS,
    deterministicText: 'Seu saldo é R$ 1.500,50.',
  });
  assert.equal(calls, 2);
  assert.equal(result.composerUsed, true);
  assert.deepEqual(result.usage, { promptTokens: 210, completionTokens: 31 });
});

test('sem usage devolvido pela LLM (serviço antigo/mock simples), usage final é null -- nunca inventa tokens', async () => {
  const result = await composeFinancialResponseWithLlm({
    composeFinancialResponseViaLlm: async () => ({ text: 'Seu saldo é R$ 1.500,50.', error: null }),
    structuredFacts: FACTS,
    deterministicText: 'Seu saldo é R$ 1.500,50.',
  });
  assert.equal(result.usage, null);
});
