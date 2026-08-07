import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  SIMPLIFIED_NAVIGATION,
  SIMPLIFIED_ROUTES,
} from './simplifiedRoutes.js';
import {
  findPersonalWorkspace,
  resolveSimplifiedContextStatus,
  SIMPLIFIED_CONTEXT_STATUS,
  SIMPLIFIED_PRODUCT_CONFIG,
} from './simplifiedProductConfig.js';
import { SIMPLIFIED_UNI_STATES } from './simplifiedHomeState.js';
import { resolveSimplifiedGreeting } from './simplifiedGreeting.js';
import { resolveInitialConversationState } from '../uni-chat/chatHistory.js';
import {
  buildCategorySummaries,
  filterRecordTransactions,
  getMonthRange,
  summarizeMonth,
} from './simplifiedRecordsData.js';
import {
  buildWelcomeSessionKey,
  claimWelcomeVoice,
  clearWelcomeVoiceBlocked,
  getWelcomeVoiceBlocked,
  isWelcomeVoicePending,
  markWelcomeVoiceBlocked,
  markWelcomeVoiceSettled,
  releaseWelcomeVoice,
  resetWelcomeVoiceSessions,
} from './welcomeVoiceSession.js';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('navegação simplificada possui somente Home, Registros e Conta', () => {
  assert.deepEqual(
    SIMPLIFIED_NAVIGATION.map(({ label, path }) => ({ label, path })),
    [
      { label: 'Home', path: '/app/home' },
      { label: 'Registros', path: '/app/registros' },
      { label: 'Conta', path: '/app/conta' },
    ],
  );
  assert.equal(Object.isFrozen(SIMPLIFIED_NAVIGATION), true);
  assert.equal(Object.isFrozen(SIMPLIFIED_NAVIGATION[0]), true);
  assert.equal(Object.isFrozen(SIMPLIFIED_ROUTES), true);
});

test('configuração simplificada é imutável e declara somente o produto pessoal', () => {
  assert.deepEqual(SIMPLIFIED_PRODUCT_CONFIG, {
    id: 'personal',
    workspaceType: 'personal',
    chatMode: 'pessoal',
  });
  assert.equal(Object.isFrozen(SIMPLIFIED_PRODUCT_CONFIG), true);
  assert.equal(SIMPLIFIED_ROUTES.UNI, '/app/uni');
});

test('workspace Empresa stale exige ativação do workspace Pessoal', () => {
  const personalWorkspace = { id: 'personal-1', workspace_type: 'personal' };
  const businessWorkspace = { id: 'business-1', workspace_type: 'business' };

  assert.equal(
    findPersonalWorkspace([businessWorkspace, personalWorkspace]),
    personalWorkspace,
  );
  assert.equal(
    resolveSimplifiedContextStatus({
      currentWorkspace: businessWorkspace,
      personalWorkspace,
      isSupabaseConfigured: true,
    }),
    SIMPLIFIED_CONTEXT_STATUS.ACTIVATING,
  );
  assert.equal(
    resolveSimplifiedContextStatus({
      currentWorkspace: personalWorkspace,
      personalWorkspace,
      isSupabaseConfigured: true,
    }),
    SIMPLIFIED_CONTEXT_STATUS.READY,
  );
});

test('contexto simplificado nunca usa Empresa como fallback quando Pessoal não existe', () => {
  assert.equal(
    resolveSimplifiedContextStatus({
      currentWorkspace: { id: 'business-1', workspace_type: 'business' },
      personalWorkspace: null,
      isSupabaseConfigured: true,
    }),
    SIMPLIFIED_CONTEXT_STATUS.MISSING,
  );
});

test('histórico Empresa ativo não vaza para a conversa simplificada Pessoal', () => {
  const personal = {
    id: 'personal-chat',
    mode: 'pessoal',
    messages: [{ id: 'p1', from: 'user', text: 'Meu saldo pessoal' }],
  };
  const business = {
    id: 'business-chat',
    mode: 'empresa',
    messages: [{ id: 'b1', from: 'user', text: 'Faturamento da empresa' }],
  };
  const result = resolveInitialConversationState({
    conversations: [business, personal],
    activeId: business.id,
    lockedMode: 'pessoal',
  });

  assert.equal(result.activeId, personal.id);
  assert.deepEqual(result.messages, personal.messages);
  assert.doesNotMatch(JSON.stringify(result.messages), /empresa|faturamento/i);
});

test('ausência de histórico Pessoal cria conversa vazia sem copiar mensagens Empresa', () => {
  const result = resolveInitialConversationState({
    conversations: [{
      id: 'business-chat',
      mode: 'empresa',
      messages: [{ id: 'b1', text: 'Contrato empresarial' }],
    }],
    activeId: 'business-chat',
    lockedMode: 'pessoal',
  });

  assert.equal(result.created, true);
  assert.equal(result.mode, 'pessoal');
  assert.deepEqual(result.messages, []);
  assert.equal(result.conversations.at(-1).mode, 'pessoal');
});

test('saudação usa primeiro nome real sem inferir tratamento', () => {
  const greeting = resolveSimplifiedGreeting(
    { full_name: 'Ricardo Almeida' },
    { email: 'ricardo@example.com' },
  );
  assert.equal(greeting.name, 'Ricardo');
  assert.equal(greeting.heading, 'Ricardo');
  assert.equal(greeting.salutation, '');
  assert.deepEqual(greeting.visualGreeting, { eyebrow: 'Boas-vindas,', name: 'Ricardo' });
  assert.equal(greeting.hasKnownName, true);
  assert.equal(Object.isFrozen(greeting), true);
});

test('saudação respeita tratamento explícito e usa fallback seguro', () => {
  assert.equal(
    resolveSimplifiedGreeting({
      preferred_name: 'Helena',
      treatment_preference: 'senhora',
    }).heading,
    'senhora Helena',
  );
  assert.equal(resolveSimplifiedGreeting({}, {}).heading, 'você');
  assert.doesNotMatch(resolveSimplifiedGreeting({ full_name: 'Ana Souza' }).heading, /senhora/i);
});

test('Home usa a mesma saudação estruturada no texto e no TTS', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  assert.match(home, /useMemo\(\s*\(\) => resolveSimplifiedGreeting\(profile, user\),\s*\[profile, user\]/);
  assert.match(home, /greeting\.visualGreeting\.eyebrow/);
  assert.match(home, /greeting\.displayName/);
  assert.doesNotMatch(home, /<h1[^>]*>\{greeting\.addressedName\}<\/h1>/);
  assert.match(home, /voiceController\.speak\(greeting\.spokenGreeting,\s*\{/);
  assert.doesNotMatch(home, /<p>Seja bem-vindo,/);
});

test('boas-vindas por voz são reivindicadas uma vez por sessão autenticada', () => {
  resetWelcomeVoiceSessions();
  const sessionKey = buildWelcomeSessionKey(
    { id: 'user-a' },
    { expires_at: 12345 },
  );

  assert.equal(claimWelcomeVoice(sessionKey), true);
  assert.equal(claimWelcomeVoice(sessionKey), false);
  releaseWelcomeVoice(sessionKey);
  assert.equal(claimWelcomeVoice(sessionKey), true);
  resetWelcomeVoiceSessions();
});

test('chave da saudação é ESTÁVEL durante o login -- preferência a last_sign_in_at sobre expires_at (TOKEN_REFRESHED silencioso não refaz a saudação ao voltar para Home)', () => {
  resetWelcomeVoiceSessions();
  const user = { id: 'user-a' };
  const primeiraChave = buildWelcomeSessionKey(user, {
    user: { last_sign_in_at: '2026-07-01T10:00:00.000Z' },
    expires_at: 1000,
  });
  // Token expira e renova silenciosamente enquanto o usuário navega
  // Home → Registros/Conta/Uni → Home: expires_at muda, last_sign_in_at não.
  const aposRefresh = buildWelcomeSessionKey(user, {
    user: { last_sign_in_at: '2026-07-01T10:00:00.000Z' },
    expires_at: 2000,
  });
  assert.equal(aposRefresh, primeiraChave, 'a chave NÃO deve mudar quando o token renova');
  assert.equal(claimWelcomeVoice(aposRefresh), true);
  assert.equal(claimWelcomeVoice(primeiraChave), false, 'voltar para Home não refaz a saudação');
  resetWelcomeVoiceSessions();
});

test('chave da saudação muda entre logins distintos do mesmo usuário -- novo login volta a dar boas-vindas', () => {
  resetWelcomeVoiceSessions();
  const user = { id: 'user-a' };
  const primeiroLogin = buildWelcomeSessionKey(user, {
    user: { last_sign_in_at: '2026-07-01T10:00:00.000Z' },
  });
  const segundoLogin = buildWelcomeSessionKey(user, {
    user: { last_sign_in_at: '2026-07-02T10:00:00.000Z' },
  });
  assert.notEqual(segundoLogin, primeiroLogin);
  assert.equal(claimWelcomeVoice(primeiroLogin), true);
  assert.equal(claimWelcomeVoice(segundoLogin), true);
  resetWelcomeVoiceSessions();
});

test('chave da saudação é nula sem usuário autenticado -- modo demo nunca bloqueia', () => {
  resetWelcomeVoiceSessions();
  assert.equal(buildWelcomeSessionKey(null, null), null);
  assert.equal(buildWelcomeSessionKey({ id: '' }, { expires_at: 1 }), null);
  resetWelcomeVoiceSessions();
});

// ============================================================================
// BLOCO VOZ HIDRATAÇÃO (reload/login): a saudação tem prioridade exclusiva
// sobre o autoplay de mensagens. Enquanto a voz da saudação estiver
// preparando/carregando/tocando (claimWelcomeVoice sem markWelcomeVoiceSettled),
// o autoplay de mensagens fica bloqueado; terminar OU falhar libera.
// ============================================================================

test('saudação pendente bloqueia o autoplay: claim marca pending e markWelcomeVoiceSettled libera (terminou ou falhou)', () => {
  resetWelcomeVoiceSessions();
  const key = buildWelcomeSessionKey({ id: 'user-a' }, { expires_at: 12345 });
  assert.equal(isWelcomeVoicePending(key), false, 'antes de reivindicar nunca está pendente');
  assert.equal(claimWelcomeVoice(key), true);
  assert.equal(isWelcomeVoicePending(key), true, 'reivindicada mas ainda preparando/carregando/tocando -> pendente (autoplay bloqueado)');
  markWelcomeVoiceSettled(key);
  assert.equal(isWelcomeVoicePending(key), false, 'terminou ou falhou -> autoplay liberado');
  resetWelcomeVoiceSessions();
});

test('releaseWelcomeVoice também limpa o estado pendente -- reivindicação nova volta a tocar sem travar o autoplay', () => {
  resetWelcomeVoiceSessions();
  const key = buildWelcomeSessionKey({ id: 'user-a' }, { expires_at: 12345 });
  claimWelcomeVoice(key);
  assert.equal(isWelcomeVoicePending(key), true);
  releaseWelcomeVoice(key);
  assert.equal(isWelcomeVoicePending(key), false);
  assert.equal(claimWelcomeVoice(key), true);
  assert.equal(isWelcomeVoicePending(key), true);
  resetWelcomeVoiceSessions();
});

test('chave nula ou vazia nunca fica pendente -- modo demo não bloqueia o autoplay', () => {
  resetWelcomeVoiceSessions();
  assert.equal(isWelcomeVoicePending(null), false);
  assert.equal(isWelcomeVoicePending(''), false);
  markWelcomeVoiceSettled(null);
  markWelcomeVoiceSettled('');
  resetWelcomeVoiceSessions();
});

// ============================================================================
// BUGFIX iOS (saudação perdida ao remontar a Home): autoplay bloqueado pelo
// Safari (NotAllowedError) precisa sobreviver a Home desmontar/remontar, já
// que claimWelcomeVoice só libera UMA tentativa automática por sessão.
// ============================================================================

test('markWelcomeVoiceBlocked persiste o erro -- sobrevive a "remontagem" (nova leitura simulando useState novo)', () => {
  resetWelcomeVoiceSessions();
  const key = buildWelcomeSessionKey({ id: 'user-a' }, { expires_at: 12345 });
  assert.equal(getWelcomeVoiceBlocked(key), null, 'antes de qualquer tentativa não há erro bloqueado');
  const autoplayError = { code: 'AUTOPLAY_BLOCKED', message: 'Não foi possível tocar automaticamente.' };
  markWelcomeVoiceBlocked(key, autoplayError);
  assert.deepEqual(getWelcomeVoiceBlocked(key), autoplayError, 'erro persiste para uma nova leitura, como um remount faria');
  resetWelcomeVoiceSessions();
});

test('clearWelcomeVoiceBlocked remove o erro quando a saudação finalmente toca com sucesso', () => {
  resetWelcomeVoiceSessions();
  const key = buildWelcomeSessionKey({ id: 'user-a' }, { expires_at: 12345 });
  markWelcomeVoiceBlocked(key, { code: 'AUTOPLAY_BLOCKED' });
  assert.notEqual(getWelcomeVoiceBlocked(key), null);
  clearWelcomeVoiceBlocked(key);
  assert.equal(getWelcomeVoiceBlocked(key), null);
  resetWelcomeVoiceSessions();
});

test('releaseWelcomeVoice também limpa o erro bloqueado persistido', () => {
  resetWelcomeVoiceSessions();
  const key = buildWelcomeSessionKey({ id: 'user-a' }, { expires_at: 12345 });
  markWelcomeVoiceBlocked(key, { code: 'AUTOPLAY_BLOCKED' });
  releaseWelcomeVoice(key);
  assert.equal(getWelcomeVoiceBlocked(key), null);
  resetWelcomeVoiceSessions();
});

test('chave nula ou vazia nunca é marcada/lida como bloqueada', () => {
  resetWelcomeVoiceSessions();
  markWelcomeVoiceBlocked(null, { code: 'AUTOPLAY_BLOCKED' });
  markWelcomeVoiceBlocked('', { code: 'AUTOPLAY_BLOCKED' });
  assert.equal(getWelcomeVoiceBlocked(null), null);
  assert.equal(getWelcomeVoiceBlocked(''), null);
  resetWelcomeVoiceSessions();
});

test('SimplifiedHomeView inicializa welcomeVoiceError a partir do erro persistido (não de useState(null)) e sincroniza quando sessionKey muda', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  assert.match(
    home,
    /useState\(\(\) => getWelcomeVoiceBlocked\(sessionKey\)\)/,
    'estado inicial deve vir do módulo persistido, não de null fixo',
  );
  assert.match(
    home,
    /if \(sessionKey !== prevSessionKey\) \{\s*setPrevSessionKey\(sessionKey\);\s*setWelcomeVoiceError\(getWelcomeVoiceBlocked\(sessionKey\)\);\s*\}/,
  );
});

test('SimplifiedHomeView persiste sucesso/erro da saudação via markWelcomeVoiceBlocked/clearWelcomeVoiceBlocked', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  assert.match(home, /markWelcomeVoiceBlocked\(sessionKey, error\)/);
  assert.match(home, /clearWelcomeVoiceBlocked\(sessionKey\)/);
});

test('Home reutiliza o controlador compartilhado e não cria capturador paralelo', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  assert.match(home, /useSharedUniVoiceInput\(\)/);
  assert.match(home, /voiceInput\.start\(\)/);
  assert.match(home, /voiceInput\.stop\(\)/);
  assert.match(home, /voiceInput\.cancel/);
  assert.match(home, /voiceInput\.registerHandlers/);
  assert.doesNotMatch(home, /new MediaRecorder|navigator\.mediaDevices|getUserMedia/);
});

// ============================================================================
// PUSH-TO-TALK: pressionar e segurar grava, soltar encerra e envia -- nunca
// redireciona para /app/uni. Só "Ver conversa completa" (e o link de editar
// uma confirmação pendente, ação explícita e separada) navega para lá.
// ============================================================================

test('pointerdown inicia a captura via beginVoiceCapture -- nunca navega', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  const idx = home.indexOf('function handleVoicePointerDown(event) {');
  assert.ok(idx > -1);
  const slice = home.slice(idx, idx + 400);
  assert.match(slice, /if \(!beginVoiceCapture\(\)\) return;/);
  assert.match(slice, /pressedGestureRef\.current = event\.pointerId;/);
  assert.doesNotMatch(slice, /navigate\(/);
});

test('pointerdown chama setPointerCapture com o pointerId do evento -- garante que pointerup/move continuem chegando neste botão mesmo se o dedo sair da área visual', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  const idx = home.indexOf('function handleVoicePointerDown(event) {');
  const slice = home.slice(idx, idx + 400);
  assert.match(slice, /event\.currentTarget\.setPointerCapture\?\.\(event\.pointerId\);/);
});

test('BUG REAL: pointerup de um pointerId diferente do que iniciou a gravação é ignorado -- nunca encerra o gesto de outro dedo', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  const idx = home.indexOf('function handleVoicePointerUp(event) {');
  const slice = home.slice(idx, idx + 200);
  assert.match(slice, /if \(pressedGestureRef\.current !== event\.pointerId\) return;/);
});

test('BUG REAL: segundo dedo (segundo pointerdown enquanto o primeiro ainda está pressionado) é ignorado -- um único gesto rastreado por vez', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  const idx = home.indexOf('function handleVoicePointerDown(event) {');
  const slice = home.slice(idx, idx + 400);
  // pressedGestureRef já guarda o pointerId do primeiro dedo -- um segundo
  // pointerdown com pointerId diferente cai neste mesmo guard e retorna sem
  // chamar beginVoiceCapture/setPointerCapture de novo.
  assert.match(slice, /if \(pressedGestureRef\.current !== null\) return;/);
  const upIdx = home.indexOf('function handleVoicePointerUp(event) {');
  const cancelIdx = home.indexOf('function handleVoicePointerCancel(event) {');
  const lostIdx = home.indexOf('function handleVoiceLostPointerCapture(event) {');
  for (const [name, i] of [['pointerup', upIdx], ['pointercancel', cancelIdx], ['lostpointercapture', lostIdx]]) {
    assert.match(
      home.slice(i, i + 200),
      /if \(pressedGestureRef\.current !== event\.pointerId\) return;/,
      `${name} deve validar o pointerId antes de agir`,
    );
  }
});

test('beginVoiceCapture chama voiceInput.start() e nunca navega, mesmo em erro de permissão anterior', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  const idx = home.indexOf('function beginVoiceCapture() {');
  const endIdx = home.indexOf('function endVoiceCapture', idx);
  assert.ok(idx > -1 && endIdx > idx);
  const slice = home.slice(idx, endIdx);
  assert.match(slice, /if \(plan\.resetError\) voiceInput\.reset\(\);/);
  assert.match(
    slice,
    /if \(plan\.startCapture\) \{\s*(?:\/\/[^\n]*\n\s*)*onBeforeVoiceStart\?\.\(\);\s*setTurnStartToken\(\(token\) => token \+ 1\);\s*void voiceInput\.start\(\);\s*\}/,
  );
  assert.doesNotMatch(slice, /navigate\(/);
});

// HOTFIX (barge-in): pressionar o botão enquanto a Uni fala interrompe a
// fala (voiceController.stop()) E inicia a captura no MESMO gesto -- nunca
// exige soltar e apertar de novo (ver resolveBargeInPlan, simplifiedHomeState.js).
test('HOTFIX: beginVoiceCapture interrompe a fala (voiceController.stop()) E inicia a captura no MESMO gesto quando isSpeaking é true', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  const idx = home.indexOf('function beginVoiceCapture() {');
  const endIdx = home.indexOf('function endVoiceCapture', idx);
  const slice = home.slice(idx, endIdx);
  assert.match(slice, /const plan = resolveBargeInPlan\(\{/);
  assert.match(slice, /if \(plan\.interruptSpeech\) voiceController\.stop\(\);/);
  assert.match(slice, /if \(!plan\.proceed\) return false;/);
  const interruptIdx = slice.indexOf('if (plan.interruptSpeech)');
  const startIdx = slice.indexOf('if (plan.startCapture) {');
  assert.ok(interruptIdx > -1 && startIdx > interruptIdx, 'interromper a fala deve vir ANTES de iniciar a captura, no mesmo gesto');
  assert.match(slice, /return true;\s*\}\s*$/, 'quando o plano prossegue (mesmo interrompendo a fala), o gesto é tratado como iniciado (true)');
});

test('pointerup encerra e envia (stop), nunca navega para /app/uni', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  const idx = home.indexOf('function handleVoicePointerUp(event) {');
  const endIdx = home.indexOf('function endVoiceCapture', 0);
  assert.ok(idx > -1 && endIdx > -1);
  const handlerSlice = home.slice(idx, idx + 400);
  assert.match(handlerSlice, /endVoiceCapture\(\{ canceled: false \}\);/);
  const endSlice = home.slice(endIdx, endIdx + 500);
  assert.match(endSlice, /if \(voiceInput\.isListening\) \{\s*voiceInput\.stop\(\);/);
  assert.doesNotMatch(handlerSlice, /navigate\(/);
  assert.doesNotMatch(endSlice, /navigate\(/);
});

test('pointercancel encerra SEM enviar (cancel), nunca navega', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  const cancelIdx = home.indexOf('function handleVoicePointerCancel(event) {');
  assert.ok(cancelIdx > -1);
  const cancelSlice = home.slice(cancelIdx, cancelIdx + 400);
  assert.match(cancelSlice, /endVoiceCapture\(\{ canceled: true \}\);/);
  assert.doesNotMatch(cancelSlice, /navigate\(/);
});

// ============================================================================
// BUG REAL EM DISPOSITIVO FÍSICO (Fase 5): com o dedo ainda pressionado, a
// gravação às vezes encerrava sozinha. Causa 1: `onPointerLeave` cancelava a
// captura assim que o ponteiro saía dos limites visuais do botão -- mas
// `setPointerCapture` (chamado no pointerdown) já garante que pointermove/
// pointerup continuam chegando neste elemento mesmo que o dedo saia
// visualmente da área (jitter normal do polegar num botão grande). Cancelar
// no pointerleave desfazia essa garantia. Removido -- `onLostPointerCapture`
// é a rede de segurança real (captura perdida sem pointerup/pointercancel
// correspondente), nunca a posição do ponteiro.
// ============================================================================

test('BUG REAL: pointerleave NÃO encerra a gravação -- o botão não tem mais esse handler, só pointerup/pointercancel/lostpointercapture decidem o fim', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  assert.doesNotMatch(home, /handleVoicePointerLeave/);
  assert.doesNotMatch(home, /onPointerLeave=/);
});

test('BUG REAL: lostpointercapture cancela a gravação (rede de segurança), sem duplicar stop/cancel se a captura já foi liberada por nós mesmos', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  const idx = home.indexOf('function handleVoiceLostPointerCapture(event) {');
  assert.ok(idx > -1, 'handleVoiceLostPointerCapture deve existir como a rede de segurança real');
  const slice = home.slice(idx, idx + 300);
  // Mesma guarda usada em pointerup/pointercancel: se pressedGestureRef já
  // foi zerado (porque NÓS mesmos liberamos a captura ao processar
  // pointerup/pointercancel primeiro -- o que por spec também dispara
  // lostpointercapture), este handler não re-executa endVoiceCapture.
  assert.match(slice, /if \(pressedGestureRef\.current !== event\.pointerId\) return;/);
  assert.match(slice, /pressedGestureRef\.current = null;/);
  assert.match(slice, /endVoiceCapture\(\{ canceled: true \}\);/);
});

test('BUG REAL: nenhum handler de pointermove existe no botão principal -- movimento leve do dedo nunca encerra a gravação', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  const buttonIdx = home.indexOf('<button\n          type="button"\n          className={styles.uniButton}');
  assert.ok(buttonIdx > -1);
  const buttonSlice = home.slice(buttonIdx, buttonIdx + 700);
  assert.doesNotMatch(buttonSlice, /onPointerMove=/);
});

test('endVoiceCapture cancela (sem enviar) quando o botão é solto antes da gravação realmente começar', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  const idx = home.indexOf('function endVoiceCapture({ canceled }) {');
  assert.ok(idx > -1);
  const slice = home.slice(idx, idx + 500);
  assert.match(slice, /if \(canceled\) \{\s*voiceInput\.cancel\(\);\s*return;\s*\}/);
  assert.match(slice, /if \(voiceInput\.isListening\) \{\s*voiceInput\.stop\(\);\s*return;\s*\}/);
  // Fora dos dois casos acima (ainda não ouvindo -- ex.: aguardando
  // permissão), cai no cancelamento -- nunca deixa uma captura seguir
  // sozinha depois que o usuário já soltou o botão.
  assert.match(slice, /voiceInput\.cancel\(\);\s*\}/);
});

test('um único gesto por vez: pointerdown repetido enquanto já pressionado é ignorado (evita gravação/envio duplicado)', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  const idx = home.indexOf('function handleVoicePointerDown(event) {');
  const slice = home.slice(idx, idx + 300);
  assert.match(slice, /if \(pressedGestureRef\.current !== null\) return;/);
  const upIdx = home.indexOf('function handleVoicePointerUp(event) {');
  const cancelIdx = home.indexOf('function handleVoicePointerCancel(event) {');
  assert.match(home.slice(upIdx, upIdx + 200), /if \(pressedGestureRef\.current !== event\.pointerId\) return;/);
  assert.match(home.slice(cancelIdx, cancelIdx + 200), /if \(pressedGestureRef\.current !== event\.pointerId\) return;/);
});

test('não inicia nova gravação durante o processamento (isInteractionBusy inclui capture busy/typing/executing)', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  assert.match(home, /const isCaptureBusy = \[\s*VOICE_CAPTURE_STATES\.REQUESTING_PERMISSION,\s*VOICE_CAPTURE_STATES\.PROCESSING,\s*\]\.includes\(voiceInput\.status\);/);
  assert.match(home, /const isInteractionBusy = isTyping \|\| isExecuting \|\| isCaptureBusy;/);
  const beginIdx = home.indexOf('function beginVoiceCapture() {');
  const beginEndIdx = home.indexOf('function endVoiceCapture', beginIdx);
  assert.match(home.slice(beginIdx, beginEndIdx), /if \(!plan\.proceed\) return false;/);
});

test('o botão principal não tem onClick/onTap para abrir o chat -- só pointerdown/up/cancel/lostpointercapture e teclado equivalente', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  const buttonIdx = home.indexOf('<button\n          type="button"\n          className={styles.uniButton}');
  assert.ok(buttonIdx > -1, 'botão principal não encontrado');
  const buttonSlice = home.slice(buttonIdx, buttonIdx + 700);
  assert.doesNotMatch(buttonSlice, /onClick=/);
  assert.match(buttonSlice, /onPointerDown={handleVoicePointerDown}/);
  assert.match(buttonSlice, /onPointerUp={handleVoicePointerUp}/);
  assert.match(buttonSlice, /onPointerCancel={handleVoicePointerCancel}/);
  assert.match(buttonSlice, /onLostPointerCapture={handleVoiceLostPointerCapture}/);
  assert.match(buttonSlice, /onKeyDown={handleVoiceKeyDown}/);
  assert.match(buttonSlice, /onKeyUp={handleVoiceKeyUp}/);
});

test('somente "Ver conversa completa" e o link de editar uma confirmação pendente navegam para /app/uni', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  const navigateCalls = [...home.matchAll(/navigate\(([^)]*)\)/g)].map((match) => match[1]);
  assert.deepEqual(navigateCalls, ['SIMPLIFIED_ROUTES.UNI']);
  assert.match(home, /onEditAction={\(\) => navigate\(SIMPLIFIED_ROUTES\.UNI\)}/);
  assert.match(home, /<Link className={styles\.detailsLink} to={SIMPLIFIED_ROUTES\.UNI}>Ver conversa completa<\/Link>/);
});

test('erro de permissão de microfone aparece com mensagem clara na própria Home (nunca genérica demais)', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  assert.match(home, /const voiceErrorMessage = isVoiceErrorState\(voiceInput\.status\) \? voiceInput\.message : null;/);
  assert.match(home, /<small>{voiceErrorMessage \|\| stateCopy\.description}<\/small>/);
});

test('estados de texto do botão refletem o padrão push-to-talk (parado/pressionado), sem "toque novamente"', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  assert.match(home, /button: 'FALAR COM A UNI'/);
  // HOTFIX FINAL: durante captura ativa o texto obrigatório é "OUVINDO…"
  // (nunca "SOLTE PARA ENVIAR" nem qualquer texto anterior como "CONFIRME
  // A AÇÃO") -- ver resolveSimplifiedUniState/isCapturingVoice.
  assert.match(home, /button: 'OUVINDO…'/);
  assert.doesNotMatch(home, /[Tt]oque novamente/);
});

test('Home expõe estados, acessibilidade e confirmação do fluxo real', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  assert.equal(SIMPLIFIED_UNI_STATES.WAITING_CONFIRMATION, 'waiting_confirmation');
  assert.match(home, /ActionConfirmation/);
  assert.match(home, /onConfirmAction/);
  assert.match(home, /aria-live="polite"/);
  assert.match(home, /aria-pressed=\{isListening\}/);
  assert.match(home, /claimWelcomeVoice\(sessionKey\)/);
});

test('Home remove o card visual de boas-vindas sem remover o TTS por sessão', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  assert.doesNotMatch(home, /Boas-vindas reproduzidas por voz|VoiceWelcomeCard/);
  assert.match(home, /claimWelcomeVoice\(sessionKey\)/);
  assert.match(home, /voiceController\.speak\(greeting\.spokenGreeting,\s*\{/);
});

test('UniChat mantém a orquestração e entrega o snapshot à variante compacta', async () => {
  const chat = await source('../uni-chat/UniChatPage.jsx');
  assert.match(chat, /variant === 'simplified-home'/);
  assert.match(chat, /<SimplifiedHomeView/);
  assert.match(chat, /onSendTranscript=\{sendText\}/);
  assert.match(chat, /onConfirmAction=\{handleConfirmAction\}/);
  assert.match(chat, /onCancelAction=\{handleCancelAction\}/);
  assert.match(chat, /createPendingActionCoordinator/);
  assert.match(chat, /pendingActionStackRef/);
});

test('rotas simplificadas usam shell próprio sem remover rotas legadas', async () => {
  const routes = await source('../../app/routes.jsx');
  const app = await source('../../app/App.jsx');

  assert.match(routes, /path: SIMPLIFIED_ROUTES\.HOME/);
  assert.match(routes, /path: SIMPLIFIED_ROUTES\.RECORDS/);
  assert.match(routes, /element: <SimplifiedRecordsPage \/>/);
  assert.match(routes, /path: SIMPLIFIED_ROUTES\.ACCOUNT/);
  assert.match(routes, /path: SIMPLIFIED_ROUTES\.UNI/);
  assert.match(routes, /<UniChatPage variant="simplified" \/>/);
  assert.match(app, /activeRoute\?\.simplified/);
  assert.match(app, /<SimplifiedAuthenticatedLayout>/);
  assert.match(routes, /path: '\/dashboard'/);
  assert.match(routes, /path: '\/uni-ai'/);
});

test('Registros usa hooks e modal financeiros oficiais sem importar mocks', async () => {
  const records = await source('./SimplifiedRecordsPage.jsx');
  assert.match(records, /useAccounts\(\{/);
  assert.match(records, /workspaceId: workspace\?\.id/);
  assert.match(records, /fallbackAccounts: EMPTY_RECORDS/);
  assert.match(records, /fallbackAccountTypes: EMPTY_RECORDS/);
  assert.match(records, /useCategories\(/);
  assert.match(records, /useTransactions\(/);
  assert.match(records, /dateFrom: month\.dateFrom/);
  assert.match(records, /dateTo: month\.dateTo/);
  assert.match(records, /status: 'completed'/);
  assert.match(records, /useFinancialBalances/);
  assert.match(records, /FinanceTransactionModal/);
  assert.match(records, /FINANCIAL_DATA_CHANGED_EVENT/);
  assert.doesNotMatch(records, /financialMock|financialCrudMock|fallbackTransactions/);
});

test('Registros preserva voz real, navegação e estados acessíveis', async () => {
  const records = await source('./SimplifiedRecordsPage.jsx');
  assert.match(records, /navigate\(SIMPLIFIED_ROUTES\.UNI\)/);
  assert.match(records, /role="tablist"/);
  assert.match(records, /aria-selected=\{activeTab === 'summary'\}/);
  assert.match(records, /aria-selected=\{activeTab === 'history'\}/);
  assert.match(records, /Você está offline/);
  assert.match(records, /Ainda não há registros neste mês/);
  assert.match(records, /Nenhum registro corresponde aos filtros/);
});

// ============================================================================
// BLOCO REGISTROS iOS: seletor de mês próprio (MonthPickerModal) substitui
// o <input type="month"> nativo, que no Safari iOS não abre showPicker() de
// forma confiável.
// ============================================================================

test('Registros não usa mais <input type="month"> nativo -- MonthSelector abre MonthPickerModal', async () => {
  const records = await source('./SimplifiedRecordsPage.jsx');
  assert.doesNotMatch(records, /<input[^>]*type="month"/);
  assert.doesNotMatch(records, /showPicker/);
  assert.match(records, /import MonthPickerModal from '\.\/MonthPickerModal\.jsx';/);
  assert.match(records, /<MonthPickerModal/);
  assert.match(records, /initialDate=\{month\.date\}/);
});

test('MonthSelector aplica a data escolhida e fecha o modal via onApply', async () => {
  const records = await source('./SimplifiedRecordsPage.jsx');
  const fnStart = records.indexOf('function MonthSelector(');
  const fnSlice = records.slice(fnStart, records.indexOf('\n}', fnStart));
  assert.match(fnSlice, /onApply=\{\(nextDate\) => \{\s*onChange\(nextDate\);\s*setPickerOpen\(false\);\s*\}\}/);
  assert.match(fnSlice, /onClose=\{\(\) => setPickerOpen\(false\)\}/);
});

test('MonthPickerModal preserva a regra existente de bloqueio de mês futuro (sem usar mais o atributo max)', async () => {
  const modal = await source('./MonthPickerModal.jsx');
  assert.match(modal, /function isMonthDisabled\(year, monthIndex, today\)/);
  assert.match(modal, /year > todayYear \|\| \(year === todayYear && monthIndex > todayMonth\)/);
  assert.match(modal, /disabled=\{disabled\}/);
});

test('MonthPickerModal tem título, ano navegável, grade de 12 meses, "Este mês", Cancelar e Aplicar', async () => {
  const modal = await source('./MonthPickerModal.jsx');
  assert.match(modal, /Selecionar período/);
  assert.match(modal, /aria-label="Ano anterior"/);
  assert.match(modal, /aria-label="Próximo ano"/);
  assert.match(modal, /MONTH_LABELS\.map/);
  assert.match(modal, />\s*Este mês\s*</);
  assert.match(modal, />\s*Cancelar\s*</);
  assert.match(modal, />\s*Aplicar\s*</);
  assert.match(modal, /aria-label="Fechar"/);
});

test('MonthPickerModal fecha por Escape, backdrop e X -- nunca window.confirm', async () => {
  const modal = await source('./MonthPickerModal.jsx');
  assert.match(modal, /event\.key === 'Escape'\) onClose\(\)/);
  assert.match(modal, /function handleOverlayClick\(event\) \{\s*if \(event\.target === event\.currentTarget\) onClose\(\);/);
  assert.doesNotMatch(modal, /window\.confirm/);
});

test('MonthPickerModal bloqueia o scroll da página enquanto aberto e restaura ao fechar', async () => {
  const modal = await source('./MonthPickerModal.jsx');
  assert.match(modal, /document\.body\.style\.overflow = 'hidden'/);
  assert.match(modal, /document\.body\.style\.overflow = previousOverflow/);
});

test('MonthPickerModal é portal para document.body e usa role="dialog" acessível', async () => {
  const modal = await source('./MonthPickerModal.jsx');
  assert.match(modal, /createPortal\(/);
  assert.match(modal, /document\.body,/);
  assert.match(modal, /role="dialog"/);
  assert.match(modal, /aria-modal="true"/);
  assert.match(modal, /aria-labelledby=\{titleId\}/);
});

test('CSS do MonthPickerModal usa identidade escura (sem fundo branco), safe area e dvh', async () => {
  const css = await source('./MonthPickerModal.module.css');
  assert.match(css, /background: rgba\(3, 8, 20, \.68\)/);
  assert.match(css, /linear-gradient\(145deg, rgba\(14, 31, 62, \.96\), rgba\(4, 13, 33, \.98\)\)/);
  assert.match(css, /env\(safe-area-inset-top\)/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /100dvh/);
  assert.match(css, /100svh/);
  assert.doesNotMatch(css, /background:\s*#fff|background:\s*white/);
});

test('provider bloqueia consumidores até o workspace Pessoal oficial estar ativo', async () => {
  const provider = await source('./SimplifiedProductProvider.jsx');
  assert.match(provider, /findPersonalWorkspace\(availableWorkspaces\)/);
  assert.match(provider, /switchWorkspace\(SIMPLIFIED_PRODUCT_CONFIG\.workspaceType\)/);
  assert.match(provider, /status !== SIMPLIFIED_CONTEXT_STATUS\.READY/);
  assert.match(provider, /Nenhum dado de outro espaço foi carregado/);
  assert.doesNotMatch(provider, /workspace_type === 'business'/);
});

test('shell simplificado não oferece atalhos para módulos empresariais ou legados', async () => {
  const sources = await Promise.all([
    source('./SimplifiedHomeView.jsx'),
    source('./SimplifiedRecordsPage.jsx'),
    source('./SimplifiedAccountPage.jsx'),
    source('./SimplifiedMyAccountsPage.jsx'),
    source('./SimplifiedPlanPage.jsx'),
    source('./SimplifiedPaymentsPage.jsx'),
    source('./SimplifiedSecurityPage.jsx'),
    source('./SimplifiedEditProfilePage.jsx'),
    source('./SimplifiedSupportPage.jsx'),
  ]);
  const combined = sources.join('\n');

  assert.doesNotMatch(combined, /navigate\(['"]\/(?:financeiro|uni-ai|crm)/);
  assert.doesNotMatch(combined, /href=["']\/(?:financeiro|uni-ai|crm)/);
});

test('Uni simplificada usa somente workspace Pessoal e fallbacks financeiros vazios', async () => {
  const chat = await source('../uni-chat/UniChatPage.jsx');
  assert.match(chat, /const effectiveWorkspace = isSimplifiedExperience/);
  assert.match(chat, /simplifiedProduct\?\.workspace \?\? null/);
  assert.match(chat, /workspaceContextType = isSimplifiedExperience\s*\? SIMPLIFIED_PRODUCT_MODE/);
  assert.match(chat, /isSimplifiedExperience\s*\? EMPTY_FINANCIAL_FALLBACK/);
  assert.match(chat, /lockedMode: isSimplifiedExperience \? SIMPLIFIED_CHAT_MODE : null/);
  assert.match(chat, /showModeSelector=\{!isSimplifiedExperience\}/);
});

test('categorias são consultadas e criadas com o contexto explícito', async () => {
  const service = await source('../../services/categoryService.js');
  const hook = await source('../../hooks/useCategories.js');

  assert.match(service, /query = query\.in\('applies_to', \[context, 'both'\]\)/);
  assert.match(hook, /listCategories\(workspaceId, \{ context \}\)/);
  assert.match(hook, /\{ \.\.\.values, applies_to: context \}/);
});

test('resumo mensal separa receitas e despesas e preserva saldo derivado oficial', () => {
  const summary = summarizeMonth([
    { id: '1', status: 'completed', transaction_type: 'income', amount: 1200 },
    { id: '2', status: 'completed', transaction_type: 'expense', amount: 350 },
    { id: '3', status: 'canceled', transaction_type: 'expense', amount: 900 },
    { id: '4', status: 'completed', transaction_type: 'transfer', amount: 200 },
  ], 2850.5);

  assert.deepEqual(summary, {
    income: 1200,
    expense: 350,
    balance: 2850.5,
  });
  assert.equal(Object.isFrozen(summary), true);
});

// ── BLOCO FINAL DO MVP (Saldo manual) ────────────────────────────────────

test('card Saldo abre a modal "Atualizar saldo", passando accountState completo (contas com derived_balance + saveAccount)', async () => {
  const records = await source('./SimplifiedRecordsPage.jsx');
  assert.match(records, /import UpdateBalanceModal from '\.\/UpdateBalanceModal\.jsx';/);
  assert.match(records, /<UpdateBalanceModal/);
  assert.match(records, /onChanged=\{refresh\}/);
  assert.match(records, /accountState=\{displayAccountState\}/);
  assert.match(records, /onBalanceClick=\{openBalanceModal\}/);
  assert.match(records, /key=\{balanceModalOpen \? 'balance-modal-open' : 'balance-modal-closed'\}/);
});

// Correção (Bloco Saldo + Cobrança): diferente de "Novo registro", abrir o
// saldo manual NUNCA exige conta ativa -- a modal mostra o estado vazio com
// "Criar conta" quando não há nenhuma. Só a permissão de workspace bloqueia.
test('abrir o saldo manual exige permissão, mas nunca exige conta ativa preexistente (modal mostra o estado vazio)', async () => {
  const records = await source('./SimplifiedRecordsPage.jsx');
  const fnStart = records.indexOf('function openBalanceModal()');
  assert.ok(fnStart > -1, 'openBalanceModal deve existir');
  const fnSlice = records.slice(fnStart, records.indexOf('\n  }', fnStart));
  assert.match(fnSlice, /if \(!canManage\) return;/);
  assert.doesNotMatch(fnSlice, /activeAccounts\.length/);
});

test('card Saldo vira um botão acessível (nunca um <article> estático) que nunca duplica o valor para leitores de tela', async () => {
  const records = await source('./SimplifiedRecordsPage.jsx');
  assert.match(records, /card\.id === 'balance' \? \(/);
  assert.match(records, /onClick=\{onBalanceClick\}/);
  assert.match(records, /Toque para atualizar o saldo/);
  // O <strong> do card Saldo fica aria-hidden -- o valor já está no
  // aria-label do <button> pai, evitando leitura duplicada.
  assert.match(records, /<strong aria-hidden="true">\{formatCurrency\(card\.value\)\}<\/strong>/);
});

test('histórico exibe o sinal correto de um ajuste de saldo positivo (nunca sempre vermelho como despesa)', async () => {
  const records = await source('./SimplifiedRecordsPage.jsx');
  assert.match(records, /const isPositiveAdjustment = transaction\.transaction_type === 'adjustment'/);
  assert.match(records, /&& Number\(transaction\.adjustment_delta\) > 0;/);
  assert.match(records, /isIncome \|\| isPositiveAdjustment \? styles\.positiveAmount/);
  assert.match(records, /\{isIncome \|\| isPositiveAdjustment \? '\+' : isTransfer \? '' : '-'\}/);
});

test('intervalo mensal usa o primeiro e o último dia reais', () => {
  const referenceDate = new Date(2026, 6, 15);
  assert.deepEqual(getMonthRange(referenceDate), {
    date: referenceDate,
    dateFrom: '2026-07-01',
    dateTo: '2026-07-31',
    inputValue: '2026-07',
    label: 'julho de 2026',
  });
  assert.equal(Object.isFrozen(getMonthRange(new Date(2026, 1, 1))), true);
});

test('categorias reais conhecidas e customizadas são agregadas sem inventar valores', () => {
  const categories = [
    { id: 'food', name: 'Alimentação', is_active: true },
    { id: 'pet', name: 'Pets', is_active: true },
  ];
  const summaries = buildCategorySummaries(categories, [
    {
      id: '1',
      category_id: 'food',
      status: 'completed',
      transaction_type: 'expense',
      amount: 50,
    },
    {
      id: '2',
      category_id: 'pet',
      status: 'completed',
      transaction_type: 'expense',
      amount: 30,
    },
  ]);

  assert.equal(summaries[0].name, 'Alimentação');
  assert.equal(summaries[0].amount, 50);
  assert.equal(summaries[0].count, 1);
  assert.equal(summaries[1].name, 'Pets');
  assert.equal(summaries[1].amount, 30);
  assert.equal(summaries[1].icon, 'custom');
});

test('filtros do histórico combinam tipo, categoria, conta, busca e ordem', () => {
  const transactions = [
    {
      id: 'older',
      status: 'completed',
      transaction_type: 'expense',
      category_id: 'food',
      account_id: 'nubank',
      description: 'Almoço',
      transaction_date: '2026-07-10',
    },
    {
      id: 'newer',
      status: 'completed',
      transaction_type: 'expense',
      category_id: 'food',
      account_id: 'nubank',
      description: 'Café',
      transaction_date: '2026-07-20',
    },
    {
      id: 'income',
      status: 'completed',
      transaction_type: 'income',
      category_id: 'salary',
      account_id: 'nubank',
      description: 'Salário',
      transaction_date: '2026-07-15',
    },
  ];

  assert.deepEqual(
    filterRecordTransactions(transactions, {
      type: 'expense',
      categoryId: 'food',
      accountId: 'nubank',
      query: 'cafe',
      sort: 'recent',
    }).map(({ id }) => id),
    ['newer'],
  );
  assert.deepEqual(
    filterRecordTransactions(transactions, { sort: 'oldest' }).map(({ id }) => id),
    ['older', 'income', 'newer'],
  );
});

test('shell mantém notificações reais e exatamente a navegação nova', async () => {
  const shell = await source('./SimplifiedAppShell.jsx');
  const header = await source('./SimplifiedHeader.jsx');
  const navigation = await source('./SimplifiedBottomNavigation.jsx');

  assert.match(shell, /useNotifications\(\)/);
  assert.match(shell, /unreadCount=\{unreadCount\}/);
  assert.match(header, /unreadCount > 0/);
  assert.match(navigation, /SIMPLIFIED_NAVIGATION\.map/);
  assert.match(shell, /location\.pathname === SIMPLIFIED_ROUTES\.RECORDS/);
});

test('notificações da Home usam painel integrado e nunca Modal branco', async () => {
  const shell = await source('./SimplifiedAppShell.jsx');
  assert.match(shell, /className=\{styles\.notificationsDropdown\}/);
  assert.match(shell, /id="simplified-notifications-panel"/);
  assert.doesNotMatch(shell, /import Modal/);
  assert.doesNotMatch(shell, /<Modal/);
});

test('sino alterna abertura e expõe aria-expanded e aria-controls', async () => {
  const shell = await source('./SimplifiedAppShell.jsx');
  const header = await source('./SimplifiedHeader.jsx');
  assert.match(shell, /function toggleNotifications\(\)/);
  assert.match(header, /aria-expanded=\{isNotificationsOpen\}/);
  assert.match(header, /aria-controls="simplified-notifications-panel"/);
});

test('painel fecha por Escape, clique externo e mudança de rota com cleanup', async () => {
  const shell = await source('./SimplifiedAppShell.jsx');
  assert.match(shell, /event\.key === 'Escape'/);
  assert.match(shell, /document\.addEventListener\('pointerdown'/);
  assert.match(shell, /document\.removeEventListener\('pointerdown'/);
  assert.match(shell, /\[closeNotifications, location\.pathname\]/);
});

test('cliques rápidos cancelam timers anteriores e reabrem o painel sem acumular estado', async () => {
  const shell = await source('./SimplifiedAppShell.jsx');
  assert.match(shell, /window\.clearTimeout\(closeTimerRef\.current\)/);
  assert.match(shell, /window\.cancelAnimationFrame\(openFrameRef\.current\)/);
  assert.match(shell, /if \(closeTimerRef\.current\) \{\s*openNotifications\(\)/);
});

test('foco entra no painel e retorna ao sino ao fechar', async () => {
  const shell = await source('./SimplifiedAppShell.jsx');
  assert.match(shell, /notificationPanelRef\.current\?\.focus\(\)/);
  assert.match(shell, /notificationButtonRef\.current\?\.focus\(\)/);
});

test('sino mostra quantidade real limitada a 9+', async () => {
  const header = await source('./SimplifiedHeader.jsx');
  assert.match(header, /unreadCount > 9 \? '9\+' : String\(unreadCount\)/);
  assert.match(header, /styles\.notificationCount/);
});

test('preferência de tamanho textual é aplicada como atributo no shell', async () => {
  const shell = await source('./SimplifiedAppShell.jsx');
  const css = await source('./simplifiedApp.module.css');
  assert.match(shell, /data-text-size=\{profile\?\.text_size \?\? 'standard'\}/);
  assert.match(css, /\.shell\[data-text-size="small"\]/);
  assert.match(css, /\.shell\[data-text-size="large"\]/);
});

test('BUG REAL: .uniButton (botão grande da Uni) tem touch-action: none e bloqueia seleção/callout/drag nativos que poderiam interromper o toque prolongado', async () => {
  const css = await source('./simplifiedApp.module.css');
  const idx = css.indexOf('.uniButton {');
  assert.ok(idx > -1);
  const slice = css.slice(idx, css.indexOf('background:', idx));
  assert.match(slice, /touch-action:\s*none;/);
  assert.match(slice, /(?<!-webkit-)user-select:\s*none;/);
  assert.match(slice, /-webkit-user-select:\s*none;/);
  assert.match(slice, /-webkit-touch-callout:\s*none;/);
  assert.match(slice, /-webkit-user-drag:\s*none;/);
});

test('CSS cobre safe areas, toque, mobile estreito, desktop e redução de movimento', async () => {
  const css = await source('./simplifiedApp.module.css');
  assert.match(css, /env\(safe-area-inset-top\)/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /min-height: 48px/);
  assert.match(css, /@media \(max-width: 359px\)/);
  assert.match(css, /@media \(min-width: 768px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /\.notificationsDropdown\s*\{\s*transition: none;/);
  assert.match(css, /overflow-x: clip/);
  assert.doesNotMatch(css, /tela principal uni|background-image:\s*url/i);
});

test('CSS de Registros cobre grade responsiva, toque, safe area e movimento reduzido', async () => {
  const css = await source('./simplifiedRecords.module.css');
  assert.match(css, /env\(safe-area-inset-top\)/);
  assert.match(css, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /min-height: 48px/);
  assert.match(css, /@media \(max-width: 359px\)/);
  assert.match(css, /@media \(min-width: 1024px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(css, /background-image:\s*url/i);
});

test('campo de busca do histórico usa font-size >= 16px -- evita o zoom automático do Safari iOS ao focar', async () => {
  const css = await source('./simplifiedRecords.module.css');
  const start = css.indexOf('.historyFilters input,');
  const slice = css.slice(start, css.indexOf('}', start));
  assert.match(slice, /font-size: 16px;/);
});

// ============================================================================
// BUG 3: animação de escuta do botão da Uni -- intensidade real do
// microfone via AnalyserNode sobre o MESMO stream do motor de voz
// existente, nunca um segundo getUserMedia; para ao soltar/cancelar;
// respeita prefers-reduced-motion; nunca bloqueia o push-to-talk.
// ============================================================================

test('BUG 3: Home usa useVoiceIntensity com o stream do motor de voz existente, ativo só durante isListening', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  assert.match(home, /import \{[\s\S]*?useVoiceIntensity[\s\S]*?\} from '\.\.\/uni-voice\/index\.js';/);
  assert.match(home, /const \{ level: voiceLevel \} = useVoiceIntensity\(\{\s*getStream: voiceInput\.getActiveStream,\s*active: isListening,\s*\}\);/);
});

test('BUG 3: o anel de intensidade só recebe o nível de voz enquanto isListening -- nunca fora do estado de escuta', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  assert.match(home, /className=\{styles\.uniVoiceLevelRing\}/);
  assert.match(home, /style=\{isListening \? \{ '--voice-level': voiceLevel \} : undefined\}/);
});

test('BUG 3: a animação de escuta nunca interfere no push-to-talk (pointerdown\\/up\\/cancel continuam intactos)', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  assert.match(home, /onPointerDown={handleVoicePointerDown}/);
  assert.match(home, /onPointerUp={handleVoicePointerUp}/);
  assert.match(home, /onPointerCancel={handleVoicePointerCancel}/);
});

test('BUG 3: CSS do anel de intensidade reage a --voice-level só no estado listening, com animação própria em processamento', async () => {
  const css = await source('./simplifiedApp.module.css');
  assert.match(css, /\.uniVoiceLevelRing \{/);
  assert.match(css, /\.uniButton\[data-state="listening"\] \.uniVoiceLevelRing \{[\s\S]{0,300}var\(--voice-level, 0\)/);
  assert.match(
    css,
    /\.uniButton\[data-state="transcribing"\] \.uniVoiceLevelRing,\s*\n\.uniButton\[data-state="interpreting"\] \.uniVoiceLevelRing,\s*\n\.uniButton\[data-state="executing"\] \.uniVoiceLevelRing \{/,
  );
});

test('BUG 3: prefers-reduced-motion desliga a animação do anel de intensidade tanto via CSS quanto no hook', async () => {
  const css = await source('./simplifiedApp.module.css');
  const idx = css.indexOf('@media (prefers-reduced-motion: reduce) {');
  assert.ok(idx > -1);
  const slice = css.slice(idx, idx + 500);
  assert.match(slice, /\.uniVoiceLevelRing/);
  assert.match(slice, /animation: none !important;/);

  const hook = await source('../uni-voice/useVoiceIntensity.js');
  assert.match(hook, /if \(prefersReducedMotion\(browserRuntime\)\) return undefined;/);
});

// ============================================================================
// HOTFIX P1.4: "Ouvir resposta" foi removido do card compacto da Home --
// o fluxo principal ali é sempre automático (autoplay). O replay manual
// continua existindo apenas no chat completo (MessageBubble.jsx).
// ============================================================================

test('HOTFIX P1.4: CompactResponse não tem botão "Ouvir resposta" nem showManualSpeak', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  const idx = home.indexOf('function CompactResponse({');
  const endIdx = home.indexOf('function SimplifiedHomeView({');
  assert.ok(idx > -1 && endIdx > idx);
  const block = home.slice(idx, endIdx);
  assert.doesNotMatch(block, /showManualSpeak/);
  assert.doesNotMatch(block, /onClick=\{\(\) => onSpeakMessage\(lastUni\)\}/);
  assert.doesNotMatch(block, />\s*Ouvir resposta\s*</);
  assert.match(block, /lastUni\.text/);
});

test('falha na saudação mantém fallback textual e tentativa manual sem duplicar o claim da sessão', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  assert.match(home, /const error = result\?\.error \?\? null;/);
  assert.match(home, /setWelcomeVoiceError\(error\);/);
  assert.match(home, /welcomeVoiceError\.message/);
  assert.match(home, />\s*Ouvir saudação\s*</);
  assert.equal((home.match(/claimWelcomeVoice\(sessionKey\)/g) ?? []).length, 1);
});

test('HOTFIX P1.4: SimplifiedHomeView não repassa onSpeakMessage/voiceEnabled para CompactResponse', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  const idx = home.indexOf('<CompactResponse');
  const endIdx = home.indexOf('/>', idx);
  const block = home.slice(idx, endIdx);
  assert.doesNotMatch(block, /voiceEnabled=\{voiceEnabled\}/);
  assert.doesNotMatch(block, /onSpeakMessage=\{onSpeakMessage\}/);
});

test('BLOCO UNI 2: isSpeaking em SimplifiedHomeView deriva de voiceController.status (LOADING ou PLAYING), nunca da captura', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  assert.match(home, /const SPEAKING_VOICE_STATUSES = new Set\(\[VOICE_TTS_STATUS\.LOADING, VOICE_TTS_STATUS\.PLAYING\]\);/);
  assert.match(home, /const isSpeaking = SPEAKING_VOICE_STATUSES\.has\(voiceController\.status\);/);
});

// ============================================================================
// HOTFIX — Barge-in e captura imediata de voz
// ============================================================================

test('Requisito 3 — handleVoicePointerUp encerra UMA única gravação: nula o gesto ANTES de chamar endVoiceCapture, e um segundo pointerup com o mesmo pointerId é ignorado', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  const idx = home.indexOf('function handleVoicePointerUp(event) {');
  const endIdx = home.indexOf('function handleVoicePointerCancel', idx);
  assert.ok(idx > -1 && endIdx > idx);
  const slice = home.slice(idx, endIdx);
  // Guarda de reentrância: só processa o pointerId que esta função já está
  // rastreando -- um pointerup duplicado (mesmo id) ou de outro ponteiro
  // nunca chama endVoiceCapture de novo.
  assert.match(slice, /if \(pressedGestureRef\.current !== event\.pointerId\) return;/);
  const guardIdx = slice.indexOf('if (pressedGestureRef.current !== event.pointerId) return;');
  const nullIdx = slice.indexOf('pressedGestureRef.current = null;');
  const endCaptureIdx = slice.indexOf('endVoiceCapture({ canceled: false });');
  assert.ok(guardIdx > -1 && nullIdx > guardIdx && endCaptureIdx > nullIdx,
    'a ordem precisa ser: checar → nular a referência do gesto → só então encerrar a captura');
  // endVoiceCapture, por sua vez, só chama voiceInput.stop() uma vez
  // (branch única, sem fallthrough para cancel()).
  const endCaptureFnIdx = home.indexOf('function endVoiceCapture(');
  const endCaptureFnEndIdx = home.indexOf('\n  }', endCaptureFnIdx);
  const endCaptureBody = home.slice(endCaptureFnIdx, endCaptureFnEndIdx);
  assert.equal((endCaptureBody.match(/voiceInput\.stop\(\)/g) ?? []).length, 1);
});

test('Requisito 4 — o botão principal só escuta Pointer Events (nunca onTouchStart/onTouchEnd); pointerdown e touchstart nunca podem iniciar duas gravações porque só existe um listener', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  assert.doesNotMatch(home, /onTouchStart=/);
  assert.doesNotMatch(home, /onTouchEnd=/);
  assert.doesNotMatch(home, /addEventListener\(\s*['"]touchstart['"]/);
  // setPointerCapture no pointerdown é o mecanismo real de unificação --
  // Pointer Events já cobrem touch/mouse/pen num único evento, então o
  // botão nunca precisa (nem pode) escutar os dois tipos de evento.
  const beginIdx = home.indexOf('function handleVoicePointerDown(event) {');
  const beginEndIdx = home.indexOf('function handleVoicePointerUp', beginIdx);
  const slice = home.slice(beginIdx, beginEndIdx);
  assert.match(slice, /if \(pressedGestureRef\.current !== null\) return;/, 'um gesto já em andamento bloqueia um novo pointerdown concorrente');
  assert.match(slice, /event\.currentTarget\.setPointerCapture\?\.\(event\.pointerId\);/);
});

test('Requisito 6 — nenhuma mensagem é publicada duas vezes: onFinalTranscript ignora transcrição vazia e useUniVoiceInput descarta resultado de transcrição obsoleto (requestId)', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  const finalIdx = home.indexOf('onFinalTranscript: (transcript) => {');
  const finalEndIdx = home.indexOf('}),', finalIdx);
  const finalSlice = home.slice(finalIdx, finalEndIdx);
  assert.match(finalSlice, /if \(cleanTranscript\) onSendTranscript\(cleanTranscript\);/, 'transcrição vazia nunca publica mensagem');

  const voiceInput = await source('../uni-voice/useUniVoiceInput.js');
  // requestIdRef garante que só o resultado da transcrição MAIS RECENTE
  // dispara COMPLETE/onFinalTranscript -- uma segunda gravação disparada
  // por engano nunca deixa a primeira publicar uma mensagem atrasada.
  assert.match(voiceInput, /const requestId = \+\+requestIdRef\.current;/);
  assert.match(voiceInput, /if \(requestId !== requestIdRef\.current\) return;/);
  // start() recusa uma segunda gravação enquanto a anterior ainda está
  // ativa (adapter já existe OU status já é de captura em andamento).
  assert.match(voiceInput, /if \(adapterRef\.current \|\| isVoiceCaptureActive\(state\.status\) \|\| !workspaceId\) return false;/);
});

test('Repetição sem travamento — os 3 caminhos de soltar (pointerup/pointercancel/lostpointercapture) sempre zeram pressedGestureRef ANTES de encerrar, garantindo que o próximo pointerdown comece limpo', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  for (const marker of [
    'function handleVoicePointerUp(event) {',
    'function handleVoicePointerCancel(event) {',
    'function handleVoiceLostPointerCapture(event) {',
  ]) {
    const idx = home.indexOf(marker);
    assert.ok(idx > -1, `${marker} não encontrado`);
    const endIdx = home.indexOf('\n  }', idx);
    const slice = home.slice(idx, endIdx);
    const nullIdx = slice.indexOf('pressedGestureRef.current = null;');
    const endCaptureIdx = slice.indexOf('endVoiceCapture(');
    assert.ok(nullIdx > -1 && endCaptureIdx > nullIdx,
      `${marker}: pressedGestureRef precisa ser zerado ANTES de endVoiceCapture, senão o próximo gesto pode ficar preso`);
  }
  // beginVoiceCapture nunca marca o gesto como em andamento por conta
  // própria -- é handleVoicePointerDown quem seta pressedGestureRef.current
  // = event.pointerId DEPOIS de beginVoiceCapture() confirmar (return
  // true), então uma 5ª, 10ª, Nª repetição sempre parte de pressedGestureRef
  // === null (nunca acumula um AudioContext/analyser "órfão" de um gesto
  // anterior mal encerrado).
  const downIdx = home.indexOf('function handleVoicePointerDown(event) {');
  const downEndIdx = home.indexOf('\n  }', downIdx);
  const downSlice = home.slice(downIdx, downEndIdx);
  assert.match(downSlice, /if \(pressedGestureRef\.current !== null\) return;/);
  assert.match(downSlice, /if \(!beginVoiceCapture\(\)\) return;/);
  assert.match(downSlice, /pressedGestureRef\.current = event\.pointerId;/);
});
