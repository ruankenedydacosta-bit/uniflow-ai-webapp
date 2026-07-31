import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  hasNarratedText,
  markNarratedText,
  resetNarratedTexts,
} from './narratedTextSession.js';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// ============================================================================
// BUG REAL: a Uni narrava DUAS VEZES a mesma resposta quando o mesmo input
// era entregue duas vezes (ex.: double-fire do transcript de voz ao
// responder "Caixa") -- cada entrega criava uma mensagem NOVA com o MESMO
// texto e um id novo, e o dedup por id (spokenMessageSession) não pegava:
// são duas mensagens diferentes. Este registro deduplica a NARRAÇÃO por
// CONTEÚDO: dois creates com o mesmo texto → somente o primeiro narra (o
// segundo renderiza, mas fica mudo e marcado como falado por id).
// ============================================================================

test('texto novo fala -- não está registrado antes da primeira narração', () => {
  resetNarratedTexts();
  assert.equal(hasNarratedText('user-a', 'Não encontrei a conta Caixa neste espaço. Posso criá-la para continuar a movimentação?'), false);
  markNarratedText('user-a', 'Não encontrei a conta Caixa neste espaço. Posso criá-la para continuar a movimentação?');
  assert.equal(hasNarratedText('user-a', 'Não encontrei a conta Caixa neste espaço. Posso criá-la para continuar a movimentação?'), true);
  resetNarratedTexts();
});

test('mesmo TEXTO não narra duas vezes -- segunda mensagem com o mesmo conteúdo é silenciada (dedup por conteúdo, não por id)', () => {
  resetNarratedTexts();
  markNarratedText('user-a', 'resposta duplicada');
  assert.equal(hasNarratedText('user-a', 'resposta duplicada'), true);
  resetNarratedTexts();
});

test('textos DIFERENTES narram -- apenas o conteúdo já narrado é bloqueado', () => {
  resetNarratedTexts();
  markNarratedText('user-a', 'primeira resposta');
  assert.equal(hasNarratedText('user-a', 'primeira resposta'), true);
  assert.equal(hasNarratedText('user-a', 'segunda resposta'), false);
  resetNarratedTexts();
});

test('usuário A não silencia a narração do usuário B', () => {
  resetNarratedTexts();
  markNarratedText('user-a', 'mesmo texto');
  assert.equal(hasNarratedText('user-a', 'mesmo texto'), true);
  assert.equal(hasNarratedText('user-b', 'mesmo texto'), false);
  markNarratedText('user-b', 'mesmo texto');
  assert.equal(hasNarratedText('user-b', 'mesmo texto'), true);
  resetNarratedTexts();
});

test('logout (resetNarratedTexts) limpa o registro -- nova sessão volta a narrar o mesmo texto', () => {
  resetNarratedTexts();
  markNarratedText('user-a', 'texto da sessão');
  assert.equal(hasNarratedText('user-a', 'texto da sessão'), true);
  resetNarratedTexts();
  assert.equal(hasNarratedText('user-a', 'texto da sessão'), false);
  resetNarratedTexts();
});

test('sem user.id (modo demo) usa namespace anônimo estável', () => {
  resetNarratedTexts();
  markNarratedText(undefined, 'texto demo');
  assert.equal(hasNarratedText(undefined, 'texto demo'), true);
  assert.equal(hasNarratedText(null, 'texto demo'), true);
  resetNarratedTexts();
});

test('texto vazio/não-string nunca é marcado nem consultado', () => {
  resetNarratedTexts();
  markNarratedText('user-a', '');
  markNarratedText('user-a', '   ');
  markNarratedText('user-a', null);
  markNarratedText('user-a', undefined);
  assert.equal(hasNarratedText('user-a', ''), false);
  assert.equal(hasNarratedText('user-a', '   '), false);
  assert.equal(hasNarratedText('user-a', null), false);
  assert.equal(hasNarratedText('user-a', undefined), false);
  resetNarratedTexts();
});

test('registro é em memória de módulo: nunca usa localStorage/sessionStorage nem React', async () => {
  const registry = await source('./narratedTextSession.js');
  assert.doesNotMatch(registry, /localStorage\b\.|sessionStorage\b\.|window\.localStorage|window\.sessionStorage/);
  assert.doesNotMatch(registry, /from 'react'/);
});

test('logout limpa o registro: SessionContext chama resetNarratedTexts quando a sessão zera, junto do reset de ids', async () => {
  const sessionContext = await source('../../app/SessionContext.jsx');
  assert.match(
    sessionContext,
    /import \{ resetNarratedTexts \} from '\.\.\/features\/uni-voice-tts\/narratedTextSession\.js';/,
  );
  const signedOutBlock = sessionContext.slice(
    sessionContext.indexOf('if (!nextSession?.user) {'),
    sessionContext.indexOf("logAuthDevelopment('Sessao ausente ou encerrada.');"),
  );
  assert.match(signedOutBlock, /resetAutoSpokenMessages\(\);/);
  assert.match(signedOutBlock, /resetNarratedTexts\(\);/);
});

test('UniChatPage alimenta o pipeline com o registro de textos narrados (hasNarratedText/markNarratedText) no hook oficial', async () => {
  const page = await source('../uni-chat/UniChatPage.jsx');
  assert.match(
    page,
    /import \{\s*\n\s*hasNarratedText,\s*\n\s*markNarratedText,\s*\n\s*\} from '\.\.\/uni-voice-tts\/narratedTextSession\.js';/,
  );
  const hookIdx = page.indexOf('const { createAssistantResponse } = useUniResponsePipeline({');
  const hookBlock = page.slice(hookIdx, page.indexOf('});', hookIdx));
  assert.match(hookBlock, /hasNarratedText,/);
  assert.match(hookBlock, /markNarratedText,/);
});
