import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// Extrai o corpo de UMA função a partir do índice do seu marcador (ex.:
// 'function handlePlanConversationInput(text) {'), por contagem de chaves
// consciente de strings/template literals/comentários -- nunca um recorte
// de tamanho fixo, que quebra sempre que a função ganha ou perde linhas.
// Usado pelos testes de handlePlanConversationInput (a função mais
// propensa a crescer neste arquivo, dado o número de regras do Bloco F).
function extractFunctionBody(text, marker) {
  const start = text.indexOf(marker);
  if (start === -1) return { start: -1, end: -1, body: '' };

  let index = start;
  let depth = 0;
  let sawOpenBrace = false;
  let inString = null; // "'" | '"' | '`' | null
  let inLineComment = false;
  let inBlockComment = false;

  while (index < text.length) {
    const char = text[index];
    const next = text[index + 1];

    if (inLineComment) {
      if (char === '\n') inLineComment = false;
      index += 1;
      continue;
    }
    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false;
        index += 2;
        continue;
      }
      index += 1;
      continue;
    }
    if (inString) {
      if (char === '\\') {
        index += 2;
        continue;
      }
      if (char === inString) inString = null;
      index += 1;
      continue;
    }

    if (char === '/' && next === '/') {
      inLineComment = true;
      index += 2;
      continue;
    }
    if (char === '/' && next === '*') {
      inBlockComment = true;
      index += 2;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      inString = char;
      index += 1;
      continue;
    }
    if (char === '{') {
      depth += 1;
      sawOpenBrace = true;
    } else if (char === '}') {
      depth -= 1;
      if (sawOpenBrace && depth === 0) {
        return { start, end: index + 1, body: text.slice(start, index + 1) };
      }
    }
    index += 1;
  }

  return { start, end: -1, body: text.slice(start) };
}

test('extractFunctionBody: acha o corpo inteiro por chaves, ignorando strings/comentários, imune ao tamanho da função', () => {
  const fixture = `function noise() { return '{'; }
function target(a) {
  // comentário com chave solta: {
  const s = "outra chave solta: }";
  const t = \`template com \${1 + 1} e chave solta: {\`;
  if (a) {
    return { ok: true };
  }
  return null;
}
function after() { return 1; }`;
  const { body, end } = extractFunctionBody(fixture, 'function target(a) {');
  assert.ok(end > -1);
  assert.match(body, /return \{ ok: true \};/);
  assert.doesNotMatch(body, /function after/);
  assert.equal(extractFunctionBody(fixture, 'function inexistente() {').end, -1);
});

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

test('dependência de conta usa Pending Action Stack e o saveAccount real do workspace', async () => {
  const page = await source('UniChatPage.jsx');
  assert.match(page, /startAccountCreationDependency\(/);
  assert.match(page, /create_financial_account: async \(\{ fields \}\) => saveAccountForDependency\(fields\.account\)/);
  assert.match(page, /findAccountCreationConflicts\(\{/);
  assert.match(page, /workspaceId: effectiveWorkspace\?\.id/);
  assert.match(page, /financialConversation\.provideInput\(\{\s*accountId: account\.id,\s*accountRecord: account,/);
  assert.match(page, /publishConversationResult\(resumedResult\)/);
});

test('criação de conta e movimentação têm confirmações separadas e cancelamento com escopo', async () => {
  const page = await source('UniChatPage.jsx');
  assert.match(page, /Posso criá-la para continuar a movimentação\?/);
  assert.match(page, /isCancelEntirePendingFlow\(text\)/);
  assert.match(page, /cancelAccountCreationDependency\(stack, \{ cascade \}\)/);
  assert.match(page, /Não criei a conta\. A movimentação continua preservada/);
  assert.match(page, /financialConversation\.confirm\(\)/);
});

test('categoria inexistente abre CREATE_CATEGORY e usa o contexto financeiro efetivo', async () => {
  const page = await source('UniChatPage.jsx');
  assert.match(page, /startCategoryCreationDependency\(\{/);
  assert.match(page, /create_financial_category: async \(\{ fields \}\) => saveCategoryForDependency\(\{/);
  assert.match(page, /\.\.\.fields\.category,\s*applies_to: financialWorkspaceType,/);
  assert.match(page, /resolvedInput\.kind === 'category_not_found'/);
  assert.match(page, /publishCategoryCreationConfirmation\(transition\.stack\)/);
  assert.match(
    page,
    /result\?\.action\?\.issues\?\.\[0\]\?\.code === 'category_not_found'[\s\S]{0,500}openCategoryCreationDependency\(\{/,
  );
});

test('categoria criada retoma a movimentação com ID real e preserva a pilha original', async () => {
  const page = await source('UniChatPage.jsx');
  assert.match(page, /completeCategoryCreationDependency\(/);
  assert.match(page, /financialConversation\.restore\(parentSnapshot\)/);
  assert.match(
    page,
    /financialConversation\.provideInput\(\{\s*categoryId: category\.id,\s*categoryRecord: category,/,
  );
  assert.match(page, /updateResumedFinancialSnapshot\(\s*dependencyOutcome\.stack,\s*resumedSnapshot,/);
  assert.match(page, /publishConversationResult\(resumedResult\)/);
});

test('categoria aproximada exige resposta explícita e rejeição volta ao esclarecimento', async () => {
  const page = await source('UniChatPage.jsx');
  assert.match(page, /categoryIssueCode === 'category_approximate'/);
  assert.match(page, /categoryApproved: true/);
  assert.match(page, /rejectedCategoryId: action\.proposedCategory\?\.id/);
  assert.match(page, /rejectedCategoryName: action\.proposedCategory\?\.name/);
  assert.match(page, /outra categoria/);
});

test('dependência de categoria pode ser cancelada sem perder a movimentação suspensa', async () => {
  const page = await source('UniChatPage.jsx');
  assert.match(page, /cancelCategoryCreationDependency\(stack, \{ cascade \}\)/);
  assert.match(page, /Não criei a categoria\. A movimentação continua preservada/);
  assert.match(page, /Cancelei a criação da categoria e a movimentação/);
});

test('experiência simplificada força contexto financeiro pessoal sem alterar o legado completo', async () => {
  const page = await source('UniChatPage.jsx');
  assert.match(page, /const isSimplifiedExperience = variant === 'simplified-home' \|\| variant === 'simplified'/);
  assert.match(page, /const effectiveWorkspace = isSimplifiedExperience/);
  assert.match(page, /simplifiedProduct\?\.workspace \?\? null/);
  assert.match(page, /workspaceContextType = isSimplifiedExperience\s*\? SIMPLIFIED_PRODUCT_MODE\s*: access\.currentWorkspace/);
  assert.match(page, /lockedMode: isSimplifiedExperience \? SIMPLIFIED_CHAT_MODE : null/);
  assert.match(page, /context: financialWorkspaceType/);
  assert.match(page, /workspaceType: financialWorkspaceType/);
});

test('useUniConversation injeta a categoria recém-criada antes do próximo render do hook', async () => {
  const conversation = await source('../uni-conversation/useUniConversation.js');
  assert.match(
    conversation,
    /categories: overrides\.categoryRecord\s*\?\s*\[\s*overrides\.categoryRecord,/,
  );
  assert.match(
    conversation,
    /categories\.filter\(\(category\) => category\.id !== overrides\.categoryRecord\.id\)/,
  );
});

// ============================================================================
// Integração com useUniLlm (D7) e fallback determinístico
// ============================================================================

test('UniChatPage consome useUniLlm e AI_STATUS do bloco consolidado', async () => {
  const page = await source('UniChatPage.jsx');
  assert.match(page, /import \{ useUniLlm, AI_STATUS, resolveConversationStyle \} from '\.\.\/uni-llm';/);
  assert.match(page, /const uniLlm = useUniLlm\(\);/);
});

test('conversationStyle vem do profile com fallback simple e chega ao LLM e ao fluxo determinístico', async () => {
  const page = await source('UniChatPage.jsx');
  assert.match(page, /const conversationStyle = resolveConversationStyle\(profile\?\.conversation_style\);/);
  assert.match(page, /generateContextualResponse\(\{[\s\S]{0,300}conversationStyle,/);
  assert.match(page, /buildQueryResponse\(queryType, financialContext, mode, \{[\s\S]{0,150}conversationStyle,/);
});

test('conversationStyle não altera a resolução independente do workspace pessoal ou empresarial', async () => {
  const page = await source('UniChatPage.jsx');
  assert.match(page, /const financialWorkspaceType = workspaceContextType;/);
  assert.doesNotMatch(page, /conversationStyle.*workspaceType|workspaceType.*conversationStyle/);
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
// BUG REAL EM PRODUÇÃO: "Coloquei duzentos reais de gasolina." caía no chat
// geral (handleUnresolvedMessage / modo SUPPORT) porque o verbo "coloquei"
// não era reconhecido por classifyIntent -- a resposta indevida "não consigo
// registrar daqui, mas posso te orientar..." vinha do prompt de SUPPORT_MODE,
// nunca deveria ser alcançada por uma frase de lançamento financeiro.
// looksLikeUnclassifiedFinancialStatement é a barreira determinística de
// última instância: intercepta ANTES de handleUnresolvedMessage.
// ============================================================================

test('BUG REAL: barreira determinística intercepta frase financeira não classificada ANTES de handleUnresolvedMessage', async () => {
  const page = await source('UniChatPage.jsx');
  assert.match(
    page,
    /import \{\s*\n(?:[^\n]*\n)*?\s*looksLikeUnclassifiedFinancialStatement,?\s*\n(?:[^\n]*\n)*?\} from '\.\.\/uni-conversation';/,
  );

  const resultBlock = page.slice(
    page.indexOf('const result = financialConversation.interpret(text);'),
    page.indexOf('if (result.action?.status'),
  );
  assert.match(resultBlock, /if \(!result\.handled\) \{/);

  const barrierIdx = resultBlock.indexOf('looksLikeUnclassifiedFinancialStatement(text)');
  const llmCallIdx = resultBlock.indexOf('void handleUnresolvedMessage(text, historySnapshot);');
  assert.ok(barrierIdx !== -1, 'looksLikeUnclassifiedFinancialStatement deve ser chamada dentro do bloco !result.handled');
  assert.ok(llmCallIdx !== -1, 'handleUnresolvedMessage deve continuar existindo como fallback final (nunca removido)');
  assert.ok(barrierIdx < llmCallIdx, 'a barreira financeira deve ser verificada ANTES da chamada ao chat geral');
});

test('BUG REAL: barreira financeira tenta attemptFinancialPlan (nunca uma resposta de incapacidade) e só então pede reformulação', async () => {
  const page = await source('UniChatPage.jsx');
  const resultBlock = page.slice(
    page.indexOf('const result = financialConversation.interpret(text);'),
    page.indexOf('if (result.action?.status'),
  );
  const barrierBlock = resultBlock.slice(
    resultBlock.indexOf('if (looksLikeUnclassifiedFinancialStatement(text)) {'),
    resultBlock.indexOf('void handleUnresolvedMessage(text, historySnapshot);'),
  );
  assert.match(barrierBlock, /const handled = await attemptFinancialPlan\(text\);/);
  assert.match(barrierBlock, /if \(handled\) return;/);
  assert.doesNotMatch(barrierBlock, /não consigo registrar/i);
  assert.doesNotMatch(barrierBlock, /não posso criar ou alterar/i);
  assert.doesNotMatch(barrierBlock, /posso te orientar/i);
});

test('nenhuma frase de incapacidade operacional ("não consigo registrar daqui" etc.) existe no fluxo determinístico de UniChatPage', async () => {
  const page = await source('UniChatPage.jsx');
  assert.doesNotMatch(page, /não consigo registrar/i);
  assert.doesNotMatch(page, /não posso criar ou alterar transaç/i);
  assert.doesNotMatch(page, /posso te orientar a lançar/i);
});

// ============================================================================
// Voz: entrada não sobrescreve texto existente; saída não bloqueia renderização
// ============================================================================

test('entrada por voz concatena, envia a transcrição e usa o workspace ativo', async () => {
  const chatInput = await source('components/ChatInput.jsx');
  const provider = await source('../uni-voice/UniVoiceInputProvider.jsx');
  assert.match(chatInput, /const next = current \? `\$\{current\} \$\{clean\}` : clean;/);
  assert.match(chatInput, /onSend\(next\);/);
  assert.match(chatInput, /onBeforeStart: onBeforeVoiceStart/);
  assert.match(provider, /workspaceId: workspace\?\.id/);
});

test('long press central inicia e encerra a captura no controlador compartilhado', async () => {
  const chatInput = await source('components/ChatInput.jsx');
  const centerButton = await source('../../layouts/mobile-app-shell/UniCenterButton.jsx');
  assert.match(centerButton, /void voiceInput\.start\(\);/);
  assert.match(centerButton, /voiceInput\.stop\(\);/);
  assert.match(centerButton, /voiceInput\.cancel\(\);/);
  assert.match(chatInput, /useSharedUniVoiceInput\(\)/);
  assert.doesNotMatch(centerButton, /startVoiceCapture: true/);
});

test('falha/ausência de suporte a voz mantém a digitação funcional (input sempre habilitado)', async () => {
  const chatInput = await source('components/ChatInput.jsx');
  assert.doesNotMatch(chatInput, /input[\s\S]{0,120}disabled=\{.*voice/i);
  assert.match(chatInput, /onChange=\{\(e\) => onChange\(e\.target\.value\)\}/);
});

test('saída por voz é opcional: MessageBubble renderiza o texto independentemente de voiceEnabled/onSpeakMessage', async () => {
  const bubble = await source('components/MessageBubble.jsx');
  assert.match(bubble, /voiceEnabled = false/);
  assert.match(bubble, /<p className=\{styles\.text\}>/);
  const showSpeakLine = bubble.match(/const showSpeak = .*/)?.[0] ?? '';
  assert.match(showSpeakLine, /voiceEnabled/);
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

test('sucesso marca AI_STATUS.SUCCESS; falha real marca ERROR; cancelamento do usuario NUNCA marca ERROR (marca CANCELLED, estado neutro proprio)', async () => {
  const page = await source('UniChatPage.jsx');
  const fnBody = page.slice(
    page.indexOf('async function handleUnresolvedMessage'),
    page.indexOf('function handleCancelAi'),
  );
  assert.match(
    fnBody,
    /if \(llmText\) \{\s*\n\s*setAiStatus\(AI_STATUS\.SUCCESS\);\s*\n\s*\} else if \(aiCancelledRef\.current\) \{[\s\S]*?setAiStatus\(AI_STATUS\.CANCELLED\);\s*\n\s*\} else \{\s*\n\s*setAiStatus\(AI_STATUS\.ERROR\);\s*\n\s*\}/,
  );
  assert.match(fnBody, /aiCancelledRef\.current = false;/);
});

test('CANCELLED nunca renderiza o mesmo banner vermelho de ERROR -- usa ErrorState variant="cancelled" (estado neutro)', async () => {
  const page = await source('UniChatPage.jsx');
  assert.match(page, /aiStatus === AI_STATUS\.CANCELLED[\s\S]{0,80}<ErrorState variant="cancelled" \/>/);
  assert.match(page, /aiStatus === AI_STATUS\.ERROR[\s\S]{0,80}<ErrorState onRetry=\{handleRetryAi\} \/>/);
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

test('envio vazio, loading e execução continuam bloqueados; confirmação textual permanece disponível', async () => {
  const page = await source('UniChatPage.jsx');
  assert.match(page, /if \(!text\.trim\(\) \|\| isTyping \|\| isExecutingAction\) return;/);
  assert.match(page, /classifyPendingActionReply\(text\)/);
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

// ============================================================================
// ELEVEN2 -- integração da voz nas respostas do chat: fundação geral
// (uni-voice-tts) substitui o uso da infra de demo (uni-voice-output) NESTE
// ponto, sem duplicar player/estado; interrupção em todos os pontos de
// troca de contexto; texto e voz permanecem camadas independentes.
// ============================================================================

test('UniChatPage usa exclusivamente useUniVoiceTts/useVoicePreference/VOICE_TTS_STATUS + buildSpeechText/MAX_TTS_TEXT_LENGTH (BLOCO VOZ 1) -- não importa mais useUniVoiceOutput', async () => {
  const page = await source('UniChatPage.jsx');
  assert.match(page, /import \{\s*\n\s*useUniVoiceTts, useVoicePreference, VOICE_TTS_STATUS, MAX_TTS_TEXT_LENGTH, buildSpeechText,\s*\n\s*\} from '\.\.\/uni-voice-tts';/);
  // O comentario de cabecalho pode CITAR o hook antigo por contexto
  // arquitetural; o que nao pode existir e um import real dele.
  assert.doesNotMatch(page, /from '\.\.\/uni-voice-output'/);
  assert.doesNotMatch(page, /\buseUniVoiceOutput\(/);
});

test('handleSpeakMessage marca a mensagem ativa ANTES de chamar speak() com a versão curta (buildSpeechText + MAX_TTS_TEXT_LENGTH) -- MessageBubble já reflete loading no primeiro render', async () => {
  const page = await source('UniChatPage.jsx');
  const fnBody = page.slice(
    page.indexOf('const handleSpeakMessage = useCallback'),
    page.indexOf('const handlePauseResumeVoice'),
  );
  assert.match(fnBody, /if \(!message\?\.text\) return;/);
  assert.match(fnBody, /setVoiceMessageId\(message\.id\);/);
  // BLOCO VOZ 1: a voz usa SEMPRE a versão curta (buildSpeechText), mesmo
  // para textos acima de MAX_TTS_TEXT_LENGTH -- o texto completo exibido
  // (message.text no MessageBubble) nunca é alterado.
  assert.match(fnBody, /void uniVoice\.speak\(buildSpeechText\(message\.text, MAX_TTS_TEXT_LENGTH\)\);/);
  const setIdx = fnBody.indexOf('setVoiceMessageId(message.id);');
  const speakIdx = fnBody.indexOf('void uniVoice.speak(');
  assert.ok(setIdx >= 0 && speakIdx > setIdx, 'a mensagem ativa deve ser marcada antes de iniciar a geração');
});

test('handlePauseResumeVoice alterna pause/resume conforme o status atual do hook compartilhado', async () => {
  const page = await source('UniChatPage.jsx');
  const fnBody = page.slice(
    page.indexOf('const handlePauseResumeVoice = useCallback'),
    page.indexOf('const handleStopVoice'),
  );
  assert.match(fnBody, /if \(uniVoice\.status === VOICE_TTS_STATUS\.PLAYING\) \{\s*\n\s*uniVoice\.pause\(\);/);
  assert.match(fnBody, /\} else if \(uniVoice\.status === VOICE_TTS_STATUS\.PAUSED\) \{\s*\n\s*uniVoice\.resume\(\);/);
});

test('apenas uma instância de useUniVoiceTts para todo o chat -- "apenas um áudio ativo" vem do próprio provider (ELEVEN1), sem duplicar estado por mensagem', async () => {
  const page = await source('UniChatPage.jsx');
  const occurrences = page.match(/useUniVoiceTts\(\)/g) ?? [];
  assert.equal(occurrences.length, 1);
});

test('trocar de conversa, novo chat, trocar modo/workspace e excluir a conversa ativa sempre interrompem o áudio (uniVoice.stop + reset da mensagem ativa)', async () => {
  const page = await source('UniChatPage.jsx');
  const occurrences = page.match(/uniVoice\.stop\(\);\s*\n\s*(?:\/\/[^\n]*\n\s*)?setVoiceMessageId\(null\);/g) ?? [];
  // switchConversation + handleNewChat + efeito de troca de workspace +
  // Os cinco resets de contexto anteriores permanecem, e iniciar captura
  // também interrompe o TTS antes de abrir o microfone.
  assert.equal(occurrences.length, 6);
});

test('escritas do chat usam a RPC atômica e allowlist restrita a receita/despesa', async () => {
  const page = await source('UniChatPage.jsx');
  assert.match(page, /import \{ executeConfirmedFinancialAction \}/);
  assert.match(page, /executeAtomicAction: executeConfirmedFinancialAction/);
  assert.match(page, /ALLOWED_CHAT_WRITE_INTENTS = Object\.freeze\(\['register_income', 'register_expense'\]\)/);
  // BLOCO E: transferência não é mais um bloqueio estático -- primeiro
  // tenta a camada neural (financial_plan); só cai no aviso de "ainda não
  // suportado" se ela não devolver um plano válido. create_goal continua
  // bloqueado estaticamente (fora do escopo do Bloco E).
  assert.match(page, /isUnsupportedIntentEligibleForPlan\(result\.parsed\?\.intent\)/);
  assert.match(page, /result\.parsed\?\.intent === 'create_goal'/);
});

test('ação pendente é isolada por usuário, workspace e conversa, com restauração e limpeza', async () => {
  const page = await source('UniChatPage.jsx');
  assert.match(page, /userId: user\?\.id/);
  assert.match(page, /workspaceId: effectiveWorkspace\?\.id/);
  assert.match(page, /conversationId: activeId/);
  assert.match(page, /loadPendingAction\(pendingActionIdentity\)/);
  assert.match(page, /savePendingAction\(pendingActionIdentity/);
  assert.match(page, /clearCurrentPendingAction\(\)/);
});

test('resposta de conta pendente usa o workspace atual e não repete indefinidamente a mesma pergunta', async () => {
  const page = await source('UniChatPage.jsx');
  const block = page.slice(
    page.indexOf('const resolvedInput = resolvePendingActionInput'),
    page.indexOf('if (pendingAction) {', page.indexOf('const resolvedInput = resolvePendingActionInput')),
  );
  assert.match(block, /workspaceId: effectiveWorkspace\?\.id/);
  assert.match(block, /resolvedInput\.kind === 'ambiguous_account'/);
  assert.match(block, /resolvedInput\.kind === 'account_not_found'/);
  assert.match(block, /Não encontrei essa conta no Espaço/);
  assert.doesNotMatch(block, /Em qual conta você fez esse pagamento/);
});

test('resumo de confirmação mostra o espaço PF/PJ e nunca aceita texto livre como execução', async () => {
  const adapter = await source('uniChatAdapter.js');
  const page = await source('UniChatPage.jsx');
  assert.match(adapter, /label: 'Espaço'/);
  assert.match(adapter, /workspaceType === 'business' \? 'Empresa' : 'Pessoal'/);
  assert.match(page, /replyType === 'confirm'/);
  assert.match(page, /resolvedInput\.kind !== 'correction'/);
});

test('MessageBubble recebe o estado compartilhado de voz e sabe se É a mensagem ativa (isActiveVoiceMessage)', async () => {
  const page = await source('UniChatPage.jsx');
  assert.match(page, /voiceEnabled=\{voicePreference\.enabled\}/);
  assert.match(page, /voiceStatus=\{uniVoice\.status\}/);
  assert.match(page, /voiceError=\{uniVoice\.error\}/);
  assert.match(page, /isActiveVoiceMessage=\{voiceMessageId === message\.id\}/);
  assert.match(page, /onSpeakMessage=\{handleSpeakMessage\}/);
  assert.match(page, /onPauseResumeVoice=\{handlePauseResumeVoice\}/);
  assert.match(page, /onStopVoice=\{handleStopVoice\}/);
});

test('preferência desabilitada oculta o controle (voiceEnabled=false vira showSpeak=false em MessageBubble) -- sem prop adicional de "forçar parar"', async () => {
  const page = await source('UniChatPage.jsx');
  assert.match(page, /const voicePreference = useVoicePreference\(\);/);
});

test('falha de voz (ERROR) nunca mexe em messages/persistência -- texto e voz são camadas independentes', async () => {
  const page = await source('UniChatPage.jsx');
  const fnBody = page.slice(
    page.indexOf('const handleSpeakMessage = useCallback'),
    page.indexOf('// BLOCO VOZ 1: ponto ÚNICO para narrar'),
  );
  assert.doesNotMatch(fnBody, /setMessages|pushMessage|syncMessageToSupabase/);
});

// BLOCO UNI 2: a AUSÊNCIA de autoplay era exatamente a causa raiz da
// regressão relatada -- a boas-vindas falava (efeito próprio e dedicado em
// SimplifiedHomeView.jsx), mas nenhuma resposta normal da Uni tinha
// qualquer caminho de reprodução automática, manual ou não, na Home. Este
// teste passa a EXIGIR autoplay controlado (Home/`/app/uni`, respeitando
// voicePreference e um limite de tamanho), nunca a sua ausência.
test('BLOCO VOZ 1: existem EXATAMENTE dois pontos diretos de uniVoice.speak (handleSpeakMessage e speakSideEffectNotice) -- o autoplay e a narração de erro passam por eles, nunca falam por fora', async () => {
  const page = await source('UniChatPage.jsx');
  const occurrences = page.match(/uniVoice\.speak\(/g) ?? [];
  assert.equal(occurrences.length, 2, 'uniVoice.speak deve ter exatamente dois pontos de chamada diretos: handleSpeakMessage (mensagens) e speakSideEffectNotice (avisos de efeito colateral, via reportConfirmationError). O autoplay chama handleSpeakMessage(), nunca uniVoice.speak() diretamente');
  // A ÚNICA chamada direta de handleSpeakMessage(...) deve ser a do efeito
  // de autoplay -- os outros pontos de disparo (MessageBubble, o fallback
  // manual em SimplifiedHomeView) só RECEBEM a referência via prop
  // onSpeakMessage={handleSpeakMessage}, nunca chamam a função eles mesmos.
  const directCalls = page.match(/handleSpeakMessage\(lastMessage\);/g) ?? [];
  assert.equal(directCalls.length, 1, 'esperava exatamente uma chamada direta -- handleSpeakMessage(lastMessage) no efeito de autoplay');
  assert.match(page, /onSpeakMessage=\{handleSpeakMessage\}/, 'MessageBubble deveria continuar recebendo handleSpeakMessage por prop (disparo manual)');
  // speakSideEffectNotice só pode ser chamada pelo ponto central
  // reportConfirmationError -- nenhuma chamada solta/aleatória pelo arquivo.
  assert.match(page, /speakSideEffectNotice\(errorText\);/);
  const sideEffectCalls = page.match(/speakSideEffectNotice\(/g) ?? [];
  assert.equal(sideEffectCalls.length, 1, 'speakSideEffectNotice deve ter exatamente um ponto de chamada: dentro de reportConfirmationError');
});

test('BLOCO VOZ 1: efeito de autoplay existe, é gated por isSimplifiedExperience + voicePreference.enabled, nunca fala a mesma mensagem duas vezes (registro de sessão) e NÃO tem gate de tamanho (resposta longa também fala via versão curta)', async () => {
  const page = await source('UniChatPage.jsx');
  const idx = page.indexOf('reprodução automática da resposta ATUAL da');
  assert.ok(idx > -1, 'esperava o efeito de autoplay documentado no arquivo');
  const block = page.slice(idx, page.indexOf('useEffect(() => {\n    if (!activeId) return;', idx));
  assert.match(block, /if \(!isSimplifiedExperience \|\| !voicePreference\.enabled\) return;/);
  assert.match(block, /const lastMessage = messages\.at\(-1\);/);
  assert.match(block, /if \(!lastMessage \|\| lastMessage\.from !== 'uni' \|\| !lastMessage\.text\) return;/);
  assert.match(block, /if \(hasAutoSpokenMessage\(user\?\.id, lastMessage\.id\)\) return;/);
  assert.match(block, /markAutoSpokenMessage\(user\?\.id, lastMessage\.id\);/);
  // BLOCO VOZ 1: o antigo gate `lastMessage.text.length > AUTO_SPEAK_MAX_LENGTH`
  // foi REMOVIDO -- qualquer resposta final (curta ou longa) fala; o corte
  // para voz acontece dentro de handleSpeakMessage (buildSpeechText), nunca
  // aqui.
  assert.doesNotMatch(block, /AUTO_SPEAK_MAX_LENGTH|lastMessage\.text\.length/);
  assert.match(block, /handleSpeakMessage\(lastMessage\);/);
});

test('BLOCO UNI 2: o efeito de autoplay NUNCA retorna uma função de limpeza (cleanup) -- evita que o cleanup de uma mensagem antiga interrompa a fala de uma mensagem nova que já começou', async () => {
  const page = await source('UniChatPage.jsx');
  const idx = page.indexOf('reprodução automática da resposta ATUAL da');
  const startEffect = page.indexOf('useEffect(() => {', idx);
  const endEffect = page.indexOf('}, [messages, isSimplifiedExperience, voicePreference.enabled, handleSpeakMessage, user?.id, historyHydrated]);', startEffect);
  assert.ok(startEffect > -1 && endEffect > startEffect);
  const effectBody = page.slice(startEffect, endEffect);
  assert.doesNotMatch(effectBody, /return \(\) =>/, 'o efeito de autoplay não deveria ter cleanup');
});

// ============================================================================
// BLOCO VOZ 1 -- confiabilidade e latência da voz da Uni (conclusão):
// toda mensagem final relevante fala (curta ou longa), avisos de erro de
// confirmação são narrados pelo ponto central reportConfirmationError,
// estados intermediários nunca falam e falha de TTS nunca quebra a UI.
// ============================================================================

test('BLOCO VOZ 1: resposta curta E resposta longa falam -- o autoplay não filtra por tamanho (curta) nem conteúdo (longa usa versão curta no TTS)', async () => {
  const page = await source('UniChatPage.jsx');
  const idx = page.indexOf('reprodução automática da resposta ATUAL da');
  const block = page.slice(idx, page.indexOf('useEffect(() => {\n    if (!activeId) return;', idx));
  // Qualquer mensagem da Uni com texto (curta, pergunta, confirmação,
  // sucesso ou resposta longa) é candidata -- sem gate de tamanho e sem
  // filtro por tipo/conteúdo.
  assert.doesNotMatch(block, /lastMessage\.text\.length|lastMessage\.type|lastMessage\.confirmation|lastMessage\.highlight/);
  assert.match(block, /handleSpeakMessage\(lastMessage\);/);
  // A versão curta para voz (buildSpeechText) é aplicada dentro de
  // handleSpeakMessage, nunca no efeito nem no texto visível.
  assert.match(page, /void uniVoice\.speak\(buildSpeechText\(message\.text, MAX_TTS_TEXT_LENGTH\)\);/);
  assert.match(page, /buildSpeechText\(text, MAX_TTS_TEXT_LENGTH\)/);
});

test('BLOCO VOZ 1: pergunta, pedido de confirmação e sucesso entram no MESMO autoplay -- nenhum caminho de push de mensagem chama speak diretamente (sem duplicação)', async () => {
  const page = await source('UniChatPage.jsx');
  const occurrences = page.match(/uniVoice\.speak\(/g) ?? [];
  assert.equal(occurrences.length, 2, 'toda fala de mensagem passa por handleSpeakMessage; nenhum fluxo de pushMessage (pergunta/confirmação/sucesso) fala por fora');
  assert.equal((page.match(/pushMessage\(assistantMsg\);/g) ?? []).length >= 8, true, 'os fluxos que empurram mensagens da Uni continuam intactos');
});

test('BLOCO VOZ 1: estado intermediário NUNCA fala -- loading/digitação/transcrição não têm nenhuma chamada de voz no caminho de envio', async () => {
  const page = await source('UniChatPage.jsx');
  // Nenhuma fala dentro de sendText/handleUnresolvedMessage (loading,
  // isTyping, transcrição) -- só o efeito de autoplay observa messages.
  const sendTextBlock = page.slice(
    page.indexOf('function sendText(text) {'),
    page.indexOf('function handleSuggestionSelect'),
  );
  assert.doesNotMatch(sendTextBlock, /uniVoice\.speak|speakSideEffectNotice/);
  // Mensagem do USUÁRIO nunca fala: o efeito exige from === 'uni'.
  const idx = page.indexOf('reprodução automática da resposta ATUAL da');
  const block = page.slice(idx, page.indexOf('useEffect(() => {\n    if (!activeId) return;', idx));
  assert.match(block, /lastMessage\.from !== 'uni'/);
});

test('BLOCO VOZ 1: erro relevante ao usuário fala -- os 5 pontos de erro de handleConfirmAction passam pelo ponto central reportConfirmationError, que narra uma única vez', async () => {
  const page = await source('UniChatPage.jsx');
  // Ponto central: registra o erro (executionError + confirmationError) e
  // narra via speakSideEffectNotice -- um único lugar, sem chamadas soltas.
  assert.match(page, /function reportConfirmationError\(id, errorText\) \{/);
  assert.match(page, /setExecutionError\(errorText\);/);
  assert.match(page, /speakSideEffectNotice\(errorText\);/);
  // Exatamente os 5 caminhos de erro de handleConfirmAction usam o ponto
  // central (conta semelhante, falha de criação de conta, falha de criação
  // de categoria, falha de confirmação e catch inesperado) -- a definição
  // da função é excluída contando só chamadas que terminam em ';'.
  const callSites = page.match(/reportConfirmationError\(id, [^)]*\);/g) ?? [];
  assert.equal(callSites.length, 5, 'esperava 5 pontos de erro de confirmação usando reportConfirmationError');
  // Nenhum setExecutionError fora do ponto central (sem duplicação de
  // registro/narração) -- só o reset neutro (null) continua nos fluxos.
  assert.equal((page.match(/setExecutionError\(errorText\);/g) ?? []).length, 1);
  assert.equal((page.match(/setExecutionError\(null\);/g) ?? []).length, 11);
});

test('BLOCO VOZ 1: narração de erro é gated pela experiência simplificada + preferência de voz -- chat completo permanece manual', async () => {
  const page = await source('UniChatPage.jsx');
  const fnBody = page.slice(
    page.indexOf('const speakSideEffectNotice = useCallback'),
    page.indexOf('function reportConfirmationError'),
  );
  assert.match(fnBody, /if \(!isSimplifiedExperience \|\| !voicePreference\.enabled\) return;/);
  assert.match(fnBody, /if \(!text\) return;/);
});

test('BLOCO VOZ 1: falha do TTS nunca quebra a interface -- speak é fire-and-forget (void) nos dois pontos e não há try/catch em torno dele', async () => {
  const page = await source('UniChatPage.jsx');
  const handleSpeakBlock = page.slice(
    page.indexOf('const handleSpeakMessage = useCallback'),
    page.indexOf('// BLOCO VOZ 1: ponto ÚNICO para narrar'),
  );
  assert.match(handleSpeakBlock, /void uniVoice\.speak\(buildSpeechText/);
  assert.doesNotMatch(handleSpeakBlock, /try|catch/);
  const sideEffectBlock = page.slice(
    page.indexOf('const speakSideEffectNotice = useCallback'),
    page.indexOf('function reportConfirmationError'),
  );
  assert.match(sideEffectBlock, /void uniVoice\.speak\(buildSpeechText/);
  assert.doesNotMatch(sideEffectBlock, /try|catch/);
});

test('BLOCO VOZ 1: mensagens duplicadas falam uma única vez -- o registro de sessão (spokenMessageSession) é o ÚNICO guarda do autoplay e fica no efeito (nunca em handleSpeakMessage)', async () => {
  const page = await source('UniChatPage.jsx');
  assert.equal((page.match(/if \(hasAutoSpokenMessage\(user\?\.id, lastMessage\.id\)\) return;/g) ?? []).length, 1);
  assert.equal((page.match(/markAutoSpokenMessage\(user\?\.id, lastMessage\.id\);/g) ?? []).length, 1);
  const handleSpeakBlock = page.slice(
    page.indexOf('const handleSpeakMessage = useCallback'),
    page.indexOf('const handlePauseResumeVoice'),
  );
  assert.doesNotMatch(handleSpeakBlock, /hasAutoSpokenMessage|markAutoSpokenMessage|spokenMessageSession/, 'o guarda de duplicação vive apenas no efeito de autoplay');
  // O provider de TTS encerra o áudio anterior antes de cada speak() -- um
  // novo autoplay sempre interrompe o anterior, nunca empilha voz.
  const provider = await source('../uni-voice-tts/elevenLabsTtsProvider.js');
  assert.match(provider, /async function speak\(text, \{ onPlaying, onEnded, onError \} = \{\}\) \{\s*\n\s*stop\(\);/);
});

test('BLOCO VOZ 1: o autoplay usa o registro persistente por sessão (spokenMessageSession.js) chaveado por user.id -- nunca um useRef local (o ref morria no unmount ao trocar de rota e refazia a narração do histórico restaurado)', async () => {
  const page = await source('UniChatPage.jsx');
  assert.match(
    page,
    /import \{\s*\n\s*hasAutoSpokenMessage,\s*\n\s*markAutoSpokenMessage,\s*\n\s*markRestoredMessagesAsSpoken,\s*\n\s*\} from '\.\.\/uni-voice-tts\/spokenMessageSession\.js';/,
  );
  assert.doesNotMatch(page, /autoSpokenMessageIdRef/);
  const idx = page.indexOf('reprodução automática da resposta ATUAL da');
  const block = page.slice(idx, page.indexOf('useEffect(() => {\n    if (!activeId) return;', idx));
  // A deduplicação é chaveada pelo usuário autenticado -- o usuário A nunca
  // compartilha narração com o usuário B, e o registro sobrevive a
  // unmount/remount e troca de rota (Home → Registros/Conta/Uni → Home).
  assert.match(block, /if \(hasAutoSpokenMessage\(user\?\.id, lastMessage\.id\)\) return;/);
  assert.match(block, /markAutoSpokenMessage\(user\?\.id, lastMessage\.id\);/);
  assert.match(block, /user\?\.id/);
});

test('BLOCO VOZ 1: Strict Mode não duplica -- a marcação no registro acontece ANTES da narração, então o segundo mount do efeito vê o ID já registrado', async () => {
  const page = await source('UniChatPage.jsx');
  const idx = page.indexOf('reprodução automática da resposta ATUAL da');
  const block = page.slice(idx, page.indexOf('useEffect(() => {\n    if (!activeId) return;', idx));
  const markIdx = block.indexOf('markAutoSpokenMessage(user?.id, lastMessage.id);');
  const speakIdx = block.indexOf('handleSpeakMessage(lastMessage);');
  assert.ok(markIdx > -1 && speakIdx > markIdx, 'a marcação deve acontecer ANTES da narração -- o re-mount (Strict Mode ou remount real) bloqueia a repetição');
});

test('BLOCO VOZ 1: o botão manual "Ouvir" não consulta o registro de autoplay -- continua funcionando mesmo depois do autoplay já ter narrado a mesma mensagem', async () => {
  const page = await source('UniChatPage.jsx');
  const handleSpeakBlock = page.slice(
    page.indexOf('const handleSpeakMessage = useCallback'),
    page.indexOf('// BLOCO VOZ 1: ponto ÚNICO para narrar'),
  );
  assert.doesNotMatch(handleSpeakBlock, /hasAutoSpokenMessage|markAutoSpokenMessage|spokenMessageSession/, 'o disparo manual passa direto pelo registro -- nunca bloqueado pelo autoplay');
  assert.match(handleSpeakBlock, /void uniVoice\.speak\(buildSpeechText\(message\.text, MAX_TTS_TEXT_LENGTH\)\);/);
  assert.match(page, /onSpeakMessage=\{handleSpeakMessage\}/);
});

// ============================================================================
// BLOCO VOZ HIDRATAÇÃO (reload/login): o autoplay só pode narrar mensagens
// criadas DEPOIS de (1) a sessão carregar, (2) o histórico inicial terminar
// de ser restaurado e (3) a saudação terminar ou falhar. Mensagens
// restauradas são conteúdo antigo -- nunca eventos novos. Sem timeout.
// ============================================================================

test('BLOCO VOZ HIDRATAÇÃO: o autoplay é gated pelo marco historyHydrated (autoplayArmed) e re-dispara quando o marco muda', async () => {
  const page = await source('UniChatPage.jsx');
  const idx = page.indexOf('reprodução automática da resposta ATUAL da');
  const block = page.slice(idx, page.indexOf('useEffect(() => {\n    if (!activeId) return;', idx));
  assert.match(block, /if \(!historyHydrated\) return;/);
  assert.match(block, /\}, \[messages, isSimplifiedExperience, voicePreference\.enabled, handleSpeakMessage, user\?\.id, historyHydrated\]\);/);
});

test('BLOCO VOZ HIDRATAÇÃO: maybeArmAutoplay é o ÚNICO ponto que arma o autoplay -- snapshot marca o histórico restaurado como já narrado ANTES de habilitar, e nunca usa timeout', async () => {
  const page = await source('UniChatPage.jsx');
  const idx = page.indexOf('const maybeArmAutoplay = useCallback');
  assert.ok(idx > -1, 'esperava maybeArmAutoplay definido');
  const block = page.slice(idx, page.indexOf('const handleWelcomeVoiceSettled = useCallback', idx));
  // Guardas determinísticas da hidratação: marco já armado, restaurações
  // em voo, sessão ainda não carregada e saudação pendente.
  assert.match(block, /if \(historyHydratedRef\.current\) return;/);
  assert.match(block, /if \(pendingRestoresRef\.current > 0\) return;/);
  assert.match(block, /if \(isSupabaseConfigured && !user\?\.id\) return;/);
  assert.match(block, /if \(isWelcomeVoicePending\(buildWelcomeSessionKey\(user, session\)\)\) return;/);
  // Snapshot: marcar o histórico restaurado como já narrado ANTES de armar.
  const markIdx = block.indexOf('markRestoredMessagesAsSpoken(user?.id, messages);');
  const armIdx = block.indexOf('setHistoryHydrated(true);');
  assert.ok(markIdx > -1 && armIdx > markIdx, 'o snapshot (marcar restauradas) deve acontecer ANTES de armar o autoplay');
  assert.doesNotMatch(block, /setTimeout|setInterval/, 'a correção é determinística -- nunca timeout arbitrário');
});

test('BLOCO VOZ HIDRATAÇÃO: restauração inicial do Supabase marca o histórico carregado como já narrado e controla pendingRestoresRef', async () => {
  const page = await source('UniChatPage.jsx');
  const idx = page.indexOf('useEffect(() => {\n    if (!activeId) return;\n    const current = conversations.find');
  assert.ok(idx > -1, 'esperava o efeito de restauração inicial');
  const block = page.slice(idx, page.indexOf('const pendingSyncRef = useRef([]);', idx));
  assert.match(block, /pendingRestoresRef\.current \+= 1;/);
  assert.match(block, /pendingRestoresRef\.current -= 1;/);
  assert.match(block, /markRestoredMessagesAsSpoken\(user\?\.id, loadedMessages\);/);
});

test('BLOCO VOZ HIDRATAÇÃO: switchConversation marca mensagens restauradas como já narradas -- trocar de conversa (Histórico/reconcile) nunca fala', async () => {
  const page = await source('UniChatPage.jsx');
  const idx = page.indexOf('function switchConversation(id) {');
  assert.ok(idx > -1);
  const block = page.slice(idx, page.indexOf('async function handleUnresolvedMessage', idx));
  assert.match(block, /markRestoredMessagesAsSpoken\(user\?\.id, conv\.messages \|\| \[\]\);/);
  assert.match(block, /pendingRestoresRef\.current \+= 1;/);
  assert.match(block, /markRestoredMessagesAsSpoken\(user\?\.id, loadedMessages\);/);
});

test('BLOCO VOZ HIDRATAÇÃO: a saudação tem prioridade exclusiva -- UniChatPage passa onWelcomeVoiceSettled e SimplifiedHomeView libera o autoplay no finally (sucesso ou falha)', async () => {
  const page = await source('UniChatPage.jsx');
  assert.match(page, /const handleWelcomeVoiceSettled = useCallback/);
  assert.match(page, /onWelcomeVoiceSettled=\{handleWelcomeVoiceSettled\}/);
  const home = await source('../simplified-app/SimplifiedHomeView.jsx');
  assert.match(home, /onWelcomeVoiceSettled,/);
  assert.match(home, /\.finally\(\(\) => \{\s*\n\s*onWelcomeVoiceSettled\?\.\(\);\s*\n\s*\}\);/);
});

test('BLOCO VOZ HIDRATAÇÃO: mensagem nova depois da hidratação continua falando -- o snapshot marca SÓ o que estava restaurado, e o registro por ID preserva a narração única', async () => {
  const page = await source('UniChatPage.jsx');
  // O autoplay segue observando messages.at(-1) e falando o que NÃO está
  // marcado no registro (mensagens novas); o snapshot marca apenas o
  // histórico presente no armamento.
  const idx = page.indexOf('reprodução automática da resposta ATUAL da');
  const block = page.slice(idx, page.indexOf('useEffect(() => {\n    if (!activeId) return;', idx));
  assert.match(block, /const lastMessage = messages\.at\(-1\);/);
  assert.match(block, /if \(hasAutoSpokenMessage\(user\?\.id, lastMessage\.id\)\) return;/);
  assert.match(block, /markAutoSpokenMessage\(user\?\.id, lastMessage\.id\);/);
  const snapshot = page.slice(
    page.indexOf('const maybeArmAutoplay = useCallback'),
    page.indexOf('const handleWelcomeVoiceSettled = useCallback'),
  );
  assert.match(snapshot, /markRestoredMessagesAsSpoken\(user\?\.id, messages\);/);
});

test('nenhum fetch/chamada direta à ElevenLabs em UniChatPage -- tudo passa por uniVoice (hook)', async () => {
  const page = await source('UniChatPage.jsx');
  assert.doesNotMatch(page, /ELEVENLABS|elevenlabs\.io|xi-api-key/i);
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

// ============================================================================
// BLOCO E -- wiring híbrido do Plano Financeiro (financial_plan) em
// UniChatPage: parser determinístico tenta primeiro; frases complexas/
// multioperação/transferência tentam a camada neural; corrigir/confirmar/
// cancelar reaproveitam o mesmo texto livre já usado pela pendência de
// uma única operação; persistência continua uma operação por vez pelo
// RPC atômico já existente.
// ============================================================================

test('BLOCO E: financialPlanService usa a MESMA Edge Function/flag do chat, sem novo secret', async () => {
  const page = await source('UniChatPage.jsx');
  assert.match(page, /import \{ createFinancialPlanService \} from '\.\.\/uni-financial-plan\/index\.js';/);
  assert.match(
    page,
    /createFinancialPlanService\(\{\s*supabase,\s*supabaseUrl,\s*supabaseAnonKey,\s*enabled: uniLlm\.enabled,\s*\}\)/,
  );
});

test('BLOCO E: heurística determinística tenta o plano neural ANTES do parser de uma única operação para texto complexo', async () => {
  const page = await source('UniChatPage.jsx');
  assert.match(page, /import \{[\s\S]*?looksLikeComplexFinancialText[\s\S]*?\} from '\.\.\/uni-conversation';/);
  const sendTextIdx = page.indexOf('function sendText(text) {');
  const runDeterministicIdx = page.indexOf('runDeterministicFinancialFlow(text, historySnapshot);', sendTextIdx);
  assert.ok(sendTextIdx > -1 && runDeterministicIdx > -1);
  const slice = page.slice(sendTextIdx, runDeterministicIdx);
  assert.match(slice, /if \(looksLikeComplexFinancialText\(text\)\) \{/);
  assert.match(slice, /const handled = await attemptFinancialPlan\(text\);/);
});

test('BLOCO E: transferência tenta o plano neural antes do aviso estático de "não suportado"', async () => {
  const page = await source('UniChatPage.jsx');
  const idx = page.indexOf('if (isUnsupportedIntentEligibleForPlan(result.parsed?.intent)) {');
  assert.ok(idx > -1);
  const slice = page.slice(idx, idx + 500);
  assert.match(slice, /const handled = await attemptFinancialPlan\(text\);/);
  assert.match(slice, /if \(handled\) return;/);
  assert.match(slice, /Transferências ainda não podem ser registradas pela Uni\./);
});

test('BLOCO E: sem plano válido (não suportado/erro/timeout/fora do contrato), o fluxo determinístico atual é preservado', async () => {
  const page = await source('UniChatPage.jsx');
  assert.match(page, /if \(!plan\) return false;/);
});

test('BLOCO E: pendência de plano ativo entra no MESMO gate de hasPendingConversation e é roteada antes do fluxo padrão', async () => {
  const page = await source('UniChatPage.jsx');
  assert.match(page, /\|\| isFinancialPlanActive\(\),\s*\);/);
  const idx = page.indexOf('function handlePendingConversationInput(text, userMsg) {');
  const slice = page.slice(idx, idx + 300);
  assert.match(slice, /if \(isFinancialPlanActive\(\)\) \{/);
  assert.match(slice, /return handlePlanConversationInput\(text\);/);
});

// ============================================================================
// BUG REAL (achado em validação manual do fechamento do MVP de voz): dizer
// "cancelar" enquanto a Uni ainda espera um campo obrigatório (ex.: "Em qual
// conta você fez esse pagamento?") era interpretado como o VALOR do campo --
// literalmente propondo criar uma conta chamada "cancelar". Isso acontecia
// porque pendingAction só é setado quando a ação já está 'ready' (ver
// publishConversationResult), então classifyPendingActionReply nunca era
// chamado nesse meio-tempo. Corrigido classificando sempre e adicionando um
// cancelamento explícito para esse caso (fora de conta/categoria, que já tem
// seu próprio fluxo de dependência/rejeição).
// ============================================================================

test('BUG REAL: "cancelar" durante o esclarecimento de um campo (sem card de confirmação ainda) encerra o lançamento, nunca é tratado como valor do campo', async () => {
  const page = await source('UniChatPage.jsx');
  const { body: fnBody, end } = extractFunctionBody(page, 'function handlePendingConversationInput(text, userMsg) {');
  assert.ok(end > -1, 'não foi possível localizar o corpo completo de handlePendingConversationInput');

  assert.match(fnBody, /const replyType = classifyPendingActionReply\(text\);/);

  const guardIdx = fnBody.indexOf('!pendingAction\n      && !accountDependencyActive\n      && !categoryDependencyActive\n      && !categoryConfirmationPending');
  assert.ok(guardIdx > -1, 'a barreira de cancelamento durante esclarecimento deve existir');

  const replyTypeIdx = fnBody.indexOf('const replyType = classifyPendingActionReply(text);');
  const accountDependencyIdx = fnBody.indexOf('if (accountDependencyActive && replyType');
  assert.ok(
    replyTypeIdx < guardIdx && guardIdx < accountDependencyIdx,
    'o cancelamento durante esclarecimento deve ser verificado logo após classificar a resposta, ANTES das dependências de conta/categoria',
  );

  const guardBlock = fnBody.slice(guardIdx, accountDependencyIdx);
  assert.match(guardBlock, /financialConversation\.cancel\(\);/);
  assert.match(guardBlock, /clearCurrentPendingAction\(\);/);
  assert.match(guardBlock, /'Tudo bem\. Não registrei nada\.'/);
});

test('BUG REAL: o cancelamento durante esclarecimento fica de fora quando há dependência de conta/categoria ativa ou categoria aproximada pendente (fluxos próprios preservados)', async () => {
  const page = await source('UniChatPage.jsx');
  const { body: fnBody } = extractFunctionBody(page, 'function handlePendingConversationInput(text, userMsg) {');
  const guardIdx = fnBody.indexOf('!pendingAction\n      && !accountDependencyActive');
  const guardBlock = fnBody.slice(guardIdx, guardIdx + 400);
  assert.match(guardBlock, /!accountDependencyActive/);
  assert.match(guardBlock, /!categoryDependencyActive/);
  assert.match(guardBlock, /!categoryConfirmationPending/);
});

test('BLOCO E: confirmação do plano persiste uma operação por vez pelo mesmo RPC atômico, nunca em lote', async () => {
  const page = await source('UniChatPage.jsx');
  const idx = page.indexOf('async function confirmFinancialPlan() {');
  assert.ok(idx > -1);
  const slice = page.slice(idx, idx + 1900);
  assert.match(slice, /getPersistablePlanOperations\(workingPlan\)\s*\.filter\(\(op\) => op\.status === PLAN_OPERATION_STATUS\.READY\)/);
  assert.match(slice, /for \(const op of persistable\) \{/);
  assert.match(
    slice,
    /executeFinancialIntentAction\(op\.action, \{\s*executeAtomicAction: executeConfirmedFinancialAction,\s*\}\)/,
  );
  assert.match(slice, /markPlanOperationFailed\(workingPlan, op\.temporaryId\)/);
  assert.match(slice, /markPlanOperationConfirmed\(workingPlan, op\.temporaryId\)/);
});

test('BLOCO E: capacidades pendentes (parcelamento/recorrência) nunca são persistidas na confirmação do plano', async () => {
  const page = await source('UniChatPage.jsx');
  assert.match(page, /getPersistablePlanOperations,\n/);
  const idx = page.indexOf('async function confirmFinancialPlan() {');
  const slice = page.slice(idx, idx + 1900);
  // getPersistablePlanOperations já exclui capabilityPending (ver pendingFinancialPlan.js);
  // a chamada real nunca itera plan.operations diretamente.
  assert.doesNotMatch(slice, /for \(const op of workingPlan\.operations\)/);
});

test('BLOCO E: notifica mudança de dados financeiros só quando algo foi de fato persistido (completed/partial)', async () => {
  const page = await source('UniChatPage.jsx');
  const idx = page.indexOf('async function confirmFinancialPlan() {');
  const slice = page.slice(idx, idx + 2300);
  assert.match(slice, /\[PLAN_STATUS\.COMPLETED, PLAN_STATUS\.PARTIAL\]\.includes\(workingPlan\.status\)/);
  assert.match(slice, /notifyFinancialDataChanged\('uni-chat'\)/);
});

test('BLOCO E: correções em linguagem natural do plano usam parsePlanCorrectionOverrides sobre a operação atual, nunca sobre o plano inteiro', async () => {
  const page = await source('UniChatPage.jsx');
  const { body: slice, end } = extractFunctionBody(page, 'function handlePlanConversationInput(text) {');
  assert.ok(end > -1, 'não foi possível localizar o corpo completo de handlePlanConversationInput');
  assert.match(slice, /parsePlanCorrectionOverrides\(\{/);
  assert.match(slice, /operation: current,/);
  assert.match(slice, /applyPlanOperationCorrection\(plan, current\.temporaryId, overrides\)/);
});

test('BLOCO E: confirmar/cancelar o plano reaproveita classifyPendingActionReply e isCancelEntirePendingFlow já existentes', async () => {
  const page = await source('UniChatPage.jsx');
  const { body: slice, end } = extractFunctionBody(page, 'function handlePlanConversationInput(text) {');
  assert.ok(end > -1, 'não foi possível localizar o corpo completo de handlePlanConversationInput');
  assert.match(slice, /const replyType = classifyPendingActionReply\(text\);/);
  assert.match(slice, /replyType === 'confirm' && isPlanReadyForFinalConfirmation\(plan\)/);
  assert.match(slice, /replyType === 'cancel' \|\| isCancelEntirePendingFlow\(text\)/);
});

test('BLOCO E: cancelamento do plano nunca deixa o estado pendente em memória (limpa financialPlan)', async () => {
  const page = await source('UniChatPage.jsx');
  const idx = page.indexOf('function cancelFinancialPlanEntirely() {');
  assert.ok(idx > -1);
  const slice = page.slice(idx, idx + 500);
  assert.match(slice, /setFinancialPlan\(null\)/);
  assert.match(slice, /buildPlanCancelledText\(\)/);
});

// ============================================================================
// BUG REAL: "Gastei 50 reais no mercado e a gasolina eu paguei pelo Banco
// do Brasil." -- mistura de cláusulas + vazamento de Pending
// Action/financial_plan não encerrado corretamente. Uma frase financeira
// NOVA e autossuficiente (verbo + valor próprios) nunca pode ser tratada
// como resposta/correção a uma pendência antiga -- e um plano ainda sem
// nenhuma operação formada (só a pergunta de esclarecimento) precisa
// voltar para a camada neural na próxima resposta, nunca cair num
// fallback genérico que ignora a pergunta pendente.
// ============================================================================

test('BUG REAL: uma frase financeira nova e autossuficiente abandona qualquer pendência antiga antes de ser processada', async () => {
  const page = await source('UniChatPage.jsx');
  assert.match(page, /import \{[\s\S]*?looksLikeFreshFinancialStatement[\s\S]*?\} from '\.\.\/uni-conversation';/);
  const idx = page.indexOf('if (hasPendingConversation) {');
  assert.ok(idx > -1);
  const slice = page.slice(idx, idx + 300);
  assert.match(slice, /if \(looksLikeFreshFinancialStatement\(text\)\) \{/);
  assert.match(slice, /abandonStalePendingState\(\);/);
  assert.match(slice, /\} else \{\s*handlePendingConversationInput\(text, userMsg\);\s*return;\s*\}/);
});

test('abandonStalePendingState limpa TODO estado conversacional -- financialConversation, pendingAction, pendingActionStack e financialPlan', async () => {
  const page = await source('UniChatPage.jsx');
  const idx = page.indexOf('function abandonStalePendingState() {');
  assert.ok(idx > -1);
  const slice = page.slice(idx, idx + 400);
  assert.match(slice, /financialConversation\.reset\(\);/);
  assert.match(slice, /setPendingAction\(null\);/);
  assert.match(slice, /pendingActionStackRef\.current = null;/);
  assert.match(slice, /setPendingActionStack\(null\);/);
  assert.match(slice, /setFinancialPlan\(null\);/);
  assert.match(slice, /clearCurrentPendingAction\(\);/);
});

test('reset()/cancel() do useUniConversation também apagam o contexto de inferência entre turnos (contextRef), não só o reducer', async () => {
  const hook = await source('../uni-conversation/useUniConversation.js');
  const resetIdx = hook.indexOf('const reset = useCallback(() => {');
  const cancelIdx = hook.indexOf('const cancel = useCallback(() => {');
  assert.ok(resetIdx > -1 && cancelIdx > -1);
  assert.match(hook.slice(resetIdx, resetIdx + 600), /contextRef\.current = createConversationContext\(\);/);
  assert.match(hook.slice(cancelIdx, cancelIdx + 600), /contextRef\.current = createConversationContext\(\);/);
});

test('BUG REAL: plano de esclarecimento sem operações reenvia a resposta do usuário à camada neural, nunca cai num fallback genérico', async () => {
  const page = await source('UniChatPage.jsx');
  const { body: slice, end } = extractFunctionBody(page, 'function handlePlanConversationInput(text) {');
  assert.ok(end > -1, 'não foi possível localizar o corpo completo de handlePlanConversationInput');
  assert.match(slice, /if \(!active\.length\) \{/);
  assert.match(slice, /const handled = await attemptFinancialPlan\(text\);/);
});

test('heurística de roteamento detecta cláusulas encadeadas por conjunção com sinal financeiro próprio, mesmo com um único valor', async () => {
  const trigger = await source('../uni-conversation/financialPlanTrigger.js');
  assert.match(trigger, /export function splitFinancialClauses\(/);
  assert.match(trigger, /export function looksLikeFreshFinancialStatement\(/);
  assert.match(trigger, /clausesWithSignal\.length >= 2/);
});

// ============================================================================
// BUG 2 REAL: "estado fantasma de confirmação" -- a Home podia continuar
// mostrando um cartão Confirmar/Editar/Cancelar (ou o texto "CONFIRME A
// AÇÃO") sem nenhuma ação real por trás, porque `messages` (persistido via
// chatHistory, sem TTL) e `pendingAction`/`pendingActionStack` (com TTL
// próprio, pendingActionStorage.js) podem dessincronizar -- ex.: um reload
// depois que a pendência expirou, mas a mensagem antiga com
// confirmation:'pending' ainda está no histórico salvo.
// ============================================================================

test('BUG 2 REAL: pendingHydrated marca quando a tentativa de restauração de pendências realmente rodou', async () => {
  const page = await source('UniChatPage.jsx');
  assert.match(page, /const \[pendingHydrated, setPendingHydrated\] = useState\(false\);/);
  assert.match(page, /restoredPendingIdentityRef\.current = identityKey;\s*\n\s*setPendingHydrated\(true\);/);
});

test('BUG 2 REAL: confirmações órfãs (sem pendingAction/pendingActionStack/financialPlan reais) são saneadas para "expired" após a hidratação, nunca antes', async () => {
  const page = await source('UniChatPage.jsx');
  const idx = page.indexOf('BUG REAL (estado fantasma');
  assert.ok(idx > -1);
  const slice = page.slice(idx, idx + 1800);
  assert.match(slice, /if \(!pendingHydrated\) return;/);
  assert.match(slice, /const hasRealPendingEntity = Boolean\(\s*pendingAction\s*\|\|\s*pendingActionStack\?\.actions\?\.length\s*\|\|\s*isFinancialPlanActive\(\),\s*\);/);
  assert.match(slice, /if \(hasRealPendingEntity\) return;/);
  assert.match(slice, /status: 'expired'/);
});

test('BUG 2 REAL: o saneamento de confirmação órfã nunca mexe em mensagens quando existe uma entidade real (guard hasRealPendingEntity)', async () => {
  const page = await source('UniChatPage.jsx');
  const idx = page.indexOf('BUG REAL (estado fantasma');
  const slice = page.slice(idx, idx + 1800);
  // A ordem das guardas garante: sem hidratação -> nada; com entidade real -> nada;
  // só sanitiza no caminho restante (sem pendingAction/stack/plan ativos).
  const hydratedGuardIdx = slice.indexOf('if (!pendingHydrated) return;');
  const realEntityGuardIdx = slice.indexOf('if (hasRealPendingEntity) return;');
  const setMessagesIdx = slice.indexOf('setMessages((current) => {');
  assert.ok(hydratedGuardIdx > -1 && realEntityGuardIdx > hydratedGuardIdx && setMessagesIdx > realEntityGuardIdx);
});

test('ActionConfirmation só renderiza os botões Confirmar/Editar/Cancelar quando status === "pending" -- nunca para expired/confirmed/canceled', async () => {
  const card = await source('components/ActionConfirmation.jsx');
  const buttonsIdx = card.indexOf("{status === 'pending' && (");
  assert.ok(buttonsIdx > -1);
  const slice = card.slice(buttonsIdx, buttonsIdx + 800);
  assert.match(slice, /Confirmar/);
  assert.match(slice, /Cancelar/);
  // Nenhum outro bloco de botões existe fora dessa guarda de status.
  const allButtonBlocks = [...card.matchAll(/className=\{styles\.actions\}/g)];
  assert.equal(allButtonBlocks.length, 1);
});

test('ActionConfirmation exibe "Expirado" para uma confirmação órfã saneada, sem inventar um "confirmado" falso', async () => {
  const card = await source('components/ActionConfirmation.jsx');
  assert.match(card, /status === 'expired' && <span className=\{styles\.statusCancel\}>Expirado<\/span>/);
});

test('handleConfirmAction/handleCancelAction já se recusam a agir sem uma pendência real (guarda pré-existente, preservada)', async () => {
  const page = await source('UniChatPage.jsx');
  assert.match(page, /if \(!pendingAction && !accountDependencyActive && !categoryDependencyActive\) return;/);
});

// ============================================================================
// BLOCO F: expiração de plano financeiro (mesmo TTL de 15 minutos já usado
// pelo Pending Action Stack) e proteção contra confirmação concorrente/
// duplicada (confirmingPlanRef). Usa extractFunctionBody -- nunca um
// recorte de tamanho fixo -- para as funções que crescem com as regras do
// Bloco F.
// ============================================================================

test('BLOCO F: FINANCIAL_PLAN_TTL_MS reaproveita o mesmo período de 15 minutos do Pending Action Stack', async () => {
  const page = await source('UniChatPage.jsx');
  assert.match(page, /const FINANCIAL_PLAN_TTL_MS = 15 \* 60 \* 1000;/);
});

test('BLOCO F: isFinancialPlanExpired compara createdAt contra o TTL; isFinancialPlanActive nunca considera um plano expirado "ativo"', async () => {
  const page = await source('UniChatPage.jsx');
  const { body: expiredBody, end: expiredEnd } = extractFunctionBody(page, 'function isFinancialPlanExpired(plan) {');
  assert.ok(expiredEnd > -1, 'não foi possível localizar isFinancialPlanExpired');
  assert.match(expiredBody, /if \(!plan\?\.createdAt\) return false;/);
  assert.match(expiredBody, /Date\.now\(\) - createdAtMs > FINANCIAL_PLAN_TTL_MS/);

  const { body: activeBody, end: activeEnd } = extractFunctionBody(page, 'function isFinancialPlanActive(plan = financialPlanRef.current) {');
  assert.ok(activeEnd > -1, 'não foi possível localizar isFinancialPlanActive');
  assert.match(activeBody, /!isFinancialPlanExpired\(plan\)/);
});

test('BLOCO F: confirmFinancialPlan recusa um plano expirado, mesmo que estivesse pronto para confirmação', async () => {
  const page = await source('UniChatPage.jsx');
  const { body: slice, end } = extractFunctionBody(page, 'async function confirmFinancialPlan() {');
  assert.ok(end > -1, 'não foi possível localizar confirmFinancialPlan');
  assert.match(slice, /if \(!plan \|\| !isPlanReadyForFinalConfirmation\(plan\) \|\| isFinancialPlanExpired\(plan\)\) return;/);
});

test('BLOCO F: handlePlanConversationInput bloqueia um plano expirado ANTES de qualquer confirmação/correção/cancelamento', async () => {
  const page = await source('UniChatPage.jsx');
  const { body: slice, end } = extractFunctionBody(page, 'function handlePlanConversationInput(text) {');
  assert.ok(end > -1, 'não foi possível localizar handlePlanConversationInput');
  const expiredIdx = slice.indexOf('if (isFinancialPlanExpired(plan)) {');
  const confirmIdx = slice.indexOf("if (replyType === 'confirm'");
  assert.ok(expiredIdx > -1 && confirmIdx > -1 && expiredIdx < confirmIdx);
  assert.match(slice, /if \(isFinancialPlanExpired\(plan\)\) \{\s*setFinancialPlan\(null\);/);
});

test('BLOCO F: confirmingPlanRef impede execução concorrente/duplicada e é sempre liberado ao final (sucesso, erro ou não-ação)', async () => {
  const page = await source('UniChatPage.jsx');
  assert.match(page, /const confirmingPlanRef = useRef\(false\);/);
  const { body: slice, end } = extractFunctionBody(page, 'async function confirmFinancialPlan() {');
  assert.ok(end > -1);
  assert.match(slice, /if \(confirmingPlanRef\.current\) return;/);
  assert.match(slice, /confirmingPlanRef\.current = true;/);
  assert.match(slice, /confirmingPlanRef\.current = false;/);
  // O guard precisa ser liberado incondicionalmente ao final da execução
  // (sucesso, falha parcial ou interrupção), não só num caminho feliz.
  const releaseIdx = slice.lastIndexOf('confirmingPlanRef.current = false;');
  const setExecutingFalseIdx = slice.indexOf('setIsExecutingAction(false);', slice.indexOf('for (const op of persistable)'));
  assert.ok(releaseIdx > setExecutingFalseIdx);
});
