import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { CANCEL_DRAG_PX } from './usePressAndHold.js';
import { resolveUniInstantContext } from './uniInstantContext.js';
import {
  UNI_VOICE_HINT_STORAGE_KEY,
  readUniVoiceHintSeen,
  writeUniVoiceHintSeen,
} from './uniVoiceHintStorage.js';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('toque simples abre /uni-ai', async () => {
  const integration = await source('../../layouts/mobile-app-shell/UniCenterButton.jsx');
  assert.match(integration, /path = '\/uni-ai'/);
  assert.match(integration, /navigate\(path\)/);
});

test('durante hold nao existe bottom sheet', async () => {
  const files = await Promise.all([source('./UniInstantResultCard.jsx'), source('./UniInstantResultCard.module.css')]);
  assert.doesNotMatch(files.join('\n'), /bottom.?sheet|className=\{styles\.sheet\}/i);
});

test('nao existe texto Baseado na tela', async () => {
  const card = await source('./UniInstantResultCard.jsx');
  assert.doesNotMatch(card, /Baseado na tela/);
});

test('nao existe botao Parar e responder', async () => {
  const card = await source('./UniInstantResultCard.jsx');
  assert.doesNotMatch(card, /Parar e responder/);
});

test('ondas organicas aparecem durante hold', async () => {
  const button = await source('./UniInstantButton.jsx');
  const waves = await source('./UniVoiceWaves.jsx');
  assert.match(button, /gestureState === 'holding'/);
  assert.match(waves, /<path/);
});

test('botao central nao renderiza mais o card de demonstracao', async () => {
  const integration = await source('../../layouts/mobile-app-shell/UniCenterButton.jsx');
  assert.doesNotMatch(integration, /UniInstantResultCard|setCardOpen|mockData/);
});

test('pergunta contextual gera resposta curta', () => {
  assert.equal(resolveUniInstantContext('/agenda').response, 'Você tem uma reunião com Carlos às 16h.');
});

test('consulta financeira gera resposta curta', () => {
  assert.equal(
    resolveUniInstantContext('/financeiro').response,
    'Você gastou R$ 940,00 com alimentação neste mês.',
  );
});

test('acao financeira gera confirmacao', () => {
  const context = resolveUniInstantContext('/dashboard');
  assert.equal(context.type, 'financial_action');
  assert.match(context.response, /Registrar saída de R\$ 25,00/);
});

test('botao central nao executa acao financeira', async () => {
  const integration = await source('../../layouts/mobile-app-shell/UniCenterButton.jsx');
  assert.doesNotMatch(integration, /transactionService|insert\s*\(|supabase/i);
});

test('cancelamento por arraste continua definido no gesto antes do hold', () => {
  assert.equal(CANCEL_DRAG_PX, 56);
});

test('Escape fecha card nao critico', async () => {
  const card = await source('./UniInstantResultCard.jsx');
  assert.match(card, /event\.key === 'Escape'/);
  assert.match(card, /if \(!critical\)/);
});

test('confirmacao financeira nao fecha por Escape ou backdrop', async () => {
  const card = await source('./UniInstantResultCard.jsx');
  assert.match(card, /onClick=\{critical \? undefined : onClose\}/);
  assert.match(card, /state === 'confirmation' && confirmationRequired/);
});

test('desmontagem limpa listeners e pointer capture', async () => {
  const card = await source('./UniInstantResultCard.jsx');
  const gesture = await source('./usePressAndHold.js');
  assert.match(card, /removeEventListener\('keydown'/);
  assert.match(gesture, /releasePointerCapture/);
});

// ============================================================================
// FASE 5 (paridade com o botão grande da Home): o botão compacto
// (UniInstantButton, usado pelo UniCenterButton na barra inferior) usa
// usePressAndHold.js -- um hook DIFERENTE do handler manual da Home, mas
// sujeito à mesma classe de bug real em dispositivo físico. Já tinha
// pointercancel/pointermove com distância corretos; faltava a rede de
// segurança onLostPointerCapture, agora adicionada, e touch-action/
// user-select no CSS (já existiam, reforçados aqui).
// ============================================================================

test('FASE 5: setPointerCapture é chamado no pointerdown com o pointerId do evento', async () => {
  const gesture = await source('./usePressAndHold.js');
  const idx = gesture.indexOf('onPointerDown: (event) => {');
  const slice = gesture.slice(idx, idx + 300);
  assert.match(slice, /event\.currentTarget\.setPointerCapture\?\.\(event\.pointerId\);/);
});

test('FASE 5: onLostPointerCapture cancela o gesto (rede de segurança), validando sourceRef e pointerId -- não duplica finish() já disparado por pointerup/pointercancel', async () => {
  const gesture = await source('./usePressAndHold.js');
  const idx = gesture.indexOf('onLostPointerCapture: (event) => {');
  assert.ok(idx > -1, 'onLostPointerCapture deve existir em usePressAndHold.js');
  const slice = gesture.slice(idx, idx + 200);
  assert.match(slice, /if \(sourceRef\.current !== 'pointer' \|\| event\.pointerId !== pointerIdRef\.current\) return;/);
  assert.match(slice, /finish\(true\);/);
});

test('FASE 5: onLostPointerCapture está de fato conectado ao objeto bind retornado pelo hook (chega até o botão via spread)', async () => {
  const gesture = await source('./usePressAndHold.js');
  const bindIdx = gesture.indexOf('bind: {');
  const returnBlock = gesture.slice(bindIdx, gesture.lastIndexOf('},\n  };'));
  assert.match(returnBlock, /onLostPointerCapture:/);
  const button = await source('./UniInstantButton.jsx');
  assert.match(button, /\{\.\.\.bind\}/);
});

test('FASE 5: pointerup/pointercancel de um pointerId diferente do que iniciou o gesto são ignorados', async () => {
  const gesture = await source('./usePressAndHold.js');
  const upIdx = gesture.indexOf('onPointerUp: (event) => {');
  const moveIdx = gesture.indexOf('onPointerMove: (event) => {');
  assert.match(gesture.slice(upIdx, upIdx + 150), /event\.pointerId !== pointerIdRef\.current/);
  assert.match(gesture.slice(moveIdx, moveIdx + 150), /event\.pointerId !== pointerIdRef\.current/);
});

test('FASE 5: CSS do botão compacto mantém touch-action: none e bloqueia seleção/callout/drag nativos', async () => {
  const css = await source('./UniInstantButton.module.css');
  const idx = css.indexOf('.uniButton {');
  const slice = css.slice(idx, css.indexOf('transition:', idx));
  assert.match(slice, /touch-action:\s*none;/);
  assert.match(slice, /(?<!-webkit-)user-select:\s*none;/);
  assert.match(slice, /-webkit-user-select:\s*none;/);
  assert.match(slice, /-webkit-touch-callout:\s*none;/);
  assert.match(slice, /-webkit-user-drag:\s*none;/);
});

// ============================================================================
// Correção do bug de gesto travado em dispositivo físico (arrastar a partir
// do botão central podia deixar a Uni "ouvindo" para sempre): botão ~5%
// menor, área interativa igual à visual, e uma rede de segurança em
// usePressAndHold.js que não depende de nenhum evento de pointer específico
// chegar ao elemento capturado.
// ============================================================================

test('botão central ~5% menor que os 56px anteriores, sem token exato (documentado no CSS)', async () => {
  const css = await source('./UniInstantButton.module.css');
  const idx = css.indexOf('.uniButton {');
  const slice = css.slice(idx, css.indexOf('margin-top:', idx));
  assert.match(slice, /width:\s*53px;/);
  assert.match(slice, /height:\s*53px;/);
  assert.doesNotMatch(slice, /var\(--uf-space-56\)/);
});

test('área interativa do botão central é a mesma área visual -- nenhum wrapper decorativo maior recebe pointer events', async () => {
  const waves = await source('./UniVoiceWaves.module.css');
  const button = await source('./UniInstantButton.jsx');
  assert.match(waves, /\.freqField \{[\s\S]*?pointer-events:\s*none;/);
  assert.match(waves, /\.staticGlow \{[\s\S]*?pointer-events:\s*none;/);
  // Só o <button> real recebe `bind` (onPointerDown/etc.) -- .uniSlot e
  // .holdHint (wrapper e dica) nunca capturam o gesto de segurar.
  assert.match(button, /<button\s*\n\s*\{\.\.\.bind\}/);
});

test('rede de segurança: usePressAndHold ouve pointerup/pointercancel em window (fase de captura) enquanto o gesto está ativo, além dos handlers no próprio elemento', async () => {
  const gesture = await source('./usePressAndHold.js');
  assert.match(gesture, /SAFETY_NET_EVENTS = \['pointerup', 'pointercancel'\]/);
  assert.match(gesture, /browserRuntime\.addEventListener\(eventName, handleSafetyNetEventRef\.current, true\)/);
  assert.match(gesture, /browserRuntime\.removeEventListener\(eventName, handleSafetyNetEventRef\.current, true\)/);
});

test('rede de segurança: existe um timeout de segurança que força saída de "holding" mesmo sem nenhum evento (nunca ouvindo infinitamente)', async () => {
  const gesture = await source('./usePressAndHold.js');
  assert.match(gesture, /export const FAILSAFE_TIMEOUT_MS = 10_000;/);
  assert.match(gesture, /failsafeTimerRef\.current = setTimeout\(\(\) => \{\s*\n\s*finishRef\.current\?\.\(true\);/);
});

test('rede de segurança nunca ativa para o gesto de teclado (Enter/Espaço não é pointer)', async () => {
  const gesture = await source('./usePressAndHold.js');
  const beginBody = gesture.slice(gesture.indexOf('const begin = useCallback'), gesture.indexOf('const finish = useCallback'));
  const attachIdx = beginBody.indexOf('attachSafetyNet();');
  const guardIdx = beginBody.indexOf("if (source !== 'pointer') return;");
  assert.ok(guardIdx > -1 && attachIdx > guardIdx, 'attachSafetyNet() deve vir depois do guard de source !== pointer');
});

test('não mascara o bug com touch-action:none na área inteira -- fica só no botão de 53px, rolagem da Home continua livre', async () => {
  const css = await source('./UniInstantButton.module.css');
  const slotIdx = css.indexOf('.uniSlot {');
  const slotBlock = css.slice(slotIdx, css.indexOf('}', slotIdx));
  assert.doesNotMatch(slotBlock, /touch-action/);
  const globalTouchActionNone = [...css.matchAll(/touch-action:\s*none/g)];
  assert.equal(globalTouchActionNone.length, 1, 'touch-action: none deve aparecer só uma vez, escopado ao .uniButton');
});

test('rolagem permanece livre sem lock de body html ou shell', async () => {
  const files = await Promise.all([
    source('./UniInstantResultCard.jsx'),
    source('../../layouts/mobile-app-shell/UniCenterButton.jsx'),
  ]);
  assert.doesNotMatch(files.join('\n'), /style\.overflow|documentElement\.style|body\.style|scrollLock/i);
});

test('troca de rota preserva o botão e o controlador durante a captura', async () => {
  const integration = await source('../../layouts/mobile-app-shell/UniCenterButton.jsx');
  assert.doesNotMatch(integration, /key=\{pathname\}/);
  assert.doesNotMatch(integration, /captureActiveRef|cardOpen/);
});

test('reduced motion e ausencia de voz IA backend e HTTP sao preservados', async () => {
  const files = await Promise.all([
    source('./UniInstantButton.jsx'),
    source('./UniVoiceWaves.module.css'),
    source('./UniInstantResultCard.module.css'),
    source('../../layouts/mobile-app-shell/UniCenterButton.jsx'),
  ]);
  const contents = files.join('\n');
  assert.match(contents, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(contents, /fetch\s*\(|https?:\/\/|getUserMedia|SpeechRecognition|speechSynthesis|OpenAI|ElevenLabs|Supabase/i);
});

// ============================================================================
// UX4 -- descoberta e feedback do gesto de segurar o botao Uni para falar.
// Problema confirmado na UX1: o gesto existia mas nao tinha indicacao visual
// clara em repouso, entao dificilmente seria descoberto pelo usuario.
// ============================================================================

test('indicação "Segure para falar" fica visivel em repouso (idle) e enquanto pressiona, nao so durante o hold', async () => {
  const button = await source('./UniInstantButton.jsx');
  assert.match(button, /const HINT_VISIBLE_PHASES = new Set\(\['idle', 'pressing', 'listening'\]\);/);
  assert.match(button, /const hintVisible = HINT_VISIBLE_PHASES\.has\(phase\);/);
  assert.match(button, /Segure para falar/);
});

test('estado de captura mostra "Ouvindo…" enquanto o gesto de hold esta ativo', async () => {
  const button = await source('./UniInstantButton.jsx');
  assert.match(button, /const isListening = phase === 'listening';/);
  assert.match(button, /const hintText = isListening \? 'Ouvindo…' : 'Segure para falar';/);
});

test('"Ouvindo…" e anunciavel para leitor de tela (role="status"/aria-live), a dica em repouso e apenas decorativa (aria-hidden)', async () => {
  const button = await source('./UniInstantButton.jsx');
  assert.match(button, /role=\{isListening \? 'status' : undefined\}/);
  assert.match(button, /aria-live=\{isListening \? 'polite' : undefined\}/);
  assert.match(button, /aria-hidden=\{isListening \? undefined : 'true'\}/);
});

test('affordance permanente nunca depende so de animacao -- e texto real, nao so a onda/glow', async () => {
  const button = await source('./UniInstantButton.jsx');
  assert.doesNotMatch(button, /holdHint[\s\S]{0,40}aria-hidden="true"[\s\S]{0,10}\/>/);
  assert.match(button, />\s*\{hintText\}\s*</);
});

test('dica de primeiro uso e o mesmo elemento da indicacao permanente (sem duplicar texto em dois lugares)', async () => {
  const button = await source('./UniInstantButton.jsx');
  assert.match(button, /const showFirstUseHint = !hintSeen && !isListening;/);
  assert.match(button, /className=\{styles\.holdHint\}\s*\n\s*data-visible=\{hintVisible\}\s*\n\s*data-first-use="true"/);
});

test('dica de primeiro uso e persistida via localStorage com chave versionada, nunca no Supabase', async () => {
  assert.equal(UNI_VOICE_HINT_STORAGE_KEY, 'uniflow.uni-voice-hint.v1.seen');
  const storage = await source('./uniVoiceHintStorage.js');
  assert.doesNotMatch(storage, /supabase|fetch\s*\(|https?:\/\//i);
});

test('leitura/escrita da dica de primeiro uso nunca lanca excecao se o storage falhar (modo privado, quota, etc.)', () => {
  const throwingStorage = {
    getItem() { throw new Error('storage indisponível'); },
    setItem() { throw new Error('storage indisponível'); },
  };
  assert.doesNotThrow(() => readUniVoiceHintSeen(throwingStorage));
  assert.equal(readUniVoiceHintSeen(throwingStorage), false);
  assert.doesNotThrow(() => writeUniVoiceHintSeen(throwingStorage));
});

test('leitura da dica de primeiro uso sem storage disponivel (null) retorna false com seguranca', () => {
  assert.equal(readUniVoiceHintSeen(null), false);
});

test('escrita marca a chave como vista, e a leitura seguinte reflete isso (mesmo storage em memoria)', () => {
  const memory = new Map();
  const fakeStorage = {
    getItem: (key) => (memory.has(key) ? memory.get(key) : null),
    setItem: (key, value) => memory.set(key, value),
  };
  assert.equal(readUniVoiceHintSeen(fakeStorage), false);
  writeUniVoiceHintSeen(fakeStorage);
  assert.equal(readUniVoiceHintSeen(fakeStorage), true);
});

test('long press marca a dica como vista (handleHoldStart marca antes de delegar ao onHoldStart original)', async () => {
  const button = await source('./UniInstantButton.jsx');
  const fnBody = button.slice(button.indexOf('const handleHoldStart'), button.indexOf('const handleHoldStart') + 200);
  assert.match(fnBody, /markHintSeen\(\);/);
  assert.match(fnBody, /onHoldStart\?\.\(\);/);
});

test('dica de primeiro uso e dispensavel (botao real com onClick), nunca depende so de hover/tooltip', async () => {
  const button = await source('./UniInstantButton.jsx');
  assert.match(button, /<button\s*\n\s*type="button"\s*\n\s*className=\{styles\.holdHint\}/);
  assert.match(button, /onClick=\{markHintSeen\}/);
  assert.doesNotMatch(button, /:hover/);
});

test('teclado nunca simula long press -- Enter/Espaço sempre resolve como toque (abre a Uni), mesmo segurado', async () => {
  const gesture = await source('./usePressAndHold.js');
  const fnBody = gesture.slice(gesture.indexOf('const begin = useCallback'), gesture.indexOf('const finish = useCallback'));
  assert.match(fnBody, /if \(source !== 'pointer'\) return;/);
});

test('affordance permanente nao fica na barra inferior nem sobrepoe o toque no botao Uni (posicionada acima, absoluta)', async () => {
  const css = await source('./UniInstantButton.module.css');
  assert.match(css, /\.holdHint \{[\s\S]*?position: absolute;[\s\S]*?bottom: calc\(100% \+ var\(--uf-space-8\)\);/);
});

test('pulso de destaque do primeiro uso e desabilitado com prefers-reduced-motion', async () => {
  const css = await source('./UniInstantButton.module.css');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?button\.holdHint\[data-first-use='true'\]\[data-visible='true'\] \{ animation: none; \}/);
});

test('texto obsoleto de demonstracao foi removido', async () => {
  const card = await source('./UniInstantResultCard.jsx');
  assert.doesNotMatch(card, /a Uni ainda não ouve sua voz de verdade/);
  assert.doesNotMatch(card, /showDemoNote/);
});

test('nenhum texto tecnico como mockData exposto ao usuario (aparece so como parametro interno, nunca em string visivel)', async () => {
  const card = await source('./UniInstantResultCard.jsx');
  assert.doesNotMatch(card, /mockData/);
});
