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
import {
  isTextEntryElement,
  readVisualViewport,
  resolveKeyboardVisibility,
} from './useVisualViewport.js';
import { resolveInitialConversationState } from '../uni-chat/chatHistory.js';
import {
  buildCategorySummaries,
  filterRecordTransactions,
  getMonthRange,
  summarizeMonth,
} from './simplifiedRecordsData.js';
import {
  createVoicePointerGesture,
  isVoicePointerEventForGesture,
  recoverVoicePointerCapture,
} from './voiceHoldLifecycle.js';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('navegação simplificada possui Hoje, Financeiro, Falar, Agenda e Mais', () => {
  assert.deepEqual(
    SIMPLIFIED_NAVIGATION.map(({ label, path }) => ({ label, path })),
    [
      { label: 'Hoje', path: '/app/home' },
      { label: 'Financeiro', path: '/app/registros' },
      { label: 'Falar', path: null },
      { label: 'Agenda', path: '/app/agenda' },
      { label: 'Mais', path: '/app/conta' },
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

test('visualViewport calcula teclado e área visível sem valores negativos', () => {
  assert.deepEqual(readVisualViewport({
    innerHeight: 844,
    visualViewport: { height: 514, offsetTop: 0 },
  }), { height: 514, offsetTop: 0, keyboardInset: 330, layoutHeight: 844 });
  assert.deepEqual(readVisualViewport({
    innerHeight: 844,
    visualViewport: { height: 800, offsetTop: 80 },
  }), { height: 800, offsetTop: 80, keyboardInset: 0, layoutHeight: 844 });
});

test('teclado usa redução real do visualViewport e foco somente como fallback', () => {
  const keyboardMetrics = readVisualViewport({
    innerHeight: 514,
    visualViewport: { height: 514, offsetTop: 0 },
  }, 844);
  assert.equal(resolveKeyboardVisibility({
    metrics: keyboardMetrics,
    hasVisualViewport: true,
    activeElement: null,
  }), true);
  assert.equal(resolveKeyboardVisibility({
    metrics: { height: 800, offsetTop: 0, keyboardInset: 44, layoutHeight: 844 },
    hasVisualViewport: true,
    activeElement: { tagName: 'TEXTAREA' },
  }), false);
  assert.equal(resolveKeyboardVisibility({
    metrics: { height: 0, offsetTop: 0, keyboardInset: 0, layoutHeight: 0 },
    hasVisualViewport: false,
    activeElement: { tagName: 'TEXTAREA', disabled: false, readOnly: false },
  }), true);
  assert.equal(isTextEntryElement({ tagName: 'INPUT', type: 'checkbox' }), false);
});

test('abrir e fechar teclado 20 vezes mantém decisão estável', () => {
  for (let index = 0; index < 20; index += 1) {
    assert.equal(resolveKeyboardVisibility({
      metrics: { height: 514, offsetTop: 0, keyboardInset: 330, layoutHeight: 844 },
      hasVisualViewport: true,
    }), true);
    assert.equal(resolveKeyboardVisibility({
      metrics: { height: 844, offsetTop: 0, keyboardInset: 0, layoutHeight: 844 },
      hasVisualViewport: true,
    }), false);
  }
});

test('shell acompanha visualViewport e remove listeners do teclado no cleanup', async () => {
  const shell = await source('./SimplifiedAppShell.jsx');
  const hook = await source('./useVisualViewport.js');
  const css = await source('./simplifiedApp.module.css');
  assert.match(shell, /const viewportState = useVisualViewport\(\);/);
  assert.match(shell, /style=\{viewportState\.viewportStyle\}/);
  assert.match(hook, /visualViewport/);
  assert.match(hook, /addEventListener\?\.\('resize', scheduleSettledSync\)/);
  assert.match(hook, /addEventListener\?\.\('focusout', handleFocusChange\)/);
  assert.match(hook, /addEventListener\?\.\('visibilitychange', handleVisibilityChange\)/);
  assert.match(hook, /removeEventListener\?\.\('resize', scheduleSettledSync\)/);
  assert.match(hook, /removeEventListener\?\.\('focusout', handleFocusChange\)/);
  assert.match(hook, /settleTimers\.forEach/);
  assert.match(css, /height: var\(--uf-visual-viewport-height, 100dvh\);/);
  assert.match(css, /body\[data-simplified-app-mounted="true"\]/);
  assert.match(shell, /body\.setAttribute\('data-simplified-app-mounted', 'true'\)/);
});

test('Chat da Uni remove somente o header global e esconde a navegação apenas com teclado real', async () => {
  const shell = await source('./SimplifiedAppShell.jsx');
  const nav = await source('./SimplifiedBottomNavigation.jsx');
  const css = await source('./simplifiedApp.module.css');
  assert.match(shell, /const isUniChatRoute = location\.pathname === SIMPLIFIED_ROUTES\.UNI;/);
  assert.match(shell, /\{hasPageHeader \|\| isUniChatRoute \? null : \(/);
  assert.match(shell, /isNotificationsRendered && !hasPageHeader && !isUniChatRoute/);
  // RELATORIO-FLATTEN1: a mesma prop `hidden` também esconde a
  // navegação no Relatório da Uni (isReportRoute, agora resumo+planilha
  // na mesma rota) -- nunca um segundo mecanismo, só mais uma condição
  // no mesmo booleano.
  assert.match(shell, /<SimplifiedBottomNavigation\s+hidden=\{isUniChatKeyboardOpen \|\| isReportRoute\}\s/);
  assert.match(nav, /aria-hidden=\{hidden\}/);
  assert.match(nav, /inert=\{hidden\}/);
  assert.match(css, /\.bottomNavigationHidden \{[\s\S]*?max-height: 0;/);
  assert.match(css, /max-height 160ms ease/);
});

test('Chat preserva posição antiga e só ancora no fim quando stickToBottom já está ativo', async () => {
  const page = await source('../uni-chat/UniChatPage.jsx');
  assert.match(page, /const \{ isKeyboardOpen \} = useVisualViewportContext\(\);/);
  assert.match(page, /if \(!stickToBottom\.current\) return;/);
  assert.match(page, /\[messages, historyHydrated, isKeyboardOpen, messagesMountTick\]/);
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
  assert.deepEqual(greeting.visualGreeting, { eyebrow: 'Que bom te ver,', name: 'Ricardo' });
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

test('Home usa a mesma saudação estruturada no texto e na voz da conversa', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  // A abertura (Bom dia, Oi, Olá...) é sorteada uma vez por carga da página.
  assert.match(home, /useMemo\(\s*\(\) => resolveSimplifiedGreeting\(profile, user, getPageLoadGreetingOpening\(\)\),\s*\[profile, user\]/);
  assert.match(home, /greeting\.visualGreeting\.eyebrow/);
  assert.match(home, /greeting\.displayName/);
  assert.doesNotMatch(home, /<h1[^>]*>\{greeting\.addressedName\}<\/h1>/);
  assert.match(home, /suggestedGreeting: greeting\.spokenGreeting,/);
  assert.doesNotMatch(home, /<p>Seja bem-vindo,/);
});

// ============================================================================
// UNIUPD1 -- destaque de novidade pendente na Home. A frase institucional
// original é preservada quando não há nada pendente; nunca duplica
// mecanismo/estado (useUniUpdates com limit:1, mesmo hook usado por Sobre).
// ============================================================================

test('Home pede só a novidade mais recente (limit:1) -- nunca carrega o histórico inteiro', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  assert.match(home, /const \{ pendingUpdate: pendingUniUpdate \} = useUniUpdates\(\{ limit: 1 \}\);/);
});

test('sem novidade pendente, a Home diz como começar a conversa por voz', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  assert.match(
    home,
    /Toque na <strong>Uni<\/strong>, no centro da barra abaixo, para conversar por voz\./,
  );
});

test('com novidade pendente, mostra "🚀 A Uni evoluiu" e o botão "Ver novidades" navega para o deep link correto', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  const bannerStart = home.indexOf('pendingUniUpdate ? (');
  const bannerSlice = home.slice(bannerStart, bannerStart + 600);
  assert.match(bannerSlice, /🚀 <strong>A Uni evoluiu<\/strong>/);
  assert.match(bannerSlice, /Ver novidades/);
  assert.match(bannerSlice, /navigate\(buildNovidadeUrl\(pendingUniUpdate\.id\)\)/);
});

test('Home não grava áudio: o microfone é só da conversa em tempo real', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  assert.doesNotMatch(home, /new MediaRecorder|navigator\.mediaDevices|getUserMedia|uni-voice\//);
  assert.match(home, /useRealtimeUniConversation\(\{/);
});

test('retorno do background: evento terminal atrasado com pointerId reutilizado não pertence ao novo gesto', () => {
  const currentGesture = createVoicePointerGesture({
    pointerId: 1,
    clientX: 140,
    clientY: 420,
    timeStamp: 8_000,
  });

  assert.equal(isVoicePointerEventForGesture({ pointerId: 1, timeStamp: 7_500 }, currentGesture), false);
  assert.equal(isVoicePointerEventForGesture({ pointerId: 1, timeStamp: 8_120 }, currentGesture), true);
  assert.equal(isVoicePointerEventForGesture({ pointerId: 2, timeStamp: 8_120 }, currentGesture), false);
});

test('eventos sem timestamp continuam compatíveis sem enfraquecer a identidade por pointerId', () => {
  const gesture = createVoicePointerGesture({ pointerId: 4, clientX: 0, clientY: 0 });
  assert.equal(isVoicePointerEventForGesture({ pointerId: 4 }, gesture), true);
  assert.equal(isVoicePointerEventForGesture({ pointerId: 5 }, gesture), false);
});

test('lostpointercapture recupera somente um pointer ainda ativo e visível', () => {
  const captured = new Set();
  const element = {
    setPointerCapture(pointerId) {
      captured.add(pointerId);
    },
    hasPointerCapture(pointerId) {
      return captured.has(pointerId);
    },
  };

  assert.equal(recoverVoicePointerCapture({ element, pointerId: 7, visibilityState: 'visible' }), true);
  assert.equal(captured.has(7), true);
  assert.equal(recoverVoicePointerCapture({ element, pointerId: 8, visibilityState: 'hidden' }), false);
  assert.equal(captured.has(8), false);
  assert.equal(recoverVoicePointerCapture({
    element: { setPointerCapture() { throw new Error('inactive pointer'); } },
    pointerId: 9,
    visibilityState: 'visible',
  }), false);
});

test('conversa em tempo real só encerra ao sair da página, não ao trocar de aba', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  const idx = home.indexOf('const endOnPageExit = () => {');
  assert.ok(idx > -1);
  const slice = home.slice(idx, home.indexOf('}, []);', idx));
  assert.match(slice, /stopRealtimeRef\.current\?\.\('lifecycle'\)/);
  assert.match(slice, /window\.addEventListener\('pagehide', endOnPageExit\)/);
  assert.match(slice, /window\.removeEventListener\('pagehide', endOnPageExit\)/);
  assert.doesNotMatch(slice, /visibilitychange/);
});

test('botão central tem alvo visual ~300px; touch-action continua none (gesto aprovado preservado)', async () => {
  const css = await source('./simplifiedApp.module.css');
  const idx = css.indexOf('.uniButton {');
  const block = css.slice(idx, css.indexOf('background:', idx));
  assert.match(block, /width:\s*clamp\(218px, 58vw, 300px\)/);
  assert.match(block, /touch-action:\s*none;/);
  assert.doesNotMatch(block, /touch-action:\s*pan-y;/);
  assert.match(css, /@media \(max-width: 359px\)[\s\S]*?\.uniButton\s*\{\s*width:\s*210px/);
});

test('botão central não adiciona círculo rígido ou pseudo-elemento ao redor do plasma', async () => {
  const [home, css] = await Promise.all([
    source('./SimplifiedHomeView.jsx'),
    source('./simplifiedApp.module.css'),
  ]);
  const buttonIdx = css.indexOf('.uniButton {');
  const buttonSlice = css.slice(buttonIdx, css.indexOf('}', buttonIdx));
  assert.match(buttonSlice, /border:\s*0;/);
  assert.match(buttonSlice, /background:\s*transparent;/);
  assert.match(buttonSlice, /box-shadow:\s*none;/);
  assert.doesNotMatch(css, /\.uniButton::before\s*\{/);
  assert.doesNotMatch(home, /styles\.uniButtonRing|styles\.uniVoiceLevelRing/);
});

test('só editar uma confirmação e sair da tela de voz navegam para /app/uni', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  const navigateCalls = [...home.matchAll(/navigate\(([^)]*)\)/g)].map((match) => match[1]);
  // UNIUPD1: "Ver novidades" também chama navigate(), mas para
  // /app/conta/sobre?novidade=<id> (buildNovidadeUrl).
  const uniNavigateCalls = navigateCalls.filter((call) => call === 'SIMPLIFIED_ROUTES.UNI');
  assert.deepEqual(uniNavigateCalls, ['SIMPLIFIED_ROUTES.UNI', 'SIMPLIFIED_ROUTES.UNI']);
  assert.match(home, /onEditAction={\(\) => navigate\(SIMPLIFIED_ROUTES\.UNI\)}/);
  // Sair da tela de voz para o chat encerra a conversa antes de navegar:
  // nunca deixa o microfone aberto atrás de outra rota.
  assert.match(
    home,
    /function handleLeaveRealtimeVoiceModeToChat\(\) \{\s*stopRealtime\('user'\);\s*setIsVoiceModeOpen\(false\);\s*navigate\(SIMPLIFIED_ROUTES\.UNI\);/,
  );
});

test('Home expõe estados, acessibilidade e confirmação do fluxo real', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  assert.equal(SIMPLIFIED_UNI_STATES.WAITING_CONFIRMATION, 'waiting_confirmation');
  assert.match(home, /ActionConfirmation/);
  assert.match(home, /onConfirmAction/);
  assert.match(home, /aria-live="polite"/);
  assert.match(home, /<SimplifiedVoiceMode/);
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
  assert.match(modal, /title="Selecionar mês"/);
  assert.match(modal, /aria-label="Ano anterior"/);
  assert.match(modal, /aria-label="Próximo ano"/);
  assert.match(modal, /MONTH_LABELS\.map/);
  assert.match(modal, />\s*Este mês\s*</);
  assert.match(modal, />\s*Cancelar\s*</);
  assert.match(modal, />\s*Aplicar\s*</);
});

// Tela 22d: o seletor passou a usar o Modal compartilhado, que no celular é a
// folha padrão. Escape, toque fora, X, portal, role="dialog" e a trava de
// rolagem vêm de lá, sem cópia própria.
test('MonthPickerModal usa o Modal compartilhado para fechar (Escape, toque fora, X) -- nunca window.confirm', async () => {
  const [modal, baseModal] = await Promise.all([
    source('./MonthPickerModal.jsx'),
    source('../../components/ui/Modal/Modal.jsx'),
  ]);
  assert.match(modal, /import Modal from '\.\.\/\.\.\/components\/ui\/Modal';/);
  assert.match(modal, /<Modal\s*\n\s*open=\{open\}\s*\n\s*onClose=\{onClose\}/);
  assert.doesNotMatch(modal, /window\.confirm|createPortal/);
  assert.match(baseModal, /event\.key === 'Escape'/);
  assert.match(baseModal, /function handleOverlayClick\(event\) \{/);
  assert.match(baseModal, /aria-label="Fechar"/);
});

test('o Modal compartilhado do seletor bloqueia o scroll da página, é portal e usa role="dialog" acessível', async () => {
  const baseModal = await source('../../components/ui/Modal/Modal.jsx');
  assert.match(baseModal, /document\.body\.style\.overflow = 'hidden'/);
  assert.match(baseModal, /document\.body\.style\.overflow = previousOverflow/);
  assert.match(baseModal, /createPortal\(/);
  assert.match(baseModal, /role="dialog"/);
  assert.match(baseModal, /aria-modal="true"/);
});

test('CSS do MonthPickerModal segue a tela 22d: grade 4x3, mês marcado em violeta, futuro sem toque', async () => {
  const css = await source('./MonthPickerModal.module.css');
  assert.match(css, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.monthCell\[aria-pressed="true"\] \{[\s\S]*?var\(--uf-app-brand-violet\)/);
  assert.match(css, /\.monthCell:disabled \{[\s\S]*?cursor: not-allowed;/);
  assert.match(css, /background: var\(--uf-app-well\)/);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i);
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

// BLOCO SALDO/RECEITA/DESPESA EDITAVEIS: um ajuste com adjustment_target
// 'income'/'expense' corrige o total daquele card somando o delta assinado
// (pode ser negativo, reduzindo o total) -- sem alterar nenhum lançamento
// real. Ajuste com adjustment_target null/'balance' (o caso original)
// nunca entra nessa soma, só afeta o saldo (já calculado no servidor).
test('resumo mensal soma correções de receita/despesa (adjustment_target) aos totais reais, sem tocar no saldo já calculado', () => {
  const summary = summarizeMonth([
    { id: '1', status: 'completed', transaction_type: 'income', amount: 1200 },
    { id: '2', status: 'completed', transaction_type: 'expense', amount: 350 },
    // Correção: receita real deveria ser MAIOR (delta positivo).
    { id: '3', status: 'completed', transaction_type: 'adjustment', adjustment_target: 'income', adjustment_delta: 300 },
    // Correção: despesa real deveria ser MENOR (delta negativo).
    { id: '4', status: 'completed', transaction_type: 'adjustment', adjustment_target: 'expense', adjustment_delta: -50 },
    // Ajuste de saldo comum (target null) nunca entra na soma de receita/despesa.
    { id: '5', status: 'completed', transaction_type: 'adjustment', adjustment_target: null, adjustment_delta: 999 },
  ], 2850.5);

  assert.equal(summary.income, 1500);
  assert.equal(summary.expense, 300);
  assert.equal(summary.balance, 2850.5);
});

// ── BLOCO FINAL DO MVP (Saldo manual) ────────────────────────────────────

// BLOCO SALDO/RECEITA/DESPESA EDITAVEIS: os 3 cards do resumo mensal abrem a
// MESMA modal (UpdateBalanceModal), passando currentValue/target de acordo
// com o card tocado -- não é mais exclusiva do Saldo, nem depende de
// accountState (removido junto com a exigência de conta).
test('Entradas/Saídas mantêm a modal; o terceiro card abre a Agenda existente', async () => {
  const records = await source('./SimplifiedRecordsPage.jsx');
  assert.match(records, /import UpdateBalanceModal from '\.\/UpdateBalanceModal\.jsx';/);
  assert.match(records, /<UpdateBalanceModal/);
  assert.match(records, /onChanged=\{refresh\}/);
  assert.match(records, /onEdited=\{handleTransactionEdited\}/);
  assert.match(records, /target=\{summaryModalTarget \?\? 'income'\}/);
  assert.match(records, /onCardClick=\{openSummaryCard\}/);
  assert.match(records, /navigate\(SIMPLIFIED_ROUTES\.AGENDA\)/);
  assert.match(records, /key=\{summaryModalTarget \?\? 'summary-modal-closed'\}/);
  assert.doesNotMatch(records, /accountState=\{displayAccountState\}\s*\n\s*\/>/);
});

// Correção (Bloco Saldo + Cobrança), preservada na generalização: abrir
// qualquer um dos 3 ajustes NUNCA exige conta ativa preexistente -- só a
// permissão de workspace bloqueia.
test('abrir ajuste de Entrada/Saída exige permissão; Agenda navega sem depender de permissão financeira', async () => {
  const records = await source('./SimplifiedRecordsPage.jsx');
  const fnStart = records.indexOf('function openSummaryCard(target)');
  assert.ok(fnStart > -1, 'openSummaryCard deve existir');
  const fnSlice = records.slice(fnStart, records.indexOf('\n  }', fnStart));
  assert.match(fnSlice, /target === 'agenda'/);
  assert.match(fnSlice, /navigate\(SIMPLIFIED_ROUTES\.AGENDA\)/);
  assert.match(fnSlice, /if \(!canManage\) return;/);
  assert.doesNotMatch(fnSlice, /activeAccounts\.length/);
});

test('os 3 cards (Entradas/Saídas/Agenda) são botões acessíveis e Agenda anuncia a ação', async () => {
  const records = await source('./SimplifiedRecordsPage.jsx');
  assert.match(records, /onClick=\{\(\) => onCardClick\(card\.id\)\}/);
  assert.match(records, /card\.id === 'agenda'/);
  assert.match(records, /card\.detail/);
  assert.doesNotMatch(records, /label: 'Saldo'/);
  assert.match(records, /<strong aria-hidden="true"[^>]*>/);
});

test('histórico exibe o sinal correto de um ajuste de saldo positivo (nunca sempre vermelho como despesa)', async () => {
  const records = await source('./SimplifiedRecordsPage.jsx');
  assert.match(records, /const isPositiveAdjustment = transaction\.transaction_type === 'adjustment'/);
  assert.match(records, /&& Number\(transaction\.adjustment_delta\) > 0;/);
  assert.match(records, /isIncome \|\| isPositiveAdjustment \? styles\.positiveAmount/);
  assert.match(records, /\{isIncome \|\| isPositiveAdjustment \? '\+' : isTransfer \? '' : '-'\}/);
});

// BLOCO EXCLUIR FACILITADO (correção de UX reportada): arrastar para
// esquerda revelava Editar/Excluir, mas arrastar de volta para a direita
// não fechava -- a linha ficava travada. dragX passou a ser sincronizado
// com isOpen via effect (nunca fica preso no último valor de um gesto
// anterior) e o cálculo de arraste agora parte de -SWIPE_REVEAL_PX quando
// a linha já está aberta, permitindo fechar arrastando de volta.
test('TransactionRow sincroniza dragX com isOpen durante o render (nunca dentro de useEffect, evita cascading render) -- nunca fica visualmente deslocada com o painel de ações fechado', async () => {
  const records = await source('./SimplifiedRecordsPage.jsx');
  const start = records.indexOf('function TransactionRow({');
  const slice = records.slice(start, records.indexOf('function TransactionList({'));
  assert.match(slice, /if \(isOpen !== prevIsOpen\) \{\s*\n\s*setPrevIsOpen\(isOpen\);\s*\n\s*setDragX\(isOpen \? -SWIPE_REVEAL_PX : 0\);\s*\n\s*\}/);
});

test('arrastar de volta (linha já aberta) fecha o painel de ações via onClose -- nunca fica travado', async () => {
  const records = await source('./SimplifiedRecordsPage.jsx');
  const start = records.indexOf('function TransactionRow({');
  const slice = records.slice(start, records.indexOf('function TransactionList({'));
  assert.match(slice, /const baseX = isOpen \? -SWIPE_REVEAL_PX : 0;/);
  assert.match(slice, /if \(dragX >= -SWIPE_REVEAL_PX \+ SWIPE_ACTIVATE_PX\) \{\s*\n\s*setDragX\(0\);\s*\n\s*onClose\(\);/);
});

test('tocar a linha (ou o ícone de menu) quando já está aberta fecha o painel, em vez de não fazer nada', async () => {
  const records = await source('./SimplifiedRecordsPage.jsx');
  const start = records.indexOf('function TransactionRow({');
  const slice = records.slice(start, records.indexOf('function TransactionList({'));
  assert.match(slice, /onClick=\{\(\) => \{ if \(isOpen\) \{ onClose\(\); \} else \{ onEdit\(transaction\); \} \}\}/);
  assert.match(slice, /if \(isOpen\) \{ onClose\(\); \} else \{ onOpen\(\); \}/);
});

test('TransactionList passa onClose=\\{closeRow\\} para cada linha (mesma função que fecha via editar/excluir/cancelar)', async () => {
  const records = await source('./SimplifiedRecordsPage.jsx');
  assert.match(records, /onClose=\{closeRow\}/);
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
    { id: 'food', name: 'Alimentação', category_type: 'expense', is_active: true },
    { id: 'pet', name: 'Pets', category_type: 'expense', icon: 'gift', is_active: true },
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
  assert.equal(summaries[1].icon, 'gift');
  assert.equal(summaries[1].category_type, 'expense');
});

test('Categorias do Resumo (handoff 25): maiores do mês, Ver todas em Organizar e sem criar categoria', async () => {
  const records = await source('./SimplifiedRecordsPage.jsx');
  assert.match(records, /const CATEGORY_PREVIEW_SIZE = 5;/);
  assert.match(records, /maioresCategoriasDoMes\(\{/);
  assert.match(records, /<CategorySummary[\s\S]*categories=\{categoryState\.categoriasVisiveis\}[\s\S]*hiddenCategories=\{categoryState\.categoriasOcultas\}/);
  assert.match(records, /onShowAll=\{\(\) => navigate\(SIMPLIFIED_ROUTES\.CATEGORIAS\)\}/);
  // Criar categoria fica no + de Organizar e na folha de nova movimentação.
  assert.doesNotMatch(records, /CategoryCreateModal|Criar categoria|showAllCategories/);
  assert.match(records, /<FinanceTransactionModal[\s\S]*categoryState=\{categoryState\}/);
});

test('Registros mantém os avisos de editar e excluir lançamento', async () => {
  const records = await source('./SimplifiedRecordsPage.jsx');
  assert.match(records, /completeTransactionMutation\('Lançamento editado com sucesso\.'\)/);
  assert.match(records, /completeTransactionMutation\('Lançamento excluído com sucesso\.'\)/);
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
  assert.match(shell, /const openNotifications = useCallback\(\(\) => \{\s*clearCloseTimer\(\);\s*void refresh\(\);/);
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

// NOTIF2: dispensar (X ou arrastar) uma notificação no painel mobile usa a
// mesma remoção otimista do hook -- sem props extras/estado duplicado.
test('SimplifiedAppShell repassa dismissNotification do hook como onDismiss do painel', async () => {
  const shell = await source('./SimplifiedAppShell.jsx');
  // Fase 3 (#90): o resultado do hook fica numa variável para ser publicado
  // por contexto (página de notificações e linha do Mais leem o mesmo estado).
  assert.match(shell, /const notificationsState = useNotifications\(\);/);
  assert.match(shell, /dismissNotification,\s*\n\s*\} = notificationsState;/);
  assert.match(shell, /onDismiss=\{dismissNotification\}/);
});

// ============================================================================
// NOTIF-UX3 -- Notification Center mobile: auditoria encontrou o painel
// nascendo em fluxo normal dentro de .shellTopRegion (que só ganha altura
// quando ele está aberto, já que o header é fixed) -- ou seja, o topo do
// painel ficava exatamente onde o header fixo já se sobrepõe, "misturando"
// com a Home. Corrigido com position:absolute ancorado em
// var(--uf-header-full-height) + backdrop próprio + congelamento de
// scroll -- ver testes abaixo.
// ============================================================================

test('painel e backdrop vivem DENTRO de .shellTopRegion (mesmo contexto de empilhamento do header) -- nunca fora dela', async () => {
  const shell = await source('./SimplifiedAppShell.jsx');
  const topRegionBlock = shell.slice(
    shell.indexOf('<div className={styles.shellTopRegion}>'),
    shell.indexOf('<main'),
  );
  assert.match(topRegionBlock, /className=\{styles\.notificationsBackdrop\}/);
  assert.match(topRegionBlock, /className=\{styles\.notificationsDropdown\}/);
});

test('painel nunca contribui pra altura de .shellTopRegion -- position:absolute, nunca fluxo normal (Home não é empurrada)', async () => {
  const css = await source('./simplifiedApp.module.css');
  const dropdownRule = /\.notificationsDropdown \{([\s\S]*?)\n\}/.exec(css);
  assert.match(dropdownRule[1], /position: absolute;/);
  assert.doesNotMatch(dropdownRule[1], /max-height: 0;/, 'a versão antiga usava max-height:0->X em fluxo normal -- empurrava .mainContent ao abrir');
});

test('backdrop é puramente visual/bloqueio de toque -- fechar continua decidido pelo listener de pointerdown existente', async () => {
  const shell = await source('./SimplifiedAppShell.jsx');
  assert.match(shell, /<div\s*\n\s*className=\{styles\.notificationsBackdrop\}\s*\n\s*data-open=\{isNotificationsOpen \? 'true' : 'false'\}\s*\n\s*aria-hidden="true"\s*\n\s*\/>/);
  // O listener de outside-click já ignora cliques dentro do painel/botão --
  // um clique no backdrop (que não é nenhum dos dois) cai no ramo "fora",
  // fechando o painel sem precisar de handler próprio no backdrop.
  const outsideCheck = /notificationPanelRef\.current\?\.contains\(event\.target\)\s*\n\s*\|\| notificationButtonRef\.current\?\.contains\(event\.target\)/;
  assert.match(shell, outsideCheck);
});

test('painel compacto quando vazio: sem min-height forçado, sem forçar 70-80% da tela', async () => {
  const css = await source('./simplifiedApp.module.css');
  const dropdownRule = /\.notificationsDropdown \{([\s\S]*?)\n\}/.exec(css);
  assert.doesNotMatch(dropdownRule[1], /min-height/, 'altura precisa vir do conteúdo real, nunca de um piso fixo');
});

test('lista longa usa max-height em min(70dvh, ...) + scroll interno -- nunca cresce indefinidamente', async () => {
  const css = await source('./simplifiedApp.module.css');
  const dropdownRule = /\.notificationsDropdown \{([\s\S]*?)\n\}/.exec(css);
  assert.match(dropdownRule[1], /max-height: min\(\s*\n\s*70dvh,/);
  assert.match(dropdownRule[1], /overflow-y: auto;/);
});

test('animação de abertura: opacity 0->1, translateY, scale .98->1, ~190-200ms, sem curva com overshoot (nunca bounce)', async () => {
  const css = await source('./simplifiedApp.module.css');
  const dropdownRule = /\.notificationsDropdown \{([\s\S]*?)\n\}/.exec(css);
  assert.match(dropdownRule[1], /opacity: 0;/);
  assert.match(dropdownRule[1], /transform: translateY\(-8px\) scale\(\.98\);/);
  assert.match(dropdownRule[1], /transition: opacity 190ms ease, transform 190ms ease;/);
  assert.doesNotMatch(dropdownRule[1], /cubic-bezier\([^)]*[2-9]\d*\.\d|cubic-bezier\([^)]*-\d/, 'nenhuma curva com overshoot (bounce)');
});

test('fechamento remove o painel do DOM ~190ms depois (alinhado à duração pedida de 150-200ms)', async () => {
  const shell = await source('./SimplifiedAppShell.jsx');
  assert.match(shell, /\}, 190\);/);
});

test('prefers-reduced-motion desliga a transição/transform do painel e do backdrop', async () => {
  const css = await source('./simplifiedApp.module.css');
  const idx = css.lastIndexOf('@media (prefers-reduced-motion: reduce) {');
  const slice = css.slice(idx, idx + 1500);
  assert.match(slice, /\.notificationsBackdrop,\s*\n\s*\.notificationsDropdown \{\s*\n\s*transition: none;\s*\n\s*transform: none;/);
});

test('SCROLL FREEZE: .mainContent congela (overflow:hidden) enquanto o painel está aberto -- nunca reseta scrollTop', async () => {
  const shell = await source('./SimplifiedAppShell.jsx');
  const css = await source('./simplifiedApp.module.css');
  assert.match(shell, /data-notifications-open=\{isNotificationsOpen \? 'true' : undefined\}/);
  assert.match(css, /\.mainContent\[data-notifications-open="true"\] \{\s*\n\s*overflow: hidden;\s*\n\s*\}/);
  // Nenhum scrollTo/scrollTop sendo manipulado -- a posição é preservada
  // só por NUNCA ser alterada, nunca por um "restaurar" explícito.
  assert.doesNotMatch(shell, /scrollTo\(|\.scrollTop\s*=/);
});

test('CTA de Web Push: só aparece com status DEFAULT (ainda não perguntado) -- nunca nos estados denied/unsupported/not_configured', async () => {
  const shell = await source('./SimplifiedAppShell.jsx');
  assert.match(shell, /import \{ PUSH_STATUS, useWebPush \} from '\.\.\/mobile-push\/useWebPush\.js';/);
  assert.match(shell, /const showPushCta = pushStatus === PUSH_STATUS\.DEFAULT;/);
  assert.match(shell, /\{showPushCta \? \(/);
});

test('CTA de Web Push reaproveita enableNotifications() do useWebPush -- nunca uma segunda arquitetura de subscription', async () => {
  const shell = await source('./SimplifiedAppShell.jsx');
  assert.match(shell, /onClick=\{\(\) => enablePushNotifications\(\)\}/);
  assert.doesNotMatch(shell, /pushManager\.subscribe|Notification\.requestPermission/, 'nunca reimplementar a inscrição aqui -- só chamar o hook existente');
});

test('Notification Center nunca mostra Desativar/Teste/Configurar/Permissões -- só o CTA de ativar (quando aplicável) e a lista', async () => {
  const shell = await source('./SimplifiedAppShell.jsx');
  const topRegionBlock = shell.slice(
    shell.indexOf('<div className={styles.shellTopRegion}>'),
    shell.indexOf('<main'),
  );
  assert.doesNotMatch(topRegionBlock, /Desativar|Enviar notificação de teste|disableNotifications|sendTest/);
});

test('preferência de tamanho textual é aplicada como atributo no shell', async () => {
  const shell = await source('./SimplifiedAppShell.jsx');
  const css = await source('./simplifiedApp.module.css');
  assert.match(shell, /data-text-size=\{profile\?\.text_size \?\? 'standard'\}/);
  assert.match(css, /\.shell\[data-text-size="small"\]/);
  assert.match(css, /\.shell\[data-text-size="large"\]/);
});

test('.uniButton (botão grande da Uni) tem touch-action: none e bloqueia seleção/callout/drag nativos que poderiam interromper o toque prolongado', async () => {
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

test('LOTE F: a shell trava o viewport escuro e o .mainContent é o único container de scroll', async () => {
  const css = await source('./simplifiedApp.module.css');
  const shellStart = css.indexOf('.shell {');
  const shellBlock = css.slice(shellStart, css.indexOf('.shell[data-text-size', shellStart));
  assert.match(shellBlock, /overflow: hidden/);
  assert.match(shellBlock, /overscroll-behavior-y: contain/);
  // THEME SYSTEM V2 (regressão): a shell NÃO pode voltar a fixar cor literal
  // aqui -- era essa declaração local que vencia o data-theme da raiz e
  // deixava o seletor de temas sem efeito nenhum dentro de /app/*.
  assert.match(shellBlock, /--uf-color-bg-canvas:\s*var\(--uf-app-canvas\);/);
  assert.match(shellBlock, /--uf-color-text-primary:\s*var\(--uf-app-text\);/);
  assert.doesNotMatch(shellBlock, /--uf-color-[\w-]+:\s*#[0-9a-fA-F]{3,8};/);
  const mainIdx = css.indexOf('.mainContent {');
  const mainBlock = css.slice(mainIdx, css.indexOf('}', mainIdx));
  assert.match(mainBlock, /overflow-y: auto;/);
  assert.match(mainBlock, /overflow-x: clip/);
  assert.match(mainBlock, /overscroll-behavior-y: contain/);
  assert.match(mainBlock, /padding-bottom: max\(16px, env\(safe-area-inset-bottom\)\)/);
  assert.doesNotMatch(css, /data-theme="?light"?/);
});

test('chat simplificado permanece na malha da shell e acompanha o teclado sem segundo scroll', async () => {
  const shell = await source('./SimplifiedAppShell.jsx');
  const shellCss = await source('./simplifiedApp.module.css');
  const chatCss = await source('../uni-chat/UniChatPage.module.css');

  assert.match(shell, /data-uni-chat=\{isUniChatRoute \? 'true' : undefined\}/);
  assert.match(shellCss, /top: var\(--uf-visual-viewport-offset-top, 0px\);/);
  assert.match(shellCss, /\.mainContent\[data-uni-chat="true"\]\s*\{[\s\S]{0,120}overflow: hidden;[\s\S]{0,120}padding-bottom: 0;/);
  assert.match(chatCss, /\.page\s*\{[\s\S]{0,2600}position: relative;[\s\S]{0,120}height: 100%;/);
  assert.doesNotMatch(chatCss, /position: fixed;/);
});

test('CSS de Registros cobre grade responsiva, toque, safe area e movimento reduzido', async () => {
  const css = await source('./simplifiedRecords.module.css');
  assert.match(css, /env\(safe-area-inset-top\)/);
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
// UNI RING ORB (épico #99): o orb da Home e da tela de voz. O MediaRecorder
// e o TTS continuam nas fontes já estabilizadas; o orb só observa o mesmo
// stream por um AnalyserNode puramente visual.
// ============================================================================

test('o orb da barra inferior é o UniRingOrb e a Home não tem mais orb próprio', async () => {
  const [home, navigation] = await Promise.all([
    source('./SimplifiedHomeView.jsx'),
    source('./SimplifiedBottomNavigation.jsx'),
  ]);
  assert.match(navigation, /import \{ UniRingOrb \} from '\.\.\/\.\.\/components\/ui\/UniRingOrb\/index\.js';/);
  // Redesign (épico #91): orb de 64px, como no handoff.
  assert.match(navigation, /<UniRingOrb size=\{64\} \/>/);
  // A aba ativa usa a variante preenchida do ícone.
  assert.match(navigation, /isActive \? <ActiveIcon \/> : <Icon \/>/);
  assert.doesNotMatch(home, /UniNeuralOrb|<UniRingOrb/);
  assert.doesNotMatch(home, /className=\{styles\.uniAction\}/);
  assert.doesNotMatch(home, /<RadialVoiceWaveform/);
});

test('orbe recebe o stream do microfone da conversa em tempo real', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  assert.match(home, /getVoiceStream=\{realtime\.getLocalStream\}/);
  assert.doesNotMatch(home, /getUserMedia|MediaRecorder/);
});

test('o orb da barra tem nome acessível e rótulo visível "Falar"', async () => {
  const navigation = await source('./SimplifiedBottomNavigation.jsx');
  assert.match(navigation, /aria-label="Falar com a Uni"/);
  assert.match(navigation, /<span aria-hidden="true">\{item\.label\}<\/span>/);
  assert.match(navigation, /data-uni-voice-control/);
});

test('preferência de movimento reduzido continua desligando a análise de voz visual e as animações do orb', async () => {
  const hook = await source('../uni-voice-realtime/useVoiceIntensity.js');
  const theme = await source('../../styles/theme.css');
  assert.match(hook, /if \(prefersReducedMotion\(browserRuntime\)\) return undefined;/);
  // O UniRingOrb anima só em CSS; a regra global do tema encurta toda
  // animação quando o sistema pede movimento reduzido.
  assert.match(theme, /@media \(prefers-reduced-motion: reduce\)\{\s*\*\{\s*animation-duration: \.001ms !important;/);
});

// ============================================================================
// HOTFIX P1.4: o card compacto da Home não tem "Ouvir resposta". Desde
// 13/10/2026 nenhuma resposta é lida em voz alta fora da conversa em tempo
// real.
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

test('HOTFIX P1.4: SimplifiedHomeView não repassa onSpeakMessage/voiceEnabled para CompactResponse', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  const idx = home.indexOf('<CompactResponse');
  const endIdx = home.indexOf('/>', idx);
  const block = home.slice(idx, endIdx);
  assert.doesNotMatch(block, /voiceEnabled=\{voiceEnabled\}/);
  assert.doesNotMatch(block, /onSpeakMessage=\{onSpeakMessage\}/);
});

test('abrir a conversa em tempo real não depende da voz do chat, que saiu', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  const begin = home.slice(home.indexOf('function beginRealtimeConversation() {'));
  assert.match(begin, /^[^}]*realtime\.start\(/);
  assert.doesNotMatch(home, /voiceController|onBeforeVoiceStart|uni-voice-tts/);
});

test('rótulos do botão central usam tipografia menor sem alterar o orb', async () => {
  const css = await source('./simplifiedApp.module.css');
  const labelStart = css.indexOf('.uniButtonLabel {');
  const labelRule = css.slice(labelStart, css.indexOf('}', labelStart));
  assert.match(labelRule, /font-size: clamp\(14px, 3\.6vw, 20px\);/);
});

test('Requisito 4 — o orb da barra só escuta click e só navega para a Home com ?falar=1', async () => {
  const navigation = await source('./SimplifiedBottomNavigation.jsx');
  const start = navigation.indexOf('className={styles.navigationVoice}');
  const slice = navigation.slice(start, navigation.indexOf('</button>', start));
  assert.match(slice, /onClick=\{\(\) => navigate\(buildVoiceModeUrl\(\)\)\}/);
  assert.doesNotMatch(slice, /onPointerDown|onTouchStart|onTouchEnd|onKeyDown|onMouseDown/);
});

test('aviso do Histórico fica o tempo de ler: piso de 4 s, cresce com o texto e para em 15 s', async () => {
  const { transactionNoticeDuration } = await import('./simplifiedRecordsData.js');
  assert.equal(transactionNoticeDuration('Saída registrada.'), 4000);
  assert.equal(transactionNoticeDuration('x'.repeat(100)), 6500);
  assert.equal(transactionNoticeDuration('x'.repeat(1000)), 15000);
});

test('movimentação nova pela folha fecha, avisa no topo e anima a linha e os números (#145)', async () => {
  const records = await source('./SimplifiedRecordsPage.jsx');
  const createdStart = records.indexOf('function handleTransactionCreated(transaction)');
  const created = records.slice(createdStart, records.indexOf('function handleTransactionDeleted()', createdStart));
  assert.match(created, /setTransactionDialog\(null\)/);
  assert.match(created, /showTransactionNotice\(CREATED_NOTICES\[transaction\?\.transaction_type\]/);
  // Fica na aba em que estava: a linha nova e a contagem aparecem ali.
  assert.doesNotMatch(created, /setActiveTab/);
  assert.match(records, /onCreated=\{handleTransactionCreated\}/);
  assert.match(records, /useNumeroContado\(summary\.income, \{ segurar: holdSummary, esqueleto: showLoading \}\)/);
  assert.match(records, /useNumeroContado\(summary\.expense, \{ segurar: holdSummary, esqueleto: showLoading \}\)/);
  assert.match(records, /animarLinhaNova\(/);
  assert.match(records, /data-transaction-id=\{transaction\.id\}/);
});

test('carregamento: esqueleto com brilho de 1,3 s, conteúdo do mês entra em sequência e os números contam (#146)', async () => {
  const records = await source('./SimplifiedRecordsPage.jsx');
  const recordsCss = await source('./simplifiedRecords.module.css');
  const homeCss = await source('./simplifiedApp.module.css');
  const graph = await source('./SimplifiedHomeFinancialGraph.jsx');
  const graphCss = await source('./SimplifiedHomeFinancialGraph.module.css');
  assert.match(recordsCss, /animation: recordsLoading var\(--uf-motion-esqueleto\) linear infinite/);
  assert.match(homeCss, /animation: homeSkeletonWave var\(--uf-motion-esqueleto\) linear infinite/);
  assert.match(graphCss, /animation: homeGraphSkeletonWave var\(--uf-motion-esqueleto\) linear infinite/);
  // O esqueleto do Financeiro sai e o conteúdo do mês entra em sequência.
  // Esqueleto só na primeira carga do mês: recarga mantém o conteúdo e os números contam do antigo ao novo.
  assert.match(records, /const showLoading = loadedMonthKey !== month\.dateFrom;/);
  assert.match(records, /if \(isLoading\) \{\s*loadingMonthKeyRef\.current = month\.dateFrom;/);
  assert.match(records, /\{showLoading \? \(/);
  assert.match(records, /if \(!leftLoading \|\| holdSummary \|\| !monthSectionRef\.current\) return;\s*entrarEmSequencia\(/);
  assert.match(records, /<section ref=\{monthSectionRef\} className=\{styles\.monthSection\}/);
  // Entradas e Saídas da Home contam ao chegar o dado fresco, como ao voltar para a aba.
  assert.match(graph, /useNumeroContado\(graphData\?\.expense, \{ esqueleto: showSkeleton \}\)/);
  assert.match(graph, /useNumeroContado\(graphData\?\.income, \{ esqueleto: showSkeleton \}\)/);
  // Recarga fica no último dado fresco, sem voltar ao cache da montagem nem ao esqueleto.
  assert.match(graph, /const graphData = isLoadingFinancials \? knownData : freshData;/);
  assert.match(graph, /ref=\{expenseValueRef\}/);
  assert.match(graph, /Number\.isFinite\(shownExpense\) \? formatCurrency\(shownExpense\) : graphData\.expenseLabel/);
});

test('folha sobe com a mola folha, o fundo escurece em 240 ms e Reduzir movimento vira fade de 150 ms (#145)', async () => {
  const modalCss = await source('../../components/ui/Modal/Modal.module.css');
  const sheetCss = await source('../../pages/financeiro/FinanceTransactionModal.module.css');
  const toastCss = await source('./simplifiedRecords.module.css');
  for (const css of [modalCss, sheetCss]) {
    assert.match(css, /animation: folhaSobe var\(--uf-motion-mola-folha-duracao\) var\(--uf-motion-mola-folha\)/);
    assert.match(css, /animation: fundoEscurece var\(--uf-motion-fundo\)/);
    assert.match(css, /prefers-reduced-motion: reduce\)[\s\S]*?animation: fundoEscurece var\(--uf-motion-reduzido\) linear both/);
  }
  assert.match(toastCss, /animation: avisoDesce var\(--uf-motion-mola-salto-duracao\) var\(--uf-motion-mola-salto\)/);
  assert.match(toastCss, /\.transactionSuccessToast \{\s*animation: avisoSurge var\(--uf-motion-reduzido\)/);
});

// #80: na Home, o rascunho esperando a categoria mostra chips; o toque passa
// a categoria escolhida ao chat. Na tela de voz a pessoa diz o nome.
test('Home mostra chips de categoria fora da tela de voz e ignora o toque com a Uni ocupada', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  assert.match(home, /!isVoicePresentation && categoryChoices\.length > 0 && typeof onChooseCategory === 'function'/);
  assert.match(home, /function handleChooseCategory\(item\) \{\s*if \(isTyping \|\| isExecuting \|\| typeof onChooseCategory !== 'function'\) return;\s*markHomeReply\(\);\s*onChooseCategory\(item\);/);
  assert.match(home, /categoryChoices=\{categoryChoices\}\s*onChooseCategory=\{handleChooseCategory\}/);
});

test('Home: campo de lançamento rápido usa o ChatInput e o mesmo envio da conversa, e a resposta fica no card da Home', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  assert.match(home, /import ChatInput from '\.\.\/uni-chat\/components\/ChatInput\.jsx';/);
  assert.match(home, /<ChatInput[\s\S]*?onSend=\{handleQuickSend\}[\s\S]*?disabled=\{isInteractionBusy\}/);
  const handler = home.slice(home.indexOf('function handleQuickSend'), home.indexOf('function handleChooseCategory'));
  assert.match(handler, /markHomeReply\(\);\s*onSendTranscript\(text\);/);
});

test('Home: não traz o card do Relatório', async () => {
  const home = await source('./SimplifiedHomeView.jsx');
  assert.doesNotMatch(home, /SimplifiedReportCard/);
});
