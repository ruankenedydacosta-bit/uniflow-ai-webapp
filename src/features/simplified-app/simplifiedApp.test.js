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
  assert.equal(greeting.heading, 'Olá, Ricardo');
  assert.equal(greeting.salutation, '');
  assert.equal(greeting.hasKnownName, true);
  assert.equal(Object.isFrozen(greeting), true);
});

test('saudação respeita tratamento explícito e usa fallback seguro', () => {
  assert.equal(
    resolveSimplifiedGreeting({
      preferred_name: 'Helena',
      preferred_salutation: 'Sra.',
    }).heading,
    'Sra. Helena',
  );
  assert.equal(resolveSimplifiedGreeting({}, {}).heading, 'Olá');
  assert.doesNotMatch(resolveSimplifiedGreeting({ full_name: 'Ana Souza' }).heading, /Sra?\./);
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
  assert.match(slice, /if \(isInteractionBusy\) return false;/);
  assert.match(slice, /if \(isVoiceErrorState\(voiceInput\.status\)\) voiceInput\.reset\(\);/);
  assert.match(slice, /void voiceInput\.start\(\);/);
  assert.doesNotMatch(slice, /navigate\(/);
});

// BLOCO UNI 2: pressionar o botão enquanto a Uni fala interrompe a fala
// (voiceController.stop()) em vez de iniciar uma gravação nova -- nunca
// grava por cima da resposta, e o próprio usuário ganha uma forma real de
// cortar uma fala longa demais.
test('BLOCO UNI 2: beginVoiceCapture interrompe a fala (voiceController.stop()) em vez de iniciar a captura quando isSpeaking é true, e nunca inicia a gravação nesse mesmo toque', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  const idx = home.indexOf('function beginVoiceCapture() {');
  const endIdx = home.indexOf('function endVoiceCapture', idx);
  const slice = home.slice(idx, endIdx);
  assert.match(slice, /if \(isSpeaking\) \{\s*\n\s*voiceController\.stop\(\);\s*\n\s*return false;\s*\n\s*\}/);
  const speakingIdx = slice.indexOf('if (isSpeaking)');
  const startIdx = slice.indexOf('void voiceInput.start();');
  assert.ok(speakingIdx > -1 && startIdx > speakingIdx, 'a checagem de isSpeaking deve vir ANTES de iniciar a captura');
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
  assert.match(home.slice(beginIdx, beginIdx + 100), /if \(isInteractionBusy\) return false;/);
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
  assert.match(home, /button: 'SOLTE PARA ENVIAR'/);
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
  assert.match(home, /voiceController\.speak\(greeting\.voiceText\)/);
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
// BLOCO UNI 2: fallback manual "Ouvir resposta" em CompactResponse (Home) --
// só existe para mensagens LONGAS DEMAIS para autoplay (ver
// AUTO_SPEAK_MAX_LENGTH); mensagens curtas nunca precisam dele porque já
// foram faladas automaticamente pelo efeito em UniChatPage.jsx.
// ============================================================================

test('BLOCO UNI 2: CompactResponse mostra "Ouvir resposta" só quando a mensagem é longa demais para autoplay E a voz está habilitada', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  const idx = home.indexOf('function CompactResponse({');
  const endIdx = home.indexOf('function SimplifiedHomeView({');
  assert.ok(idx > -1 && endIdx > idx);
  const block = home.slice(idx, endIdx);
  assert.match(
    block,
    /const showManualSpeak = Boolean\(\s*\n\s*voiceEnabled\s*\n\s*&& lastUni\?\.text\s*\n\s*&& lastUni\.text\.length > AUTO_SPEAK_MAX_LENGTH\s*\n\s*&& typeof onSpeakMessage === 'function',\s*\n\s*\);/,
  );
  assert.match(block, /onClick=\{\(\) => onSpeakMessage\(lastUni\)\}/);
});

test('BLOCO UNI 2: SimplifiedHomeView repassa onSpeakMessage e voiceEnabled para CompactResponse (fallback manual funciona de ponta a ponta)', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  const idx = home.indexOf('<CompactResponse');
  const endIdx = home.indexOf('/>', idx);
  const block = home.slice(idx, endIdx);
  assert.match(block, /voiceEnabled=\{voiceEnabled\}/);
  assert.match(block, /onSpeakMessage=\{onSpeakMessage\}/);
});

test('BLOCO UNI 2: isSpeaking em SimplifiedHomeView deriva de voiceController.status (LOADING ou PLAYING), nunca da captura', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  assert.match(home, /const SPEAKING_VOICE_STATUSES = new Set\(\[VOICE_TTS_STATUS\.LOADING, VOICE_TTS_STATUS\.PLAYING\]\);/);
  assert.match(home, /const isSpeaking = SPEAKING_VOICE_STATUSES\.has\(voiceController\.status\);/);
});
