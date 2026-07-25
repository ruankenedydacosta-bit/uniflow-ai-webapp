import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSupportRequestPayload } from './uniSupportContext.js';
import { UNI_MODE } from './uniMode.js';

test('modo do payload de suporte é sempre UNI_MODE.SUPPORT', () => {
  const payload = buildSupportRequestPayload({ text: 'como faço login com Google?' });
  assert.equal(payload.mode, UNI_MODE.SUPPORT);
});

test('payload de suporte nunca inclui um campo system nem dados financeiros', () => {
  const payload = buildSupportRequestPayload({ text: 'como registro uma movimentação?' });
  assert.equal('system' in payload, false);
  assert.equal('financialContext' in payload, false);
  assert.equal('financialSummary' in payload, false);
});

test('productContext vem da recuperação local, limitado e com id/title/content', () => {
  const payload = buildSupportRequestPayload({ text: 'como ouço uma resposta da Uni?' });
  assert.ok(payload.productContext.length > 0);
  assert.ok(payload.productContext.length <= 3);
  for (const entry of payload.productContext) {
    assert.ok(entry.id && entry.title && entry.content);
  }
  assert.ok(payload.productContext.some((e) => e.id === 'uni-voice'));
});

test('pergunta sem nenhum documento relevante retorna productContext vazio (fallback), nunca inventa', () => {
  const payload = buildSupportRequestPayload({ text: 'futebol campeonato jogador estádio torcida gol' });
  assert.deepEqual(payload.productContext, []);
});

test('filtro por workspace exclui documentos exclusivos de outro espaço', () => {
  const payload = buildSupportRequestPayload({ text: 'cliente oportunidade crm pipeline', workspace: 'personal' });
  assert.ok(!payload.productContext.some((e) => e.id === 'crm-and-clients'));
});

test('histórico curto e sanitização são reaproveitados do modo financeiro (sem duplicar lógica)', () => {
  const payload = buildSupportRequestPayload({
    text: 'meu e-mail é usuario@exemplo.com, como troco minha senha?',
    messages: [{ from: 'user', text: 'oi', type: 'text' }],
  });
  const lastMessage = payload.messages.at(-1);
  assert.doesNotMatch(lastMessage.content, /usuario@exemplo\.com/);
  assert.match(lastMessage.content, /\[email removido\]/);
  assert.equal(payload.messages[0].content, 'oi');
});
