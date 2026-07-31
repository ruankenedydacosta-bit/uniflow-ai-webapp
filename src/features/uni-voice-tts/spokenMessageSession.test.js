import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  hasAutoSpokenMessage,
  markAutoSpokenMessage,
  markRestoredMessagesAsSpoken,
  resetAutoSpokenMessages,
} from './spokenMessageSession.js';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// ============================================================================
// BUG REAL: a voz repetia ao navegar da Home para Registros/Conta/Uni e
// voltar. O guard anterior (autoSpokenMessageIdRef) era um useRef local de
// UniChatPage -- ao desmontar (troca de rota), o ref morria; ao voltar, o
// histórico restaurado fazia o autoplay narrar a mensagem antiga como nova.
// O registro abaixo é em nível de módulo, separado por usuário, sobrevive a
// unmount/remount e troca de rota, e é limpo no logout.
// ============================================================================

test('mensagem nova fala uma vez -- não está registrada antes da primeira tentativa válida', () => {
  resetAutoSpokenMessages();
  assert.equal(hasAutoSpokenMessage('user-a', 'msg-1'), false);
  markAutoSpokenMessage('user-a', 'msg-1');
  assert.equal(hasAutoSpokenMessage('user-a', 'msg-1'), true);
  resetAutoSpokenMessages();
});

test('mesmo ID não fala duas vezes -- segunda checagem no mesmo registro é bloqueada (remount/Strict Mode)', () => {
  resetAutoSpokenMessages();
  markAutoSpokenMessage('user-a', 'msg-1');
  // Simula o efeito rodando de novo (segundo mount, navegação de volta).
  assert.equal(hasAutoSpokenMessage('user-a', 'msg-1'), true);
  resetAutoSpokenMessages();
});

test('dois IDs diferentes falam -- apenas o ID já narrado é bloqueado', () => {
  resetAutoSpokenMessages();
  markAutoSpokenMessage('user-a', 'msg-1');
  assert.equal(hasAutoSpokenMessage('user-a', 'msg-1'), true);
  assert.equal(hasAutoSpokenMessage('user-a', 'msg-2'), false);
  resetAutoSpokenMessages();
});

test('usuário A não compartilha deduplicação com usuário B', () => {
  resetAutoSpokenMessages();
  markAutoSpokenMessage('user-a', 'msg-1');
  assert.equal(hasAutoSpokenMessage('user-a', 'msg-1'), true);
  assert.equal(hasAutoSpokenMessage('user-b', 'msg-1'), false);
  markAutoSpokenMessage('user-b', 'msg-1');
  assert.equal(hasAutoSpokenMessage('user-b', 'msg-1'), true);
  resetAutoSpokenMessages();
});

test('logout (resetAutoSpokenMessages) limpa o estado da sessão anterior -- nova sessão volta a narrar', () => {
  resetAutoSpokenMessages();
  markAutoSpokenMessage('user-a', 'msg-1');
  assert.equal(hasAutoSpokenMessage('user-a', 'msg-1'), true);
  resetAutoSpokenMessages();
  assert.equal(hasAutoSpokenMessage('user-a', 'msg-1'), false);
  resetAutoSpokenMessages();
});

test('sem user.id (modo demo) usa namespace anônimo estável -- remount não refala', () => {
  resetAutoSpokenMessages();
  markAutoSpokenMessage(undefined, 'msg-1');
  assert.equal(hasAutoSpokenMessage(undefined, 'msg-1'), true);
  assert.equal(hasAutoSpokenMessage(null, 'msg-1'), true);
  resetAutoSpokenMessages();
});

test('mensagem sem ID nunca é marcada -- nada é registrado antes da tentativa válida', () => {
  resetAutoSpokenMessages();
  markAutoSpokenMessage('user-a', null);
  markAutoSpokenMessage('user-a', undefined);
  assert.equal(hasAutoSpokenMessage('user-a', null), false);
  assert.equal(hasAutoSpokenMessage('user-a', undefined), false);
  resetAutoSpokenMessages();
});

test('registro é em memória de módulo: nunca usa localStorage/sessionStorage nem React -- nada persiste entre usuários/reloads', async () => {
  const registry = await source('./spokenMessageSession.js');
  assert.doesNotMatch(registry, /localStorage\b\.|sessionStorage\b\.|window\.localStorage|window\.sessionStorage/);
  assert.doesNotMatch(registry, /from 'react'/);
});

// ============================================================================
// BLOCO VOZ HIDRATAÇÃO (reload/login): mensagens restauradas do histórico
// (localStorage/Supabase) são conteúdo ANTIGO, nunca eventos novos -- antes
// de o autoplay ser armado, o snapshot da hidratação marca todas elas como
// já narradas (markRestoredMessagesAsSpoken), para que nenhuma fale em
// reload, novo login ou troca de conversa.
// ============================================================================

test('markRestoredMessagesAsSpoken marca em lote só mensagens da Uni com ID -- conteúdo restaurado nunca fala', () => {
  resetAutoSpokenMessages();
  markRestoredMessagesAsSpoken('user-a', [
    { id: 'old-1', from: 'uni', text: 'resposta antiga' },
    { id: 'old-2', from: 'user', text: 'pergunta' },
    { id: 'old-3', from: 'uni', text: 'outra resposta' },
    { id: null, from: 'uni', text: 'sem id' },
  ]);
  assert.equal(hasAutoSpokenMessage('user-a', 'old-1'), true);
  assert.equal(hasAutoSpokenMessage('user-a', 'old-3'), true);
  assert.equal(hasAutoSpokenMessage('user-a', 'old-2'), false, 'mensagens do usuário não são marcadas');
  assert.equal(hasAutoSpokenMessage('user-a', null), false, 'mensagem sem ID nunca é marcada');
  // Mensagem NOVA (id que não estava no snapshot) continua livre para o
  // autoplay falar normalmente depois da hidratação.
  assert.equal(hasAutoSpokenMessage('user-a', 'new-1'), false);
  resetAutoSpokenMessages();
});

test('markRestoredMessagesAsSpoken é idempotente e chaveado por usuário -- repetir o snapshot não muda nada e usuário B não é afetado', () => {
  resetAutoSpokenMessages();
  markRestoredMessagesAsSpoken('user-a', [{ id: 'old-1', from: 'uni' }]);
  markRestoredMessagesAsSpoken('user-a', [{ id: 'old-1', from: 'uni' }]);
  markRestoredMessagesAsSpoken('user-b', [{ id: 'old-1', from: 'uni' }]);
  assert.equal(hasAutoSpokenMessage('user-a', 'old-1'), true);
  assert.equal(hasAutoSpokenMessage('user-b', 'old-1'), true);
  assert.equal(hasAutoSpokenMessage('user-a', 'old-2'), false);
  resetAutoSpokenMessages();
});

test('markRestoredMessagesAsSpoken ignora lista vazia/não-array e mantém o registro de narração normal intacto', () => {
  resetAutoSpokenMessages();
  markRestoredMessagesAsSpoken('user-a', []);
  markRestoredMessagesAsSpoken('user-a', null);
  markRestoredMessagesAsSpoken('user-a', undefined);
  assert.equal(hasAutoSpokenMessage('user-a', 'x'), false);
  // Mensagens novas continuam falando normalmente pelo caminho comum.
  markAutoSpokenMessage('user-a', 'new-1');
  assert.equal(hasAutoSpokenMessage('user-a', 'new-1'), true);
  resetAutoSpokenMessages();
});

test('logout limpa o registro: SessionContext chama resetAutoSpokenMessages quando a sessão zera', async () => {
  const sessionContext = await source('../../app/SessionContext.jsx');
  assert.match(
    sessionContext,
    /import \{ resetAutoSpokenMessages \} from '\.\.\/features\/uni-voice-tts\/spokenMessageSession\.js';/,
  );
  const signedOutBlock = sessionContext.slice(
    sessionContext.indexOf('if (!nextSession?.user) {'),
    sessionContext.indexOf("logAuthDevelopment('Sessao ausente ou encerrada.');"),
  );
  assert.match(signedOutBlock, /latestUserIdRef\.current = null;/);
  assert.match(signedOutBlock, /resetAutoSpokenMessages\(\);/);
});

test('UniChatPage usa o registro persistente no autoplay, chaveado por user.id -- sem useRef local', async () => {
  const page = await source('../uni-chat/UniChatPage.jsx');
  assert.match(
    page,
    /import \{\s*\n\s*hasAutoSpokenMessage,\s*\n\s*markAutoSpokenMessage,\s*\n\s*markRestoredMessagesAsSpoken,\s*\n\s*\} from '\.\.\/uni-voice-tts\/spokenMessageSession\.js';/,
  );
  assert.doesNotMatch(page, /autoSpokenMessageIdRef/);
  const idx = page.indexOf('reprodução automática da resposta ATUAL da');
  const block = page.slice(idx, page.indexOf('useEffect(() => {\n    if (!activeId) return;', idx));
  assert.match(block, /if \(hasAutoSpokenMessage\(user\?\.id, lastMessage\.id\)\) return;/);
  assert.match(block, /markAutoSpokenMessage\(user\?\.id, lastMessage\.id\);/);
});
