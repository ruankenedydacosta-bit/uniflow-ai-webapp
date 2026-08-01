// Testes de avaliação de candidatos (Fase 3) — seção 25, itens 8-16.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateMemoryCandidate } from './evaluateMemoryCandidate.js';

const SESSION = { userId: 'user-1', workspaceId: 'workspace-1', conversationId: 'conv-1' };

function evaluate(text, overrides = {}) {
  return evaluateMemoryCandidate({
    message: { id: 'msg-1', text },
    session: SESSION,
    classification: overrides.classification ?? { messageType: 'unsupported' },
    epistemicState: overrides.epistemicState ?? {},
    cognitiveContext: overrides.cognitiveContext ?? { currentSubject: 'padaria' },
    snapshot: overrides.snapshot ?? null,
    operationalMemory: overrides.operationalMemory ?? null,
    now: overrides.now ?? Date.now(),
  });
}

test('m8: preferência explícita de resposta gera candidato conversation_preference', () => {
  const result = evaluate('Prefiro que você responda de forma curta');
  assert.equal(result.candidates.length, 1);
  const candidate = result.candidates[0];
  assert.equal(candidate.memoryType, 'conversation_preference');
  assert.equal(candidate.subjectKey, 'style::response length');
  assert.deepEqual(candidate.value, { style: 'short' });
  assert.equal(candidate.evidenceType, 'explicit_user_statement');
});

test('m8b: preferência detalhada também é detectada', () => {
  const result = evaluate('Prefiro respostas detalhadas');
  const candidate = result.candidates[0];
  assert.equal(candidate.memoryType, 'conversation_preference');
  assert.deepEqual(candidate.value, { style: 'detailed' });
});

test('m9: correção explícita gera user_correction confirmado com sujeito do contexto', () => {
  const result = evaluate('Não é Outros, é Saúde');
  assert.equal(result.candidates.length, 1);
  const candidate = result.candidates[0];
  assert.equal(candidate.memoryType, 'user_correction');
  assert.equal(candidate.subjectKey, 'merchant_category::padaria');
  assert.deepEqual(candidate.value, {
    merchant: 'padaria',
    category: 'Saúde',
    correctedFrom: 'Outros',
  });
  assert.equal(candidate.status, 'confirmed');
  assert.equal(candidate.evidenceType, 'user_correction');
});

test('m10: ação com conta resolvida gera contexto episódico (evidência leve)', () => {
  const result = evaluate('Gastei 30 no mercado no Nubank', {
    classification: { messageType: 'action', primaryIntent: 'register_expense' },
    epistemicState: { account: { value: 'Nubank', status: 'resolved' } },
  });
  assert.equal(result.candidates.length, 1);
  const candidate = result.candidates[0];
  assert.equal(candidate.memoryType, 'episodic_context');
  assert.equal(candidate.subjectKey, 'merchant::nubank');
  assert.equal(candidate.evidenceType, 'behavior_pattern');
  assert.equal(candidate.source, 'engine');
});

test('m11: associação de conta explícita ("use sempre") gera merchant_account_association', () => {
  const result = evaluate('Use sempre o Nubank quando eu falar de mercado');
  const candidate = result.candidates[0];
  assert.equal(candidate.memoryType, 'merchant_account_association');
  assert.equal(candidate.subjectKey, 'merchant_account::mercado');
  assert.deepEqual(candidate.value, { merchant: 'mercado', account: 'Nubank' });
});

test('m11b: "costumo usar" gera account_preference', () => {
  const result = evaluate('Costumo usar o Nubank para mercado');
  const candidate = result.candidates[0];
  assert.equal(candidate.memoryType, 'account_preference');
  assert.equal(candidate.subjectKey, 'account::nubank');
  assert.deepEqual(candidate.value, { account: 'Nubank', context: 'mercado' });
});

test('m12: associação de categoria explícita ("X é Y") gera merchant_category_association', () => {
  const result = evaluate('Padaria é Alimentação');
  const candidate = result.candidates[0];
  assert.equal(candidate.memoryType, 'merchant_category_association');
  assert.equal(candidate.subjectKey, 'merchant_category::padaria');
  assert.deepEqual(candidate.value, { merchant: 'Padaria', category: 'Alimentação' });
});

test('m12b: "X costuma ser classificada como Y" gera category_preference', () => {
  const result = evaluate('Padaria costuma ser classificada como Saúde');
  const candidate = result.candidates[0];
  assert.equal(candidate.memoryType, 'category_preference');
  assert.equal(candidate.subjectKey, 'category::padaria');
  assert.deepEqual(candidate.value, { merchant: 'Padaria', category: 'Saúde' });
});

test('m12c: fato explícito "minha conta principal" gera user_declared_fact', () => {
  const result = evaluate('Minha conta principal é a Caixa');
  const candidate = result.candidates[0];
  assert.equal(candidate.memoryType, 'user_declared_fact');
  assert.equal(candidate.subjectKey, 'fact::main account');
  assert.deepEqual(candidate.value, { account: 'Caixa' });
});

test('m12d: procedimento de confirmação gera procedure_preference', () => {
  const result = evaluate('Sempre me pergunte antes de pagar');
  const candidate = result.candidates[0];
  assert.equal(candidate.memoryType, 'procedure_preference');
  assert.equal(candidate.subjectKey, 'procedure::confirm before');
  assert.deepEqual(candidate.value, { action: 'pagar', confirmBefore: true });
});

test('m13: frase casual (small_talk) não gera memória', () => {
  const result = evaluate('Bom dia, tudo bem?', { classification: { messageType: 'small_talk' } });
  assert.equal(result.candidates.length, 0);
  assert.ok(result.rejected.some((entry) => entry.reason === 'message_type'));
});

test('m13b: saudação mesmo classificada como unsupported não gera memória', () => {
  const result = evaluate('Olá!');
  assert.equal(result.candidates.length, 0);
});

test('m14: valor financeiro isolado não gera memória', () => {
  const result = evaluate('50 reais');
  assert.equal(result.candidates.length, 0);
  assert.ok(result.rejected.some((entry) => entry.reason === 'isolated_financial_value'));
});

test('m14b: declaração financeira sem sujeito de memória não gera candidato', () => {
  const result = evaluate('Gastei 50 reais no mercado');
  assert.equal(result.candidates.length, 0);
});

test('m15: token/senha não gera memória', () => {
  const token = evaluate('O meu token de acesso é abc123');
  assert.equal(token.candidates.length, 0);
  assert.ok(token.rejected.some((entry) => entry.reason === 'sensitive_content'));
  const password = evaluate('Prefiro password forte');
  assert.equal(password.candidates.length, 0);
});

test('m16: dado sensível (email, CPF, cartão) é rejeitado', () => {
  for (const text of [
    'meu email é joao@exemplo.com',
    'meu CPF é 123.456.789-00',
    'o cartao 4111 1111 1111 1111 é o principal',
  ]) {
    const result = evaluate(text);
    assert.equal(result.candidates.length, 0, text);
    assert.ok(result.rejected.some((entry) => entry.reason === 'sensitive_content'), text);
  }
});

test('m16b: contexto episódico de ação com conta resolvida expira em 24h', () => {
  const result = evaluate('Gastei 50 no mercado no Nubank', {
    classification: { messageType: 'action' },
    epistemicState: { account: { value: 'Nubank', status: 'resolved' } },
  });
  const candidate = result.candidates[0];
  assert.equal(candidate.memoryType, 'episodic_context');
  assert.equal(candidate.subjectKey, 'merchant::nubank');
  assert.ok(candidate.expiresAt != null);
});

test('m16c: episódico não é criado para conteúdo sem suporte nem small talk', () => {
  const unsupported = evaluate('Frase aleatória qualquer', {
    classification: { messageType: 'unsupported' },
    epistemicState: { account: { value: 'Nubank' } },
  });
  assert.equal(unsupported.candidates.length, 0);
});

test('m16d: candidatos limitados por política (maxCandidatesPerMessage)', () => {
  const result = evaluate(
    'Prefiro respostas curtas. Padaria é Alimentação. Use sempre o Nubank quando eu falar de mercado.',
  );
  assert.ok(result.candidates.length <= 3);
});
