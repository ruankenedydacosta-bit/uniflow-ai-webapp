import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// ============================================================================
// Ausência de nome hardcoded / dado pessoal fabricado
// ============================================================================

test('UniChatPage não contém nome hardcoded na saudação (usa resolveGreetingName)', async () => {
  const page = await source('UniChatPage.jsx');
  assert.match(page, /import \{ resolveGreetingName \} from '\.\/greeting';/);
  assert.match(page, /resolveGreetingName\(profile\)/);
  assert.doesNotMatch(page, /['"]Ruan['"]/);
});

test('mockData.js não exporta mais nome de usuário fixo (USER_NAME removido)', async () => {
  const mock = await source('mockData.js');
  assert.doesNotMatch(mock, /USER_NAME/);
  assert.doesNotMatch(mock, /['"]Ruan['"]/);
});

test('EmptyState nunca usa nome fixo; cai para saudação neutra quando ausente', async () => {
  const empty = await source('components/EmptyState.jsx');
  assert.match(empty, /userName \? `Olá, \$\{userName\}\.` : 'Olá!'/);
});

// ============================================================================
// Ausência de dados financeiros fabricados no fluxo de produção
// ============================================================================

test('UniChatPage nunca chama generateUniResponse (função com valores fabricados)', async () => {
  const page = await source('UniChatPage.jsx');
  assert.doesNotMatch(page, /generateUniResponse/);
});

test('generateUniResponse (mockData.js) permanece isolado, sem nenhum consumidor de produção', async () => {
  const page = await source('UniChatPage.jsx');
  const chatInput = await source('components/ChatInput.jsx');
  const messageBubble = await source('components/MessageBubble.jsx');
  const emptyState = await source('components/EmptyState.jsx');
  const combined = [page, chatInput, messageBubble, emptyState].join('\n');
  assert.doesNotMatch(combined, /generateUniResponse/);
});

test('respostas financeiras reais do chat vêm de financialQueryInterpreter/financialConversation, nunca de mockData', async () => {
  const page = await source('UniChatPage.jsx');
  assert.match(page, /classifyFinancialQuery/);
  assert.match(page, /buildQueryResponse/);
  assert.match(page, /financialConversation\.interpret/);
});

// ============================================================================
// Integração com useUniLlm (D7) e fallback determinístico
// ============================================================================

test('UniChatPage consome useUniLlm e AI_STATUS do bloco consolidado', async () => {
  const page = await source('UniChatPage.jsx');
  assert.match(page, /import \{ useUniLlm, AI_STATUS \} from '\.\.\/uni-llm';/);
  assert.match(page, /const uniLlm = useUniLlm\(\);/);
});

test('mensagem não resolvida só tenta o LLM quando habilitado, e sempre cai no fallback determinístico se falhar', async () => {
  const page = await source('UniChatPage.jsx');
  const fnBody = page.slice(
    page.indexOf('async function handleUnresolvedMessage'),
    page.indexOf('function sendText'),
  );
  assert.match(fnBody, /if \(uniLlm\.enabled\) \{/);
  assert.match(fnBody, /catch \{\s*\n\s*llmText = null;/);
  assert.match(fnBody, /buildUniMessage\(llmText \|\| UNI_DETERMINISTIC_FALLBACK_TEXT\)/);
});

test('pergunta futura ampla é interceptada ANTES do LLM, nunca chega a handleUnresolvedMessage', async () => {
  const page = await source('UniChatPage.jsx');
  assert.match(
    page,
    /import \{\s*\n\s*classifyFinancialQuery,\s*\n\s*buildQueryResponse,\s*\n\s*detectFutureFinancialIntent,\s*\n\s*buildFutureSafetyResponse,\s*\n\s*\} from '\.\/financialQueryInterpreter';/,
  );

  const resultBlock = page.slice(
    page.indexOf('const result = financialConversation.interpret(text);'),
    page.indexOf('if (result.action?.status'),
  );
  assert.match(resultBlock, /if \(!result\.handled\) \{/);

  const guardIdx = resultBlock.indexOf('detectFutureFinancialIntent(text)');
  const llmCallIdx = resultBlock.indexOf('void handleUnresolvedMessage(text, historySnapshot);');
  assert.ok(guardIdx !== -1, 'detectFutureFinancialIntent deve ser chamado dentro do bloco !result.handled');
  assert.ok(llmCallIdx !== -1, 'handleUnresolvedMessage (LLM) deve continuar existindo como fallback final');
  assert.ok(guardIdx < llmCallIdx, 'a blindagem de futuro deve ser verificada ANTES da chamada ao LLM');

  assert.match(resultBlock, /buildFutureSafetyResponse\(futureProjections\.hasHistory\)/);
});

// ============================================================================
// Voz: entrada não sobrescreve texto existente; saída não bloqueia renderização
// ============================================================================

test('entrada por voz concatena ao texto já digitado, nunca sobrescreve', async () => {
  const chatInput = await source('components/ChatInput.jsx');
  assert.match(chatInput, /const next = current \? `\$\{current\} \$\{clean\}` : clean;/);
});

test('falha/ausência de suporte a voz mantém a digitação funcional (input sempre habilitado)', async () => {
  const chatInput = await source('components/ChatInput.jsx');
  assert.doesNotMatch(chatInput, /input[\s\S]{0,120}disabled=\{.*voice/i);
  assert.match(chatInput, /onChange=\{\(e\) => onChange\(e\.target\.value\)\}/);
});

test('saída por voz é opcional: MessageBubble renderiza o texto independentemente de canSpeak/onSpeak', async () => {
  const bubble = await source('components/MessageBubble.jsx');
  assert.match(bubble, /canSpeak = false/);
  assert.match(bubble, /<p className=\{styles\.text\}>/);
  const showSpeakLine = bubble.match(/const showSpeak = .*/)?.[0] ?? '';
  assert.match(showSpeakLine, /canSpeak/);
});

// ============================================================================
// Ausência de integração direta com OpenAI/Supabase fora do provider já publicado
// ============================================================================

// ============================================================================
// OPENAI2 -- integração funcional: AI_STATUS, cancelamento e "tentar
// novamente" para a resposta real da IA (loading/responding/error/success),
// sem alterar o fluxo determinístico nem a persistência já existentes.
// ============================================================================

test('handleUnresolvedMessage guarda a pergunta em lastUnresolvedRef antes de qualquer chamada -- retry sempre tem o que reenviar', async () => {
  const page = await source('UniChatPage.jsx');
  const fnBody = page.slice(
    page.indexOf('async function handleUnresolvedMessage'),
    page.indexOf('function handleCancelAi'),
  );
  assert.match(fnBody, /lastUnresolvedRef\.current = \{ text, history \};/);
});

test('handleUnresolvedMessage marca AI_STATUS.LOADING so quando uniLlm.enabled, antes da chamada', async () => {
  const page = await source('UniChatPage.jsx');
  const fnBody = page.slice(
    page.indexOf('async function handleUnresolvedMessage'),
    page.indexOf('function handleCancelAi'),
  );
  assert.match(fnBody, /if \(uniLlm\.enabled\) \{\s*\n\s*setIsTyping\(true\);\s*\n\s*setAiStatus\(AI_STATUS\.LOADING\);/);
});

test('sucesso marca AI_STATUS.SUCCESS; falha real marca ERROR; cancelamento do usuario NUNCA marca ERROR (volta a UNAVAILABLE)', async () => {
  const page = await source('UniChatPage.jsx');
  const fnBody = page.slice(
    page.indexOf('async function handleUnresolvedMessage'),
    page.indexOf('function handleCancelAi'),
  );
  assert.match(
    fnBody,
    /if \(llmText\) \{\s*\n\s*setAiStatus\(AI_STATUS\.SUCCESS\);\s*\n\s*\} else if \(aiCancelledRef\.current\) \{\s*\n\s*setAiStatus\(AI_STATUS\.UNAVAILABLE\);\s*\n\s*\} else \{\s*\n\s*setAiStatus\(AI_STATUS\.ERROR\);\s*\n\s*\}/,
  );
  assert.match(fnBody, /aiCancelledRef\.current = false;/);
});

test('a mensagem final (sucesso ou fallback determinístico) sempre é enviada e persistida, mesmo apos cancelamento -- interface nunca trava sem resposta', async () => {
  const page = await source('UniChatPage.jsx');
  const fnBody = page.slice(
    page.indexOf('async function handleUnresolvedMessage'),
    page.indexOf('function handleCancelAi'),
  );
  const afterEnabledBlock = fnBody.slice(fnBody.lastIndexOf('aiCancelledRef.current = false;'));
  assert.match(afterEnabledBlock, /const assistantMsg = buildUniMessage\(llmText \|\| UNI_DETERMINISTIC_FALLBACK_TEXT\);/);
  assert.match(afterEnabledBlock, /pushMessage\(assistantMsg\);/);
  assert.match(afterEnabledBlock, /syncMessageToSupabase\(assistantMsg\);/);
});

test('handleCancelAi só age durante AI_STATUS.LOADING; marca aiCancelledRef ANTES de chamar uniLlm.cancel() (senao a corrida perderia o cancelamento)', async () => {
  const page = await source('UniChatPage.jsx');
  const fnBody = page.slice(
    page.indexOf('function handleCancelAi'),
    page.indexOf('function handleRetryAi'),
  );
  assert.match(fnBody, /if \(aiStatus !== AI_STATUS\.LOADING\) return;/);
  assert.match(fnBody, /aiCancelledRef\.current = true;\s*\n\s*uniLlm\.cancel\(\);/);
});

test('handleRetryAi reenvia exatamente a última pergunta não resolvida, bloqueado sem pendência ou durante nova digitação em andamento', async () => {
  const page = await source('UniChatPage.jsx');
  const fnBody = page.slice(
    page.indexOf('function handleRetryAi'),
    page.indexOf('function sendText'),
  );
  assert.match(fnBody, /if \(!pending \|\| isTyping\) return;/);
  assert.match(fnBody, /void handleUnresolvedMessage\(pending\.text, pending\.history\);/);
});

test('sendText reseta AI_STATUS e a pergunta pendente a cada novo envio -- nunca herda erro/retry de uma pergunta anterior', async () => {
  const page = await source('UniChatPage.jsx');
  const fnBody = page.slice(
    page.indexOf('function sendText'),
    page.indexOf('const userMsg = buildUserMessage'),
  );
  assert.match(fnBody, /setAiStatus\(AI_STATUS\.UNAVAILABLE\);/);
  assert.match(fnBody, /lastUnresolvedRef\.current = null;/);
});

test('envio vazio e envio duplicado (durante loading/confirmação) continuam bloqueados pelo mesmo guard existente', async () => {
  const page = await source('UniChatPage.jsx');
  assert.match(page, /if \(!text\.trim\(\) \|\| isTyping \|\| isConfirming\) return;/);
});

test('troca de conversa, novo chat, exclusão da conversa ativa e troca de workspace resetam AI_STATUS -- nenhum aviso de erro sobrevive à troca de contexto', async () => {
  const page = await source('UniChatPage.jsx');
  const occurrences = page.match(/setAiStatus\(AI_STATUS\.UNAVAILABLE\);\s*\n\s*lastUnresolvedRef\.current = null;/g) ?? [];
  // sendText + switchConversation + handleModeChange + handleNewChat +
  // handleDeleteConversation (ativa) + efeito de troca de workspace == 6.
  assert.equal(occurrences.length, 6);
});

test('botão cancelar só renderiza durante isTyping E AI_STATUS.LOADING -- nunca durante o "pensando" do fluxo determinístico', async () => {
  const page = await source('UniChatPage.jsx');
  assert.match(
    page,
    /\{aiStatus === AI_STATUS\.LOADING && \(\s*\n\s*<button\s*\n\s*type="button"\s*\n\s*className=\{styles\.cancelAiButton\}\s*\n\s*onClick=\{handleCancelAi\}/,
  );
});

test('ErrorState só renderiza fora de isTyping e com AI_STATUS.ERROR -- nunca sobreposto ao indicador de digitação', async () => {
  const page = await source('UniChatPage.jsx');
  assert.match(page, /\{!isTyping && aiStatus === AI_STATUS\.ERROR && \(/);
});

test('componente único para desktop e mobile (responsivo via CSS) -- sem fork condicional de UI como em DashboardPage', async () => {
  const page = await source('UniChatPage.jsx');
  assert.doesNotMatch(page, /useMobileViewport|isMobile/);
});

test('nenhum log de texto de mensagem/prompt no console -- só o(s) código(s) de erro, nunca dado sensível', async () => {
  const page = await source('UniChatPage.jsx');
  assert.doesNotMatch(page, /console\.(log|info|warn|error)\(/);
});

test('nenhum arquivo do escopo do Uni Chat importa OpenAI ou faz fetch/axios direto', async () => {
  const files = await Promise.all([
    source('UniChatPage.jsx'),
    source('mockData.js'),
    source('greeting.js'),
    source('uniContextCopy.js'),
    source('components/ChatInput.jsx'),
    source('components/EmptyState.jsx'),
    source('components/MessageBubble.jsx'),
  ]);
  const combined = files.join('\n');
  assert.doesNotMatch(combined, /openai/i);
  assert.doesNotMatch(combined, /fetch\(|axios/);
});

test('greeting.js e uniContextCopy.js são funções puras, sem React nem Supabase', async () => {
  const greeting = await source('greeting.js');
  const contextCopy = await source('uniContextCopy.js');
  assert.doesNotMatch(greeting, /from 'react'|supabase/i);
  assert.doesNotMatch(contextCopy, /from 'react'|supabase/i);
});
