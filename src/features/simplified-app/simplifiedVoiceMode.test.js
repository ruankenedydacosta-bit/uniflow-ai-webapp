import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { UNI_RING_ORB_STATES } from '../../components/ui/UniRingOrb/uniRingOrbModel.js';
import { buildVoiceModeUrl, SIMPLIFIED_ROUTES, VOICE_MODE_SEARCH_PARAM } from './simplifiedRoutes.js';
import { REALTIME_STATUS } from '../uni-voice-realtime/realtimeSessionModel.js';
import {
  canMuteRealtimeConversation,
  resolveRealtimeVoiceModeView,
  resolveVoiceModeStage,
  selectVoiceConversationMessages,
  snapshotVoiceConversationStart,
  VOICE_MODE_ACTION_LABELS,
  VOICE_MODE_ACTIONS,
  VOICE_MODE_MUTE_LABELS,
  VOICE_MODE_TONES,
} from './voiceModeState.js';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// ============================================================================
// Épico #99 — tela de voz em tela cheia, aberta por um toque.
// ============================================================================

// #128 tirou a última conversa da Home. O rascunho pendente e o pedido em
// andamento continuam nela: sem o card não há como confirmar ou cancelar, e
// usePwaAutoUpdateBlock segura a atualização enquanto houver rascunho.
test('a Home não mostra a última conversa, só o pedido em andamento, o rascunho pendente e a resposta a um pedido feito nela', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  assert.match(home, /\{isVoiceModeOpen \? null : compactResponse\}/);
  assert.match(home, /response=\{isVoiceModeOpen \? compactResponse : null\}/);
  assert.match(home, /presentation=\{isVoiceModeOpen \? 'voice' : 'home'\}/);
  assert.match(
    home,
    /if \(!isVoicePresentation && !showProcessingIndicator && !pendingConfirmationMessage && !showHomeReply\) return null;/,
  );
  // Na Home, a resposta só aparece depois de um pedido feito ali: a última
  // resposta antiga é a base e só uma mais nova entra no card.
  assert.match(home, /const showHomeReply = Boolean\(homeReplyBaseline && lastUni && lastUni\.id !== homeReplyBaseline\.uniId\);/);
  assert.match(home, /\(isVoicePresentation \|\| showHomeReply\) && lastUni\?\.text \? \(/);
  // Confirmar, Editar e Cancelar no card da Home marcam a resposta seguinte;
  // fechar a tela de voz com pedido em andamento também. Abrir a voz limpa.
  for (const handler of ['handleCardConfirm', 'handleCardCancel', 'handleCardSaveEdit']) {
    const start = home.indexOf(`function ${handler}(`);
    assert.match(home.slice(start, home.indexOf('\n  }', start)), /markHomeReply\(\);/);
  }
  assert.match(home, /if \(!isVoiceModeOpen\) setHomeReplyBaseline\(\{ uniId: lastUniMessageId \}\);/);
  assert.match(
    home,
    /setHomeReplyBaseline\(!isVoiceModeOpen && isInteractionBusy \? \{ uniId: lastUniMessageId \} : null\);/,
  );
  assert.doesNotMatch(home, /<span>Você<\/span>/);
  assert.doesNotMatch(home, /Ver conversa completa/);
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

test('controles de voz agem no clique, uma vez por toque', async () => {
  const modal = await source('./SimplifiedVoiceMode.jsx');
  assert.match(modal, /function handleAction\(\) \{\s*onAction\(view\.action\);\s*\}/);
  assert.doesNotMatch(modal, /onPointerDown|onTouchStart/);
});

test('enquanto ouve, a tela mostra as ondas no lugar da resposta anterior', async () => {
  const modal = await source('./SimplifiedVoiceMode.jsx');
  // Sem minutos de voz (tela 19), ninguém está ouvindo: a onda não aparece.
  assert.match(modal, /\{stage\.showWaves && !minutesOut \? <VoiceWave \/> : response\}/);
});

// ============================================================================
// Épico #91 (#88) — tela 03 do redesign: Ouvindo, Entendendo, Rascunho pronto.
// ============================================================================

test('com rascunho pendente, a conversa em tempo real parada mostra "Rascunho pronto" em verde', () => {
  for (const status of [REALTIME_STATUS.LISTENING, REALTIME_STATUS.SPEAKING]) {
    const view = resolveRealtimeVoiceModeView(status, { hasPendingDraft: true });
    assert.equal(view.status, 'Rascunho pronto', status);
    assert.equal(view.tone, VOICE_MODE_TONES.READY, status);
    assert.equal(view.action, VOICE_MODE_ACTIONS.END_CONVERSATION, status);
  }
  // Quando a pessoa fala ou a Uni pensa, o status volta a Ouvindo/Entendendo.
  assert.equal(resolveRealtimeVoiceModeView(REALTIME_STATUS.USER_SPEAKING, { hasPendingDraft: true }).status, 'Ouvindo');
  assert.equal(resolveRealtimeVoiceModeView(REALTIME_STATUS.THINKING, { hasPendingDraft: true }).status, 'Entendendo');
  // Sem rascunho, nada muda.
  assert.equal(resolveRealtimeVoiceModeView(REALTIME_STATUS.LISTENING).status, 'Ouvindo');
});

test('as ondas aparecem enquanto a pessoa fala ou antes da primeira resposta; o orb encolhe com resposta ou rascunho', () => {
  const listening = resolveRealtimeVoiceModeView(REALTIME_STATUS.LISTENING);
  const speaking = resolveRealtimeVoiceModeView(REALTIME_STATUS.USER_SPEAKING);
  const thinking = resolveRealtimeVoiceModeView(REALTIME_STATUS.THINKING);
  const draft = resolveRealtimeVoiceModeView(REALTIME_STATUS.LISTENING, { hasPendingDraft: true });

  assert.deepEqual({ ...resolveVoiceModeStage({ view: listening }) }, { showWaves: true, compact: false });
  assert.deepEqual({ ...resolveVoiceModeStage({ view: listening, hasReply: true }) }, { showWaves: false, compact: true });
  assert.deepEqual({ ...resolveVoiceModeStage({ view: speaking, isUserSpeaking: true, hasReply: true }) }, { showWaves: true, compact: false });
  assert.deepEqual({ ...resolveVoiceModeStage({ view: thinking, hasReply: true }) }, { showWaves: false, compact: false });
  assert.deepEqual({ ...resolveVoiceModeStage({ view: draft, hasReply: true }) }, { showWaves: false, compact: true });
});

test('tela de voz segue o handoff: 34 barras, transcrição com cursor e Escrever, Parar, Conversa', async () => {
  const modal = await source('./SimplifiedVoiceMode.jsx');
  const css = await source('./simplifiedVoiceMode.module.css');
  assert.match(modal, /const WAVE_BAR_COUNT = 34;/);
  assert.match(modal, /className=\{styles\.transcript\}/);
  assert.match(modal, /isUserSpeaking \? <span className=\{styles\.caret\} aria-hidden="true">\|<\/span> : null/);
  assert.match(modal, /<span className=\{styles\.workspace\}>\{workspaceLabel\}<\/span>/);
  assert.match(modal, />Escrever</);
  assert.match(modal, />Conversa</);
  assert.equal(VOICE_MODE_ACTION_LABELS[VOICE_MODE_ACTIONS.END_CONVERSATION].label, 'Parar');
  assert.match(css, /\.transcript \{[^}]*font-size: 22px;/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test('microfone mutado: a tela diz que a Uni não ouve, sem ondas, e o botão continua encerrando', () => {
  for (const status of [REALTIME_STATUS.LISTENING, REALTIME_STATUS.USER_SPEAKING]) {
    const view = resolveRealtimeVoiceModeView(status, { isMuted: true, hasPendingDraft: true });
    assert.equal(view.status, 'Microfone desligado', status);
    assert.equal(view.tone, VOICE_MODE_TONES.MUTED, status);
    assert.equal(view.orb, UNI_RING_ORB_STATES.IDLE, status);
    assert.equal(view.action, VOICE_MODE_ACTIONS.END_CONVERSATION, status);
    assert.equal(resolveVoiceModeStage({ view, isUserSpeaking: true }).showWaves, false, status);
  }
  // A Uni falando ou pensando segue igual com o microfone mutado.
  assert.equal(resolveRealtimeVoiceModeView(REALTIME_STATUS.SPEAKING, { isMuted: true }).status, 'Falando');
  assert.equal(resolveRealtimeVoiceModeView(REALTIME_STATUS.THINKING, { isMuted: true }).status, 'Entendendo');
});

test('Mutar só aparece com a conversa conectada', () => {
  for (const status of [REALTIME_STATUS.LISTENING, REALTIME_STATUS.USER_SPEAKING, REALTIME_STATUS.THINKING, REALTIME_STATUS.SPEAKING]) {
    assert.equal(canMuteRealtimeConversation(status), true, status);
  }
  for (const status of [REALTIME_STATUS.IDLE, REALTIME_STATUS.CONNECTING, REALTIME_STATUS.ENDED, REALTIME_STATUS.ERROR]) {
    assert.equal(canMuteRealtimeConversation(status), false, status);
  }
  assert.equal(VOICE_MODE_MUTE_LABELS.unmuted.label, 'Mutar');
  assert.equal(VOICE_MODE_MUTE_LABELS.muted.label, 'Desmutar');
});

test('Mutar desliga a trilha do microfone sem fechar a conversa e volta ligado na próxima', async () => {
  const hook = await source('../uni-voice-realtime/useRealtimeVoiceSession.js');
  assert.match(hook, /track\.enabled = !muted;/);
  // Mutar durante a conexão vale para o microfone que abriu depois.
  assert.match(hook, /ensureActive\(\);\s*\/\/[^\n]*\n\s*setLocalStreamMuted\(connection\.localStream, connection\.muted\);/);
  // Encerrar zera o estado: a conversa seguinte abre com o microfone ligado.
  assert.match(hook, /if \(connection\) closeConnection\(connection\);\s*setIsMuted\(false\);/);

  const modal = await source('./SimplifiedVoiceMode.jsx');
  assert.match(modal, /aria-pressed=\{microphone\.isMuted\}/);
  assert.match(modal, /microphone\.isMuted \? <PhMicrophoneSlashIcon \/> : <PhMicrophoneIcon \/>/);

  const home = await source('./SimplifiedHomeView.jsx');
  assert.match(home, /microphone=\{canMuteRealtimeConversation\(realtime\.state\.status\)/);
  assert.match(home, /onToggle: \(\) => realtime\.setMuted\(!realtime\.isMuted\)/);
});

test('na tela de voz a resposta perde a caixa e o card de rascunho vai em vidro', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  assert.match(home, /presentation=\{isVoiceModeOpen \? 'voice' : 'home'\}/);
  assert.match(home, /appearance=\{isVoicePresentation \? 'glass' : 'default'\}/);
  // O card continua chamando a mesma confirmação: nada é gravado sem Confirmar.
  // É o rascunho pendente que aparece, mesmo depois de outra resposta da Uni.
  assert.match(home, /onConfirm=\{\(\) => onConfirmAction\(pendingConfirmationMessage\.id\)\}/);
});

test('cores da tela de voz vêm dos tokens, sem hex solto', async () => {
  const css = await source('./simplifiedVoiceMode.module.css');
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i);
  assert.match(css, /var\(--uf-app-canvas\)/);
  assert.match(css, /z-index: var\(--uf-z-modal\);/);
  assert.match(css, /env\(safe-area-inset-bottom/);
});

// ============================================================================
// Épico #99 (#102) — o orb da barra inferior abre a tela de voz de qualquer aba.
// ============================================================================

test('o orb da barra leva à Home com ?falar=1', () => {
  assert.equal(VOICE_MODE_SEARCH_PARAM, 'falar');
  assert.equal(buildVoiceModeUrl(), `${SIMPLIFIED_ROUTES.HOME}?falar=1`);
});

test('a Home consome ?falar uma vez, sem nova entrada no histórico, e abre a tela já ouvindo', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  assert.match(home, /const wantsVoiceMode = searchParams\.has\(VOICE_MODE_SEARCH_PARAM\);/);
  assert.match(home, /next\.delete\(VOICE_MODE_SEARCH_PARAM\);/);
  assert.match(home, /\}, \{ replace: true \}\);/);
  assert.match(home, /openVoiceModeRef\.current = handleOpenRealtimeVoiceMode;/);
});

test('cada toque no orb abre a tela uma vez, mesmo com o efeito rodando duas vezes', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  assert.match(home, /const voiceRequestKey = location\.key;/);
  assert.match(
    home,
    /if \(!wantsVoiceMode \|\| handledVoiceRequestKeyRef\.current === voiceRequestKey\) return;\s*handledVoiceRequestKeyRef\.current = voiceRequestKey;/,
  );
  // A ref que abre a tela é preenchida por um efeito declarado ANTES do que
  // a lê: efeitos rodam na ordem do código.
  assert.ok(
    home.indexOf('openVoiceModeRef.current = handleOpenRealtimeVoiceMode;')
      < home.indexOf('const wantsVoiceMode = searchParams.has'),
  );
});

test('rótulos da barra cabem em cinco colunas de 360px', async () => {
  const css = await source('./simplifiedApp.module.css');
  const rule = css.slice(css.indexOf('.navigationItem {'), css.indexOf('}', css.indexOf('.navigationItem {')));
  // Redesign (épico #91): rótulo de 11px, como no handoff.
  assert.match(rule, /font-size: 11px;/);
  // O orb sobe acima da barra: o recorte só vale com a barra escondida.
  const nav = css.slice(css.indexOf('.bottomNavigation {'), css.indexOf('}', css.indexOf('.bottomNavigation {')));
  assert.match(nav, /overflow: visible;/);
  const hidden = css.slice(css.indexOf('.bottomNavigationHidden {'), css.indexOf('}', css.indexOf('.bottomNavigationHidden {')));
  assert.match(hidden, /overflow: hidden;/);
  // Linha superior em degradê que some nas pontas.
  const line = css.slice(css.indexOf('.bottomNavigation::before {'), css.indexOf('}', css.indexOf('.bottomNavigation::before {')));
  assert.match(line, /background: var\(--uf-app-rule-fade\);/);
});

// ============================================================================
// Épico #116 — conversa por voz em tempo real.
// ============================================================================

test('todo estado da conversa em tempo real tem visão própria na tela de voz', () => {
  for (const status of Object.values(REALTIME_STATUS)) {
    const view = resolveRealtimeVoiceModeView(status);
    assert.ok(Object.values(UNI_RING_ORB_STATES).includes(view.orb), status);
    assert.ok(Object.values(VOICE_MODE_TONES).includes(view.tone), status);
    assert.ok(Object.values(VOICE_MODE_ACTIONS).includes(view.action), status);
    assert.ok(view.status, status);
    assert.ok(VOICE_MODE_ACTION_LABELS[view.action], status);
  }
  assert.deepEqual(resolveRealtimeVoiceModeView('desconhecido'), resolveRealtimeVoiceModeView(REALTIME_STATUS.IDLE));
});

test('na conversa em tempo real não existe Enviar: o botão central só encerra', () => {
  for (const status of [
    REALTIME_STATUS.CONNECTING,
    REALTIME_STATUS.LISTENING,
    REALTIME_STATUS.USER_SPEAKING,
    REALTIME_STATUS.THINKING,
    REALTIME_STATUS.SPEAKING,
  ]) {
    assert.equal(resolveRealtimeVoiceModeView(status).action, VOICE_MODE_ACTIONS.END_CONVERSATION, status);
  }
  // Redesign (épico #91, tela 03): o botão central se chama "Parar".
  assert.equal(VOICE_MODE_ACTION_LABELS[VOICE_MODE_ACTIONS.END_CONVERSATION].label, 'Parar');
  assert.equal(resolveRealtimeVoiceModeView(REALTIME_STATUS.ENDED).action, VOICE_MODE_ACTIONS.START);
  assert.equal(resolveRealtimeVoiceModeView(REALTIME_STATUS.SPEAKING).orb, UNI_RING_ORB_STATES.SPEAKING);
});

test('a tela de voz abre a conversa em tempo real no mesmo toque e o botão central encerra', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  // A conexão continua no mesmo toque; só não acontece com o saldo zerado.
  assert.match(home, /function handleOpenRealtimeVoiceMode\(\) \{\s*setIsVoiceModeOpen\(true\);\s*if \(isVoiceMinutesOut\) refreshVoiceMinutes\(\);\s*else beginRealtimeConversation\(\);\s*\}/);
  assert.match(home, /action === VOICE_MODE_ACTIONS\.END_CONVERSATION\) stopRealtime\('user'\)/);
  assert.match(home, /view=\{resolveRealtimeVoiceModeView\(realtime\.state\.status, \{\s*hasPendingDraft: voiceHasPendingDraft,\s*isMuted: realtime\.isMuted,\s*\}\)\}/);
});

test('fechar, ir para o chat ou deixar o app em segundo plano encerra a conversa em tempo real', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  assert.match(home, /function handleCloseRealtimeVoiceMode\(\) \{\s*stopRealtime\('user'\);/);
  assert.match(home, /function handleLeaveRealtimeVoiceModeToChat\(\) \{\s*stopRealtime\('user'\);/);
  assert.match(home, /if \(isRealtimeActiveRef\.current\) stopRealtimeRef\.current\?\.\('lifecycle'\);/);
});

test('o chat não fala as respostas: a única voz é a da conversa em tempo real', async () => {
  const chat = await source('../uni-chat/UniChatPage.jsx');
  assert.doesNotMatch(chat, /uni-voice-tts|uniVoice\.speak|handleAutomaticSpeakMessage|onRealtimeVoiceActiveChange/);
});

test('a conversa em tempo real é o padrão: não existe flag para desligá-la', async () => {
  const { resolveSimplifiedFeatureFlags } = await import('./simplifiedFeatureFlags.js');
  assert.equal('realtimeVoiceEnabled' in resolveSimplifiedFeatureFlags({ VITE_UNI_REALTIME_VOICE_ENABLED: 'true' }), false);
  const env = await source('../../../.env.example');
  assert.doesNotMatch(env, /VITE_UNI_REALTIME_VOICE_ENABLED/);
});

test('sem minutos ou sem assinatura, a tela de voz manda a pessoa para o texto', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  assert.match(home, /REALTIME_TEXT_FALLBACK_CODES = new Set\(\['VOICE_QUOTA_EXHAUSTED', 'SUBSCRIPTION_INACTIVE'\]\)/);
  assert.match(home, /endReason === 'quota'\) \{\s*return 'Seus minutos de conversa por voz deste mês acabaram\. Continue pelo texto\. Toque em Escrever\.';/);
});

test('conversa encerrada diz como começar outra', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  assert.match(home, /REALTIME_RESTART_HINT = 'Toque na Uni para começar uma nova conversa\.'/);
  assert.match(home, /if \(status === REALTIME_STATUS\.ENDED\) return REALTIME_RESTART_HINT;/);
  assert.match(home, /ninguém falou por um minuto\. \$\{REALTIME_RESTART_HINT\}/);
});

test('a conversa por voz começa sem a troca da conversa anterior', () => {
  const anteriores = [
    { id: 'u1', from: 'user', text: 'Pode confirmar.' },
    { id: 'a1', from: 'uni', text: 'Foi em Alimentação, no valor de R$ 50,00.' },
  ];
  const previousIds = snapshotVoiceConversationStart(anteriores);
  assert.deepEqual(selectVoiceConversationMessages(anteriores, previousIds), []);

  const novas = [...anteriores, { id: 'u2', from: 'user', text: 'Quanto gastei hoje?' }];
  assert.deepEqual(selectVoiceConversationMessages(novas, previousIds).map((m) => m.id), ['u2']);
});

test('o rascunho esperando confirmação continua na tela de voz, com o pedido que o gerou', () => {
  const anteriores = [
    { id: 'u0', from: 'user', text: 'Oi' },
    { id: 'a0', from: 'uni', text: 'Oi!' },
    { id: 'u1', from: 'user', text: 'Gastei 50 no mercado' },
    { id: 'a1', from: 'uni', text: 'Confere?', confirmation: { status: 'pending' } },
  ];
  const previousIds = snapshotVoiceConversationStart(anteriores);
  assert.deepEqual(selectVoiceConversationMessages(anteriores, previousIds).map((m) => m.id), ['u1', 'a1']);
});

test('cada conversa por voz, inclusive a reaberta pelo orb, esconde as mensagens anteriores', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  assert.match(home, /selectVoiceConversationMessages\(messages, voiceConversationPreviousIds\)/);
  const begin = home.slice(home.indexOf('function beginRealtimeConversation() {'));
  assert.match(begin, /^[^}]*setVoiceConversationPreviousIds\(snapshotVoiceConversationStart\(messages\)\);/);
});
