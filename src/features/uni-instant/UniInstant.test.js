import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { CANCEL_DRAG_PX, HOLD_THRESHOLD_MS } from './usePressAndHold.js';
import { resolveUniInstantContext } from './uniInstantContext.js';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('toque simples abre /uni-ai', async () => {
  const integration = await source('../../layouts/mobile-app-shell/UniCenterButton.jsx');
  assert.match(integration, /path = '\/uni-ai'/);
  assert.match(integration, /navigate\(path\)/);
});

test('hold de 400ms usa fluxo separado e nao navega', async () => {
  const integration = await source('../../layouts/mobile-app-shell/UniCenterButton.jsx');
  assert.equal(HOLD_THRESHOLD_MS, 400);
  assert.match(integration, /onHoldStart=\{handleHoldStart\}/);
  assert.doesNotMatch(integration.match(/const handleHoldStart[\s\S]*?\n {2}},/)?.[0] ?? '', /navigate/);
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

test('soltar encerra captura imediatamente', async () => {
  const integration = await source('../../layouts/mobile-app-shell/UniCenterButton.jsx');
  assert.match(integration, /captureActiveRef\.current = false/);
  assert.match(integration, /onHoldEnd=\{handleCaptureEnd\}/);
});

test('card central aparece somente apos soltar', async () => {
  const integration = await source('../../layouts/mobile-app-shell/UniCenterButton.jsx');
  assert.match(integration, /setCardOpen\(true\)/);
  assert.match(integration, /\{cardOpen \? \(/);
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

test('pipeline mockado usa audios contextuais sem executar acao', async () => {
  const integration = await source('../../layouts/mobile-app-shell/UniCenterButton.jsx');
  assert.match(integration, /playContext\('processing'/);
  assert.match(integration, /playContext\('error_understanding'/);
  assert.match(integration, /playContext\('confirmation_sensitive'/);
  assert.match(integration, /sensitive: true/);
});

test('nenhuma acao e executada sem confirmacao', async () => {
  const integration = await source('../../layouts/mobile-app-shell/UniCenterButton.jsx');
  assert.match(integration, /Nenhuma ação foi executada nesta simulação/);
  assert.doesNotMatch(integration, /transactionService|insert\s*\(|supabase/i);
});

test('timeout de seguranca encerra captura em 3 a 4 segundos', async () => {
  const integration = await source('../../layouts/mobile-app-shell/UniCenterButton.jsx');
  assert.match(integration, /CAPTURE_SAFETY_TIMEOUT_MS = 3500/);
  assert.match(integration, /after\(CAPTURE_SAFETY_TIMEOUT_MS, handleCaptureEnd\)/);
});

test('cancelamento por arraste nao mostra card', async () => {
  const integration = await source('../../layouts/mobile-app-shell/UniCenterButton.jsx');
  assert.equal(CANCEL_DRAG_PX, 56);
  const cancelHandler = integration.match(/const handleHoldCancel[\s\S]*?\n {2}},/)?.[0] ?? '';
  assert.match(cancelHandler, /setCardOpen\(false\)/);
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

test('desmontagem limpa timers listeners e pointer capture', async () => {
  const integration = await source('../../layouts/mobile-app-shell/UniCenterButton.jsx');
  const card = await source('./UniInstantResultCard.jsx');
  const gesture = await source('./usePressAndHold.js');
  assert.match(integration, /useEffect\(\(\) => clearTimers/);
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

test('troca de rota desmonta card e abrir tres vezes nao acumula estado', async () => {
  const integration = await source('../../layouts/mobile-app-shell/UniCenterButton.jsx');
  assert.match(integration, /key=\{pathname\}/);
  assert.match(integration, /setCardOpen\(false\)/);
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
