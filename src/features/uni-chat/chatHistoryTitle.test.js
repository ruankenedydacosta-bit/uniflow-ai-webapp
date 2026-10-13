import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveTitle, resolveConversationTitle, titleToSync } from './chatHistory.js';

const msgs = [
  { from: 'uni', text: 'Oi!' },
  { from: 'user', text: 'Quanto gastei com mercado?' },
];

test('deriveTitle usa a 1ª mensagem do usuário e ignora texto vazio', () => {
  assert.equal(deriveTitle(msgs), 'Quanto gastei com mercado?');
  assert.equal(deriveTitle([{ from: 'user', text: '  ' }, ...msgs]), 'Quanto gastei com mercado?');
  assert.equal(deriveTitle([]), '');
  assert.equal(deriveTitle([{ from: 'user', text: 'a'.repeat(60) }]), 'a'.repeat(55) + '…');
});

test('resolveConversationTitle: banco vence, nunca troca título por vazio', () => {
  assert.equal(resolveConversationTitle({ dbTitle: 'Do banco', localTitle: 'Local', messages: msgs }), 'Do banco');
  assert.equal(resolveConversationTitle({ dbTitle: '', localTitle: 'Local', messages: msgs }), 'Local');
  assert.equal(resolveConversationTitle({ dbTitle: '', localTitle: '', messages: msgs }), 'Quanto gastei com mercado?');
  assert.equal(resolveConversationTitle({ dbTitle: '', localTitle: '', messages: [] }), '');
});

test('titleToSync grava só conversa supabase com título novo', () => {
  const conv = { id: 'c1', source: 'supabase', title: 'Oi' };
  assert.equal(titleToSync(conv, {}), 'Oi');
  assert.equal(titleToSync(conv, { c1: 'Oi' }), null);
  assert.equal(titleToSync({ ...conv, title: '' }, {}), null);
  assert.equal(titleToSync({ ...conv, source: 'local' }, {}), null);
  assert.equal(titleToSync(null, {}), null);
});
