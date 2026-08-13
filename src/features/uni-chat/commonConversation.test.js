import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveCommonConversationResponse } from './commonConversation.js';

test('saudação pura recebe resposta comum determinística', () => {
  assert.equal(resolveCommonConversationResponse('Bom dia.'), 'Olá! Como posso ajudar?');
});

test('pergunta social e agradecimento recebem respostas comuns', () => {
  assert.match(resolveCommonConversationResponse('Tudo bem?'), /Estou bem/);
  assert.match(resolveCommonConversationResponse('Obrigado.'), /Por nada/);
});
