// BUG 1 (Sprint 4, Bloco 4.0): testes COMPORTAMENTAIS que reproduzem o
// defeito real (duplicação de mensagens na hidratação), não apenas
// verificação estrutural de texto-fonte.
import assert from 'node:assert/strict';
import test from 'node:test';
import { dedupeMessagesForRender, messageIdentity, mergeRestoredMessages } from './mergeRestoredMessages.js';
import { dbToMessage } from './uniChatDataService.js';

function localMessage(overrides = {}) {
  return {
    id: 'msg-2',
    from: 'user',
    type: 'text',
    text: 'Gastei 50 reais',
    time: '14:00',
    ...overrides,
  };
}

function dbRow(overrides = {}) {
  return {
    id: 'a1b2c3d4-uuid-do-banco',
    client_message_id: 'msg-2',
    role: 'user',
    message_type: 'text',
    content: 'Gastei 50 reais',
    metadata: {},
    created_at: '2026-08-05T14:00:00Z',
    ...overrides,
  };
}

test('BUG 1: reprodução do defeito real -- mensagem local + sua versão restaurada do banco (mesmo client_message_id) não duplica', () => {
  const prev = [localMessage()];
  // dbToMessage é a função REAL usada pelo serviço para converter linha do
  // banco em mensagem -- não um mock da estrutura.
  const loadedFromDb = [dbToMessage(dbRow())];

  const merged = mergeRestoredMessages(prev, loadedFromDb);

  assert.equal(merged.length, 1, 'a mensagem restaurada não deve duplicar a mensagem local equivalente');
  // nenhuma key React duplicada é possível se os ids resultantes forem únicos
  const keys = merged.map((m) => m.id);
  assert.equal(new Set(keys).size, keys.length, 'todas as keys devem ser únicas após o merge');
});

test('BUG 1: carregamento repetido da mesma conversa (hidratação chamada 2x) não acumula duplicatas', () => {
  let messages = [localMessage()];
  const loadedFromDb = [dbToMessage(dbRow())];

  // simula o efeito de hidratação rodando duas vezes (StrictMode / dupla
  // navegação / reconexão) com o MESMO payload restaurado
  messages = mergeRestoredMessages(messages, loadedFromDb);
  messages = mergeRestoredMessages(messages, loadedFromDb);

  assert.equal(messages.length, 1);
});

test('BUG 1: restauração de histórico com múltiplas mensagens não duplica nenhuma', () => {
  const prev = [
    localMessage({ id: 'msg-2', text: 'Gastei 50 reais' }),
    localMessage({ id: 'msg-3', from: 'uni', text: 'Qual conta?' }),
  ];
  const loadedFromDb = [
    dbToMessage(dbRow({ id: 'uuid-1', client_message_id: 'msg-2', content: 'Gastei 50 reais' })),
    dbToMessage(dbRow({ id: 'uuid-2', client_message_id: 'msg-3', role: 'assistant', content: 'Qual conta?' })),
  ];

  const merged = mergeRestoredMessages(prev, loadedFromDb);
  assert.equal(merged.length, 2);
});

test('BUG 1: duas mensagens diferentes com o mesmo timestamp permanecem distintas (identidade não depende de time)', () => {
  const prev = [
    localMessage({ id: 'msg-2', time: '14:00', text: 'Gastei 50 reais' }),
    localMessage({ id: 'msg-3', time: '14:00', text: 'Foi no Nubank' }),
  ];
  const loadedFromDb = [
    dbToMessage(dbRow({ id: 'uuid-1', client_message_id: 'msg-2', content: 'Gastei 50 reais' })),
    dbToMessage(dbRow({ id: 'uuid-2', client_message_id: 'msg-3', content: 'Foi no Nubank' })),
  ];
  const merged = mergeRestoredMessages(prev, loadedFromDb);
  assert.equal(merged.length, 2);
});

test('BUG 1: usuário e Uni com o mesmo texto não colapsam em uma só mensagem', () => {
  const prev = [
    localMessage({ id: 'msg-5', from: 'user', text: 'cancelar' }),
    localMessage({ id: 'msg-6', from: 'uni', text: 'cancelar' }),
  ];
  const loadedFromDb = [
    dbToMessage(dbRow({ id: 'uuid-5', client_message_id: 'msg-5', role: 'user', content: 'cancelar' })),
    dbToMessage(dbRow({ id: 'uuid-6', client_message_id: 'msg-6', role: 'assistant', content: 'cancelar' })),
  ];
  const merged = mergeRestoredMessages(prev, loadedFromDb);
  assert.equal(merged.length, 2);
});

test('BUG 1: mensagem otimista (ainda não persistida) nunca some quando o restore não a inclui', () => {
  const optimistic = localMessage({ id: 'msg-7', text: 'em voo, ainda sem dbId' });
  const prev = [localMessage({ id: 'msg-2' }), optimistic];
  // restore só devolve a mensagem antiga -- a otimista ainda não chegou ao
  // banco (fire-and-forget em andamento)
  const loadedFromDb = [dbToMessage(dbRow({ id: 'uuid-1', client_message_id: 'msg-2' }))];

  const merged = mergeRestoredMessages(prev, loadedFromDb);
  assert.equal(merged.length, 2);
  assert.ok(merged.some((m) => m.id === 'msg-7'), 'mensagem otimista não pode ser perdida');
});

test('BUG 1: troca rápida de conversa -- merge com array vazio de restauradas preserva o que já está em tela', () => {
  const prev = [localMessage()];
  const merged = mergeRestoredMessages(prev, []);
  assert.deepEqual(merged, prev);
});

test('BUG 1: primeira carga (prev vazio) usa exatamente o que veio do banco, sem duplicar nem perder', () => {
  const loadedFromDb = [
    dbToMessage(dbRow({ id: 'uuid-1', client_message_id: 'msg-2' })),
    dbToMessage(dbRow({ id: 'uuid-2', client_message_id: 'msg-3', role: 'assistant' })),
  ];
  const merged = mergeRestoredMessages([], loadedFromDb);
  assert.equal(merged.length, 2);
  assert.deepEqual(merged, loadedFromDb);
});

test('BUG REAL (chaves duplicadas, causa raiz #2): prev vazio NÃO pula a deduplicação -- duas linhas do banco com o mesmo client_message_id (ex.: escrita não-idempotente antes da correção) nunca geram duas entradas com o mesmo id', () => {
  const loadedFromDb = [
    dbToMessage(dbRow({ id: 'uuid-1', client_message_id: 'msg-130' })),
    dbToMessage(dbRow({ id: 'uuid-1-dup', client_message_id: 'msg-130' })),
    dbToMessage(dbRow({ id: 'uuid-2', client_message_id: 'msg-131', role: 'assistant' })),
  ];
  const merged = mergeRestoredMessages([], loadedFromDb);
  assert.equal(merged.length, 2, 'a linha duplicada (mesmo client_message_id) nunca deve virar uma segunda entrada');
  assert.equal(new Set(merged.map((m) => m.id)).size, merged.length, 'nenhuma chave repetida no resultado');
});

test('BUG REAL (chaves duplicadas, causa raiz #2): duas linhas do banco com o mesmo client_message_id nunca duplicam, mesmo com prev não-vazio', () => {
  const prev = [localMessage({ id: 'msg-1' })];
  const loadedFromDb = [
    dbToMessage(dbRow({ id: 'uuid-a', client_message_id: 'msg-130' })),
    dbToMessage(dbRow({ id: 'uuid-b', client_message_id: 'msg-130' })),
  ];
  const merged = mergeRestoredMessages(prev, loadedFromDb);
  assert.equal(merged.length, 2);
  assert.equal(new Set(merged.map((m) => m.id)).size, merged.length, 'nenhuma chave repetida no resultado');
});

test('BUG 1: ausência de client_message_id na linha do banco nunca gera identidade falsa que apague outra mensagem', () => {
  const prev = [localMessage({ id: 'msg-2' }), localMessage({ id: 'msg-3', from: 'uni' })];
  // linha antiga do banco, sem client_message_id (dado legado) -- cai no
  // fallback id: row.id (uuid), que não colide com nenhum id local
  const loadedFromDb = [dbToMessage(dbRow({ id: 'legacy-uuid', client_message_id: null }))];
  const merged = mergeRestoredMessages(prev, loadedFromDb);
  assert.equal(merged.length, 3, 'mensagem legada sem client_message_id deve ser adicionada, nunca substituir outra por engano');
  assert.equal(new Set(merged.map((m) => m.id)).size, 3);
});

test('messageIdentity prioriza clientMessageId sobre id e dbId', () => {
  assert.equal(messageIdentity({ clientMessageId: 'a', id: 'b', dbId: 'c' }), 'a');
  assert.equal(messageIdentity({ id: 'b', dbId: 'c' }), 'b');
  assert.equal(messageIdentity({ dbId: 'c' }), 'c');
  assert.equal(messageIdentity({}), null);
});

test('dbToMessage preenche clientMessageId a partir de client_message_id (correção da causa raiz)', () => {
  const msg = dbToMessage(dbRow({ client_message_id: 'msg-42' }));
  assert.equal(msg.clientMessageId, 'msg-42');
  assert.equal(msg.id, 'msg-42');
});

test('nenhuma mensagem legítima é perdida em uma sequência realista: otimista -> persistida -> restaurada em outra sessão', () => {
  // turno 1: usuário manda, mensagem local otimista
  let messages = [localMessage({ id: 'msg-2', text: 'Gastei 50 reais' })];
  // turno 2: Uni responde, publicação única
  messages = [...messages, localMessage({ id: 'msg-3', from: 'uni', text: 'Qual conta?' })];
  // reload da página: hidratação busca do banco as duas mensagens já persistidas
  const loadedFromDb = [
    dbToMessage(dbRow({ id: 'uuid-1', client_message_id: 'msg-2', content: 'Gastei 50 reais' })),
    dbToMessage(dbRow({ id: 'uuid-2', client_message_id: 'msg-3', role: 'assistant', content: 'Qual conta?' })),
  ];
  messages = mergeRestoredMessages(messages, loadedFromDb);
  assert.equal(messages.length, 2);
  assert.equal(new Set(messages.map((m) => m.id)).size, 2);
});

// ============================================================================
// HOTFIX FINAL (chaves duplicadas ainda chegando ao render): barreira final
// de segurança logo antes do .map() -- protege mesmo quando alguma origem
// upstream (histórico já contaminado no banco antes da correção de
// saveMessages, por exemplo) ainda entrega duas entradas com a mesma
// identidade.
// ============================================================================

test('dedupeMessagesForRender: array sem duplicatas passa intacto, mesma ordem', () => {
  const messages = [
    localMessage({ id: 'msg-1' }),
    localMessage({ id: 'msg-2', from: 'uni' }),
    localMessage({ id: 'msg-3' }),
  ];
  const result = dedupeMessagesForRender(messages);
  assert.deepEqual(result.map((m) => m.id), ['msg-1', 'msg-2', 'msg-3']);
});

test('dedupeMessagesForRender: duas entradas com o mesmo client_message_id (dados já contaminados no banco) viram UMA só, na posição da primeira ocorrência', () => {
  const messages = [
    localMessage({ id: 'msg-1' }),
    dbToMessage(dbRow({ id: 'uuid-a', client_message_id: 'msg-130' })),
    localMessage({ id: 'msg-131', from: 'uni', text: 'resposta' }),
    dbToMessage(dbRow({ id: 'uuid-b', client_message_id: 'msg-130' })),
  ];
  const result = dedupeMessagesForRender(messages);
  assert.equal(result.length, 3, 'a segunda linha com client_message_id=msg-130 nunca vira uma segunda entrada');
  assert.deepEqual(result.map((m) => m.id), ['msg-1', 'msg-130', 'msg-131'], 'ordem cronológica preservada -- a sobrevivente fica na posição da PRIMEIRA ocorrência');
  assert.equal(new Set(result.map((m) => m.id)).size, result.length, 'nenhuma key repetida');
});

test('dedupeMessagesForRender: entre duas versões da mesma mensagem, prefere a que já tem dbId (persistida) sobre a otimista', () => {
  const optimistic = localMessage({ id: 'msg-5', text: 'texto otimista, pode estar desatualizado' });
  const persisted = dbToMessage(dbRow({ id: 'uuid-real', client_message_id: 'msg-5', content: 'texto final confirmado pelo banco' }));
  const result = dedupeMessagesForRender([optimistic, persisted]);
  assert.equal(result.length, 1);
  assert.equal(result[0].dbId, 'uuid-real');
  assert.equal(result[0].text, 'texto final confirmado pelo banco');
});

test('dedupeMessagesForRender: nunca usa índice de array como key -- ids originais são preservados', () => {
  const messages = [localMessage({ id: 'msg-9' }), localMessage({ id: 'msg-10', from: 'uni' })];
  const result = dedupeMessagesForRender(messages);
  assert.ok(result.every((m, i) => m.id !== String(i)));
  assert.deepEqual(result.map((m) => m.id), ['msg-9', 'msg-10']);
});

test('dedupeMessagesForRender: mensagens diferentes legítimas nunca são escondidas por engano', () => {
  const messages = [
    localMessage({ id: 'msg-1', text: 'Gastei 50 no mercado' }),
    localMessage({ id: 'msg-2', from: 'uni', text: 'Qual conta?' }),
    localMessage({ id: 'msg-3', text: 'Nubank' }),
  ];
  const result = dedupeMessagesForRender(messages);
  assert.equal(result.length, 3);
});

test('dedupeMessagesForRender: array vazio/nulo nunca lança', () => {
  assert.deepEqual(dedupeMessagesForRender([]), []);
  assert.deepEqual(dedupeMessagesForRender(null), []);
  assert.deepEqual(dedupeMessagesForRender(undefined), []);
});
