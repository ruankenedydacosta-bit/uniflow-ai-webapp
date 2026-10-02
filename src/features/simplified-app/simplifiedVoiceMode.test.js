import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { UNI_RING_ORB_STATES } from '../../components/ui/UniRingOrb/uniRingOrbModel.js';
import { SIMPLIFIED_UNI_STATES } from './simplifiedHomeState.js';
import {
  resolveVoiceModeView,
  VOICE_MODE_ACTION_LABELS,
  VOICE_MODE_ACTIONS,
  VOICE_MODE_TONES,
} from './voiceModeState.js';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// ============================================================================
// Épico #99 — tela de voz em tela cheia, aberta por um toque.
// ============================================================================

test('todo estado da Home tem visão própria na tela de voz', () => {
  for (const state of Object.values(SIMPLIFIED_UNI_STATES)) {
    const view = resolveVoiceModeView(state);
    assert.ok(Object.values(UNI_RING_ORB_STATES).includes(view.orb), state);
    assert.ok(Object.values(VOICE_MODE_TONES).includes(view.tone), state);
    assert.ok(Object.values(VOICE_MODE_ACTIONS).includes(view.action), state);
    assert.ok(view.status, state);
  }
  assert.deepEqual(resolveVoiceModeView('desconhecido'), resolveVoiceModeView(SIMPLIFIED_UNI_STATES.IDLE));
});

test('ouvir, entender e rascunho seguem o design: Ouvindo, Entendendo, Rascunho pronto', () => {
  assert.equal(resolveVoiceModeView(SIMPLIFIED_UNI_STATES.LISTENING).status, 'Ouvindo');
  assert.equal(resolveVoiceModeView(SIMPLIFIED_UNI_STATES.LISTENING).orb, UNI_RING_ORB_STATES.LISTENING);
  for (const state of [
    SIMPLIFIED_UNI_STATES.TRANSCRIBING,
    SIMPLIFIED_UNI_STATES.INTERPRETING,
    SIMPLIFIED_UNI_STATES.SUCCESS,
  ]) {
    assert.equal(resolveVoiceModeView(state).status, 'Entendendo', state);
    assert.equal(resolveVoiceModeView(state).orb, UNI_RING_ORB_STATES.THINKING, state);
  }
  const draft = resolveVoiceModeView(SIMPLIFIED_UNI_STATES.WAITING_CONFIRMATION);
  assert.equal(draft.status, 'Rascunho pronto');
  assert.equal(draft.tone, VOICE_MODE_TONES.READY);
  assert.equal(resolveVoiceModeView(SIMPLIFIED_UNI_STATES.SPEAKING).orb, UNI_RING_ORB_STATES.SPEAKING);
});

test('o botão central faz uma coisa por estado: falar, enviar, parar a Uni ou aguardar', () => {
  assert.equal(resolveVoiceModeView(SIMPLIFIED_UNI_STATES.IDLE).action, VOICE_MODE_ACTIONS.START);
  assert.equal(resolveVoiceModeView(SIMPLIFIED_UNI_STATES.ERROR).action, VOICE_MODE_ACTIONS.START);
  assert.equal(resolveVoiceModeView(SIMPLIFIED_UNI_STATES.LISTENING).action, VOICE_MODE_ACTIONS.STOP_LISTENING);
  assert.equal(resolveVoiceModeView(SIMPLIFIED_UNI_STATES.SPEAKING).action, VOICE_MODE_ACTIONS.STOP_SPEAKING);
  // Enquanto a Uni processa, um toque não pode iniciar outra gravação.
  for (const state of [
    SIMPLIFIED_UNI_STATES.TRANSCRIBING,
    SIMPLIFIED_UNI_STATES.INTERPRETING,
    SIMPLIFIED_UNI_STATES.EXECUTING,
    SIMPLIFIED_UNI_STATES.SUCCESS,
  ]) {
    assert.equal(resolveVoiceModeView(state).action, VOICE_MODE_ACTIONS.NONE, state);
  }
  for (const action of Object.values(VOICE_MODE_ACTIONS)) {
    assert.ok(VOICE_MODE_ACTION_LABELS[action]?.label, action);
    assert.ok(VOICE_MODE_ACTION_LABELS[action]?.aria, action);
  }
});

test('um toque abre a tela e começa a ouvir no mesmo gesto (ativação exigida pelo iOS)', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  assert.match(
    home,
    /function handleOpenVoiceMode\(\) \{\s*setIsVoiceModeOpen\(true\);\s*beginVoiceCapture\(\);\s*\}/,
  );
});

test('Enviar encerra e manda para a transcrição; fechar descarta e para a fala da Uni', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  const finishIdx = home.indexOf('function finishVoiceCapture() {');
  const finish = home.slice(finishIdx, home.indexOf('\n  }\n', finishIdx));
  assert.match(finish, /if \(!voiceInput\.isActive\) return;/);
  assert.match(finish, /voiceInput\.stop\(\);/);
  assert.doesNotMatch(finish, /voiceInput\.cancel\(\)/);

  assert.match(
    home,
    /function handleVoiceModeAction\(action\) \{\s*if \(action === VOICE_MODE_ACTIONS\.START\) beginVoiceCapture\(\);\s*else if \(action === VOICE_MODE_ACTIONS\.STOP_LISTENING\) finishVoiceCapture\(\);\s*else if \(action === VOICE_MODE_ACTIONS\.STOP_SPEAKING\) voiceController\.stop\(\);\s*\}/,
  );
  assert.match(
    home,
    /function handleCloseVoiceMode\(\) \{\s*cancelVoiceCapture\('close-button'\);\s*if \(isVoicePlaybackInterruptible\) voiceController\.stop\(\);\s*setIsVoiceModeOpen\(false\);\s*\}/,
  );
});

test('a resposta e o rascunho aparecem uma vez só: na tela de voz quando aberta, na Home quando fechada', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  assert.match(home, /\{isVoiceModeOpen \? null : compactResponse\}/);
  assert.match(home, /response=\{isVoiceModeOpen \? compactResponse : null\}/);
  // Na tela de voz, o botão Conversa substitui o link "Ver conversa completa".
  assert.match(home, /showDetailsLink=\{!isVoiceModeOpen\}/);
  assert.match(home, /\{showDetailsLink \? \(\s*<Link className=\{styles\.detailsLink\}/);
});

test('tela de voz é um diálogo modal no body, fecha com Esc e devolve a rolagem da página', async () => {
  const modal = await source('./SimplifiedVoiceMode.jsx');
  assert.match(modal, /return createPortal\(/);
  assert.match(modal, /document\.body,\n\s*\);/);
  assert.match(modal, /role="dialog"/);
  assert.match(modal, /aria-modal="true"/);
  assert.match(modal, /aria-labelledby=\{titleId\}/);
  assert.match(modal, /if \(event\.key === 'Escape'\) onCloseRef\.current\?\.\(\);/);
  assert.match(modal, /document\.body\.style\.overflow = 'hidden';/);
  assert.match(modal, /document\.body\.style\.overflow = previousOverflow;/);
  assert.match(modal, /primaryButtonRef\.current\?\.focus\(\)/);
  assert.match(modal, /aria-label="Fechar"/);
});

test('controles de voz ficam fora do reenvio da saudação e não iniciam captura duas vezes', async () => {
  const modal = await source('./SimplifiedVoiceMode.jsx');
  // O listener da saudação (retryAfterUserGesture) ignora toques em
  // [data-uni-voice-control]; orb e botão central precisam da marcação.
  assert.equal((modal.match(/data-uni-voice-control/g) ?? []).length, 2);
  assert.match(modal, /if \(!isActionDisabled\) onAction\(view\.action\);/);
  assert.doesNotMatch(modal, /onPointerDown|onTouchStart/);
});

test('enquanto ouve, a tela mostra as ondas no lugar da resposta anterior', async () => {
  const modal = await source('./SimplifiedVoiceMode.jsx');
  assert.match(modal, /\{isListening \? <VoiceWave \/> : response\}/);
});

test('cores da tela de voz vêm dos tokens, sem hex solto', async () => {
  const css = await source('./simplifiedVoiceMode.module.css');
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i);
  assert.match(css, /var\(--uf-app-canvas\)/);
  assert.match(css, /z-index: var\(--uf-z-modal\);/);
  assert.match(css, /env\(safe-area-inset-bottom/);
});
