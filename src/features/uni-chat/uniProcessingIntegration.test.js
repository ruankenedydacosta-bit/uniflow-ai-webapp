// FASE ESTADOS DE PROCESSAMENTO: testes estruturais (source-regex) sobre o
// wiring em UniChatPage.jsx e SimplifiedHomeView.jsx -- mesmo padrão já
// usado no projeto para componentes/hooks React (sem @testing-library/react
// disponível). A lógica pura (mensagens/ritmo/sincronização) já está
// coberta exaustivamente em uniProcessingMessages.test.js e
// textAudioSync.test.js; aqui cobrimos que o wiring realmente liga tudo do
// jeito certo, sem duplicar timers, sem persistir estado efêmero, sem
// publicar mensagens duplicadas.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// ============================================================================
// UniChatPage.jsx -- fonte única (hooks compartilhados) calculada ANTES do
// branch simplified-home, nunca depois de um return condicional.
// ============================================================================

test('hooks de processamento/sincronização são chamados ANTES do branch "variant === simplified-home" (nunca depois de um return condicional)', async () => {
  const page = await source('./UniChatPage.jsx');
  const hooksIdx = page.indexOf('const chatProcessingMessage = useUniProcessingMessage(');
  const branchIdx = page.indexOf("if (variant === 'simplified-home') {");
  assert.ok(hooksIdx > -1 && branchIdx > -1);
  assert.ok(hooksIdx < branchIdx, 'hooks devem ser calculados antes do return condicional');
});

test('estado de processamento do chat completo deriva de isExecutingAction/isTyping reais -- nunca inventa um estado novo', async () => {
  const page = await source('./UniChatPage.jsx');
  assert.match(page, /const chatProcessingState = isExecutingAction \? 'executing' : \(isTyping \? 'interpreting' : 'idle'\);/);
});

test('actionKind honesto vem da mensagem de confirmação PENDENTE real, nunca inventado', async () => {
  const page = await source('./UniChatPage.jsx');
  assert.match(page, /messages\.find\(\(m\) => m\.confirmation\?\.status === 'pending'\) \?\? null/);
  assert.match(page, /actionKind: pendingConfirmationMessage\?\.confirmation\?\.actionKind \?\? null/);
});

test('TypingIndicator recebe a mensagem rotativa; ActionConfirmation recebe o rótulo dinâmico por mensagem -- só quando pendente', async () => {
  const page = await source('./UniChatPage.jsx');
  assert.match(page, /<TypingIndicator message=\{chatProcessingMessage\} \/>/);
  const propIdx = page.indexOf("message.confirmation?.status === 'pending' ? chatProcessingMessage");
  assert.ok(propIdx > -1);
});

test('nenhuma mensagem de processamento é publicada via createAssistantResponse/pushMessage -- é puramente estado de UI efêmero', async () => {
  const page = await source('./UniChatPage.jsx');
  assert.doesNotMatch(page, /createAssistantResponse\(chatProcessingMessage/);
  assert.doesNotMatch(page, /pushMessage\(.*chatProcessingMessage/);
  assert.doesNotMatch(page, /persistMessage\(.*chatProcessingMessage/);
  assert.doesNotMatch(page, /syncMessageToSupabase\(.*chatProcessingMessage/);
});

test('nenhuma nova chamada a LLM ou TTS foi introduzida pela fase -- os únicos usos de uniVoice/uniLlm continuam os já existentes', async () => {
  const page = await source('./UniChatPage.jsx');
  assert.doesNotMatch(page, /uniVoice\.speak\([^)]*chatProcessingMessage/);
  assert.doesNotMatch(page, /uniLlm\.[a-zA-Z]+\([^)]*chatProcessingMessage/);
});

// ============================================================================
// SimplifiedHomeView.jsx -- mesmos hooks compartilhados, chamados ANTES de
// qualquer return condicional dentro de CompactResponse.
// ============================================================================

test('CompactResponse chama os hooks ANTES do early-return "sem lastUser/lastUni"', async () => {
  const home = await source('../simplified-app/SimplifiedHomeView.jsx');
  const hooksIdx = home.indexOf('const processingMessage = useUniProcessingMessage(');
  const returnIdx = home.indexOf('if (!lastUser && !lastUni) return null;');
  assert.ok(hooksIdx > -1 && returnIdx > -1);
  assert.ok(hooksIdx < returnIdx);
});

test('indicador de processamento na Home só aparece para os estados sem UI própria (interpreting/executing) -- nunca sobrepõe a confirmação pendente ou a resposta final', async () => {
  const home = await source('../simplified-app/SimplifiedHomeView.jsx');
  assert.match(home, /const PROCESSING_DISPLAY_STATES = new Set\(\[\s*SIMPLIFIED_UNI_STATES\.INTERPRETING,\s*SIMPLIFIED_UNI_STATES\.EXECUTING,\s*\]\);/);
  assert.doesNotMatch(home, /SIMPLIFIED_UNI_STATES\.WAITING_CONFIRMATION,\s*\n\s*\]\);/);
});

test('a Home reaproveita o MESMO hook compartilhado (nenhuma reimplementação local de timers/rotação)', async () => {
  const home = await source('../simplified-app/SimplifiedHomeView.jsx');
  assert.match(home, /import \{ useUniProcessingMessage \} from '\.\.\/uni-chat\/useUniProcessingMessage\.js';/);
  assert.doesNotMatch(home, /useTextAudioSync|window\.setTimeout\(.*processingMessage/);
});

test('CSS do indicador de processamento respeita prefers-reduced-motion (sem animação nova sem esse cuidado)', async () => {
  const css = await source('../simplified-app/simplifiedApp.module.css');
  const reducedMotionIdx = css.lastIndexOf('@media (prefers-reduced-motion: reduce) {');
  const slice = css.slice(reducedMotionIdx, reducedMotionIdx + 700);
  assert.match(slice, /\.uniProcessing \{\s*animation: none;\s*\}/);
  assert.match(slice, /\.uniProcessingDot \{\s*animation: none;/);
});

test('identidade visual usa a paleta oficial (gradiente azul/roxo/verde) -- não inventa uma cor nova', async () => {
  const css = await source('../simplified-app/simplifiedApp.module.css');
  const idx = css.indexOf('.uniProcessingDot {');
  const slice = css.slice(idx, idx + 200);
  // Mesma paleta oficial (azul -> azul claro -> verde), agora pelos tokens
  // do tema para o indicador não destoar do fundo em Claro/Escuro.
  assert.match(slice, /linear-gradient\(105deg, var\(--uf-app-primary\), var\(--uf-app-primary\) 50%, var\(--uf-app-success\)\)/);
});

// ============================================================================
// HOTFIX continuidade texto/voz: bug 1 (resposta antiga aparecia durante
// novo processamento) e bug 2 (resposta nova aparecia completa e "voltava"
// para revelação parcial) -- ver SimplifiedHomeView.jsx CompactResponse.
// ============================================================================

test('isAwaitingNewResponse foi REMOVIDO (era redundante e perigoso no reload -- travava o indicador para sempre se a conversa persistida terminasse com uma mensagem do usuário sem resposta)', async () => {
  const home = await source('../simplified-app/SimplifiedHomeView.jsx');
  assert.doesNotMatch(home, /const isAwaitingNewResponse/);
});

test('showProcessingIndicator: só um estado de processamento com mensagem', async () => {
  const home = await source('../simplified-app/SimplifiedHomeView.jsx');
  const idx = home.indexOf('const showProcessingIndicator = Boolean(');
  const endIdx = home.indexOf(');', idx);
  const slice = home.slice(idx, endIdx);
  assert.match(slice, /processingMessage && PROCESSING_DISPLAY_STATES\.has\(interactionState\)/);
  // A identidade de turno vinha da captura gravada e a fase pending vinha
  // da voz do chat. As duas saíram.
  assert.doesNotMatch(home, /isTurnAwaitingFreshResponse|turnStartToken|isVoicePendingPlayback/);
});

test('HOTFIX P0 (4ª investigação): existe um fallback honesto de processamento para quando processingMessage é null durante um turno ativo -- nunca deixa a decisão de esconder lastUni sem NENHUM texto para mostrar no lugar', async () => {
  const home = await source('../simplified-app/SimplifiedHomeView.jsx');
  assert.match(home, /const displayedProcessingMessage = processingMessage \?\? 'Entendendo seu pedido…';/);
  // o branch que renderiza a resposta antiga só é alcançável quando
  // showProcessingIndicator é false -- e o texto do indicador, quando
  // mostrado, é sempre displayedProcessingMessage (nunca processingMessage
  // cru, que poderia ser null e deixar o <p> vazio).
  const idx = home.indexOf('{showProcessingIndicator ? (');
  const slice = home.slice(idx, home.indexOf(') : lastUni?.text ? (', idx));
  assert.match(slice, /\{displayedProcessingMessage\}/);
});

test('P1.1: NUNCA expõe "Preparando a resposta em voz..."', async () => {
  const home = await source('../simplified-app/SimplifiedHomeView.jsx');
  assert.doesNotMatch(home, /Preparando a resposta em voz/);
  const messages = await source('./uniProcessingMessages.js');
  assert.doesNotMatch(messages, /speaking_pending|Preparando a resposta em voz/);
});

test('histórico real da conversa nunca é apagado pelo hotfix -- só a apresentação visual (nenhum setMessages/splice em CompactResponse)', async () => {
  const home = await source('../simplified-app/SimplifiedHomeView.jsx');
  const start = home.indexOf('function CompactResponse(');
  const end = home.indexOf('\nfunction SimplifiedHomeView(');
  const slice = home.slice(start, end);
  assert.doesNotMatch(slice, /setMessages|\.splice\(|messages\.pop\(|messages\.shift\(/);
});

// ============================================================================
// HOTFIX (abandono da revelação progressiva): a resposta nunca aparece
// parcialmente -- não existe mais fade de borda, texto puro alternativo ao
// Markdown, nem qualquer estado de "revelando". Ou o texto está oculto
// (pending) ou está 100% visível de uma vez, junto com a voz.
// ============================================================================

test('chat completo: MessageBubble não tem mais nenhum resquício de revelação progressiva/fade de borda', async () => {
  const bubble = await source('./components/MessageBubble.jsx');
  assert.doesNotMatch(bubble, /splitRevealedTextForFade/);
  assert.doesNotMatch(bubble, /isRevealingVoiceText/);
  assert.doesNotMatch(bubble, /revealEdge/);
  assert.doesNotMatch(bubble, /showPlainRevealText/);
  // sempre usa SafeMarkdown para a resposta da Uni -- nunca um caminho
  // alternativo de texto puro para "durante a revelação".
  assert.match(bubble, /<SafeMarkdown className=\{styles\.text\}>\{message\.text\}<\/SafeMarkdown>/);
});

test('chat completo: UniChatPage não repassa mais isRevealingVoiceText a MessageBubble (não existe mais)', async () => {
  const page = await source('./UniChatPage.jsx');
  assert.doesNotMatch(page, /isRevealingVoiceText/);
});

test('Home: CompactResponse não tem mais fade de borda nem estado de revelação parcial', async () => {
  const home = await source('../simplified-app/SimplifiedHomeView.jsx');
  assert.doesNotMatch(home, /splitRevealedTextForFade/);
  assert.doesNotMatch(home, /revealEdge/);
  assert.doesNotMatch(home, /isRevealingUniText/);
});
