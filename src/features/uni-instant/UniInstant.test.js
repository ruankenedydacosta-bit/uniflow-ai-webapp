import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { CANCEL_DRAG_PX, HOLD_THRESHOLD_MS } from './usePressAndHold.js';
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

test('hold de 400ms abre a conversa com captura real solicitada', async () => {
  const integration = await source('../../layouts/mobile-app-shell/UniCenterButton.jsx');
  assert.equal(HOLD_THRESHOLD_MS, 400);
  assert.match(integration, /onHoldStart=\{handleHoldStart\}/);
  assert.match(integration, /startVoiceCapture: true/);
  assert.match(integration, /voiceCaptureSource: 'uni_center_hold'/);
  assert.match(integration.match(/const handleHoldStart[\s\S]*?\n {2}},/)?.[0] ?? '', /navigate\(path/);
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
  assert.match(context.response, /Registrar despesa de R\$ 25,00/);
});

test('captura real e iniciada pelo ChatInput apos a navegacao do hold', async () => {
  const integration = await source('../../layouts/mobile-app-shell/UniCenterButton.jsx');
  const chat = await source('../uni-chat/components/ChatInput.jsx');
  assert.match(integration, /startVoiceCapture: true/);
  assert.match(chat, /autoStartVoice/);
  assert.match(chat, /startVoice\(\)\.finally/);
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

test('rolagem permanece livre sem lock de body html ou shell', async () => {
  const files = await Promise.all([
    source('./UniInstantResultCard.jsx'),
    source('../../layouts/mobile-app-shell/UniCenterButton.jsx'),
  ]);
  assert.doesNotMatch(files.join('\n'), /style\.overflow|documentElement\.style|body\.style|scrollLock/i);
});

test('troca de rota remonta o botao sem manter estado de captura local', async () => {
  const integration = await source('../../layouts/mobile-app-shell/UniCenterButton.jsx');
  assert.match(integration, /key=\{pathname\}/);
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
