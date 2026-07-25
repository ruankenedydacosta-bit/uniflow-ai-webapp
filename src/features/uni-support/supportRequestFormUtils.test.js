import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SUPPORT_REQUEST_CATEGORIES,
  SUPPORT_REQUEST_IMPACT_LEVELS,
  SUPPORT_REQUEST_PLATFORMS,
  createEmptySupportRequestForm,
  validateSupportRequestForm,
  buildSupportRequestPayload,
  containsLikelySensitiveData,
} from './supportRequestFormUtils.js';

test('createEmptySupportRequestForm começa sem categoria/assunto/descrição, impacto médio por padrão', () => {
  const form = createEmptySupportRequestForm();
  assert.equal(form.category, '');
  assert.equal(form.subject, '');
  assert.equal(form.description, '');
  assert.equal(form.impact, 'medium');
});

test('validação exige categoria, assunto e descrição', () => {
  const empty = createEmptySupportRequestForm();
  assert.match(validateSupportRequestForm(empty), /categoria/i);
  assert.match(validateSupportRequestForm({ ...empty, category: 'outro' }), /assunto/i);
  assert.match(validateSupportRequestForm({ ...empty, category: 'outro', subject: 'x' }), /descreva/i);
});

test('validação aceita um formulário completo e válido', () => {
  const form = { category: 'chat_uni', subject: 'Uni não responde', description: 'Enviei uma pergunta e nada aconteceu.', impact: 'high', platform: 'mobile' };
  assert.equal(validateSupportRequestForm(form), null);
});

test('validação rejeita assunto/descrição além do limite de tamanho', () => {
  const longSubject = 'a'.repeat(151);
  const form = { category: 'outro', subject: longSubject, description: 'ok' };
  assert.match(validateSupportRequestForm(form), /assunto/i);

  const longDescription = 'a'.repeat(4001);
  const form2 = { category: 'outro', subject: 'ok', description: longDescription };
  assert.match(validateSupportRequestForm(form2), /descrição/i);
});

test('bloqueio básico de dados sensíveis: senha, cartão, chave de acesso não passam pela validação', () => {
  assert.ok(containsLikelySensitiveData('minha senha é 12345'));
  assert.ok(containsLikelySensitiveData('aqui está minha chave pix'));
  assert.ok(containsLikelySensitiveData('o cvv do meu cartão de crédito é 123'));
  assert.ok(!containsLikelySensitiveData('a Uni não está respondendo minhas perguntas'));

  const form = { category: 'outro', subject: 'problema de acesso', description: 'minha senha não funciona mais' };
  assert.match(validateSupportRequestForm(form), /não inclua senhas/i);
});

test('categorias, níveis de impacto e plataformas cobrem exatamente o vocabulário da migration', () => {
  const categoryValues = SUPPORT_REQUEST_CATEGORIES.map((c) => c.value).sort();
  assert.deepEqual(categoryValues, [
    'acesso_conta', 'chat_uni', 'cobranca_plano', 'erro_tecnico', 'financeiro',
    'notificacoes', 'outro', 'pessoal_empresa', 'privacidade_seguranca', 'voz',
  ].sort());

  const impactValues = SUPPORT_REQUEST_IMPACT_LEVELS.map((i) => i.value).sort();
  assert.deepEqual(impactValues, ['high', 'low', 'medium']);

  const platformValues = SUPPORT_REQUEST_PLATFORMS.map((p) => p.value).sort();
  assert.deepEqual(platformValues, ['', 'desktop', 'mobile'].sort());
});

test('buildSupportRequestPayload nunca inclui o histórico da conversa, só uma referência opcional de conversation_id', () => {
  const form = { category: 'chat_uni', subject: 'assunto', description: 'descrição', impact: 'low', platform: 'desktop' };
  const payload = buildSupportRequestPayload(form, { userId: 'user-1', workspaceId: 'ws-1', conversationId: 'conv-1' });
  assert.deepEqual(payload, {
    user_id: 'user-1',
    workspace_id: 'ws-1',
    conversation_id: 'conv-1',
    category: 'chat_uni',
    subject: 'assunto',
    description: 'descrição',
    impact: 'low',
    platform: 'desktop',
  });
  assert.ok(!('messages' in payload));
  assert.ok(!('conversationHistory' in payload));
});

test('buildSupportRequestPayload aceita workspaceId/conversationId ausentes (nulos, nunca undefined em campos opcionais)', () => {
  const form = { category: 'outro', subject: 'a', description: 'b', impact: 'medium', platform: '' };
  const payload = buildSupportRequestPayload(form, { userId: 'user-1' });
  assert.equal(payload.workspace_id, null);
  assert.equal(payload.conversation_id, null);
  assert.equal(payload.platform, null);
});
