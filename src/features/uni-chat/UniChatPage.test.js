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
  assert.match(page, /buildQueryResponse\(queryType, financialContext, mode, \{[\s\S]{0,250}conversationStyle,/);
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
  assert.match(fnBody, /createAssistantResponse\(llmText \|\| UNI_DETERMINISTIC_FALLBACK_TEXT\)/);
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

test('a mensagem final (sucesso ou fallback determinístico) sempre passa pelo pipeline oficial e é persistida, mesmo apos cancelamento -- interface nunca trava sem resposta', async () => {
  const page = await source('UniChatPage.jsx');
  const fnBody = page.slice(
    page.indexOf('async function handleUnresolvedMessage'),
    page.indexOf('function handleCancelAi'),
  );
  const afterEnabledBlock = fnBody.slice(fnBody.lastIndexOf('aiCancelledRef.current = false;'));
  assert.match(afterEnabledBlock, /createAssistantResponse\(llmText \|\| UNI_DETERMINISTIC_FALLBACK_TEXT\);/);
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
  assert.match(fnBody, /void uniVoice\.speak\(buildSpeechText\(message\.text, MAX_TTS_TEXT_LENGTH\), \{/);
  assert.match(fnBody, /source: requestMetadata\.source \?\? 'manual_replay'/);
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

test('escritas do chat usam a RPC atômica e allowlist restrita, incluindo transferência (BUG 2)', async () => {
  const page = await source('UniChatPage.jsx');
  assert.match(page, /import \{ executeConfirmedFinancialAction \}/);
  assert.match(page, /executeAtomicAction: executeConfirmedFinancialAction/);
  assert.match(page, /ALLOWED_CHAT_WRITE_INTENTS = Object\.freeze\(\[/);
  assert.match(page, /'register_income',\s+'register_expense',\s+'set_balance',[\s\S]*?'ambiguous_balance_or_income',[\s\S]*?'register_transfer',/);
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
  // O autoplay passa pelo adaptador de origem, enquanto o botão manual
  // continua recebendo handleSpeakMessage diretamente.
  const directCalls = page.match(/handleAutomaticSpeakMessage\(lastMessage\);/g) ?? [];
  assert.equal(directCalls.length, 1, 'esperava exatamente uma chamada direta do adaptador de autoplay');
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
  assert.match(block, /handleAutomaticSpeakMessage\(lastMessage\);/);
});

test('BLOCO UNI 2: o efeito de autoplay NUNCA retorna uma função de limpeza (cleanup) -- evita que o cleanup de uma mensagem antiga interrompa a fala de uma mensagem nova que já começou', async () => {
  const page = await source('UniChatPage.jsx');
  const idx = page.indexOf('reprodução automática da resposta ATUAL da');
  const startEffect = page.indexOf('useEffect(() => {', idx);
  const endEffect = page.indexOf('}, [messages, isSimplifiedExperience, voicePreference.enabled, handleAutomaticSpeakMessage, user?.id, historyHydrated]);', startEffect);
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
  assert.match(block, /handleAutomaticSpeakMessage\(lastMessage\);/);
  // A versão curta para voz (buildSpeechText) é aplicada dentro de
  // handleSpeakMessage, nunca no efeito nem no texto visível.
  assert.match(page, /void uniVoice\.speak\(buildSpeechText\(message\.text, MAX_TTS_TEXT_LENGTH\), \{/);
  assert.match(page, /buildSpeechText\(text, MAX_TTS_TEXT_LENGTH\)/);
});

test('BLOCO VOZ 1: pergunta, pedido de confirmação e sucesso entram no MESMO autoplay -- toda resposta da Uni passa pelo pipeline oficial (createAssistantResponse), nenhum caminho fala por fora (sem duplicação)', async () => {
  const page = await source('UniChatPage.jsx');
  const occurrences = page.match(/uniVoice\.speak\(/g) ?? [];
  assert.equal(occurrences.length, 2, 'toda fala de mensagem passa por handleSpeakMessage; nenhum fluxo de resposta (pergunta/confirmação/sucesso) fala por fora');
  // Pipeline oficial: TODAS as respostas da Uni (pergunta, confirmação,
  // sucesso, erro, aviso, consulta financeira, plano) passam por
  // createAssistantResponse -- nunca por pushMessage+syncMessageToSupabase
  // soltos nem por buildUniMessage espalhado pelos fluxos.
  assert.equal((page.match(/createAssistantResponse\(/g) ?? []).length >= 20, true, 'os fluxos de resposta da Uni continuam intactos, todos passando pelo pipeline oficial');
  assert.doesNotMatch(page, /pushMessage\(assistantMsg\);/);
  assert.doesNotMatch(page, /pushMessage\(buildUniMessage\(/);
  assert.doesNotMatch(page, /pushMessage\(unsupportedMsg\)|pushMessage\(safeMsg\)|pushMessage\(clarifyMsg\)/);
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
  const speakIdx = block.indexOf('handleAutomaticSpeakMessage(lastMessage);');
  assert.ok(markIdx > -1 && speakIdx > markIdx, 'a marcação deve acontecer ANTES da narração -- o re-mount (Strict Mode ou remount real) bloqueia a repetição');
});

test('BLOCO VOZ 1: o botão manual "Ouvir" não consulta o registro de autoplay -- continua funcionando mesmo depois do autoplay já ter narrado a mesma mensagem', async () => {
  const page = await source('UniChatPage.jsx');
  const handleSpeakBlock = page.slice(
    page.indexOf('const handleSpeakMessage = useCallback'),
    page.indexOf('// BLOCO VOZ 1: ponto ÚNICO para narrar'),
  );
  assert.doesNotMatch(handleSpeakBlock, /hasAutoSpokenMessage|markAutoSpokenMessage|spokenMessageSession/, 'o disparo manual passa direto pelo registro -- nunca bloqueado pelo autoplay');
  assert.match(handleSpeakBlock, /void uniVoice\.speak\(buildSpeechText\(message\.text, MAX_TTS_TEXT_LENGTH\), \{/);
  assert.match(handleSpeakBlock, /source: requestMetadata\.source \?\? 'manual_replay'/);
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
  assert.match(block, /\}, \[messages, isSimplifiedExperience, voicePreference\.enabled, handleAutomaticSpeakMessage, user\?\.id, historyHydrated\]\);/);
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

test('BLOCO VOZ HIDRATAÇÃO (deadlock corrigido): handleWelcomeVoiceSettled chama markWelcomeVoiceSettled ANTES de maybeArmAutoplay -- pendingWelcome nunca fica preso e historyHydrated é armado após settled', async () => {
  const page = await source('UniChatPage.jsx');
  // O callback de settled precisa LIBERAR a chave pendente da saudação antes
  // de tentar armar -- sem isso, isWelcomeVoicePending fica true para sempre,
  // historyHydrated nunca arma e speakMessage nunca é chamado.
  assert.match(
    page,
    /import \{ buildWelcomeSessionKey, isWelcomeVoicePending, markWelcomeVoiceSettled \} from '\.\.\/simplified-app\/welcomeVoiceSession\.js';/,
  );
  const block = page.slice(
    page.indexOf('const handleWelcomeVoiceSettled = useCallback'),
    page.indexOf('const handleWelcomeVoiceSettled = useCallback') + 800,
  );
  const markIdx = block.indexOf('markWelcomeVoiceSettled(buildWelcomeSessionKey(user, session));');
  const armIdx = block.indexOf('maybeArmAutoplay();');
  assert.ok(markIdx > -1, 'handleWelcomeVoiceSettled deve liberar a chave (markWelcomeVoiceSettled)');
  assert.ok(armIdx > -1, 'handleWelcomeVoiceSettled deve tentar armar depois (maybeArmAutoplay)');
  assert.ok(markIdx < armIdx, 'markWelcomeVoiceSettled deve rodar ANTES de maybeArmAutoplay -- settled → pending=false → armamento');
  assert.ok(!/setTimeout|setInterval/.test(block), 'a liberação é determinística -- nunca timeout');
});

test('BLOCO VOZ ID: pontos de restauração reservam IDs restaurados (reserveMessageIds) -- mensagens novas nunca colidem com histórico', async () => {
  const page = await source('UniChatPage.jsx');
  assert.match(page, /import \{ reserveMessageIds \} from '\.\/messageIdRegistry\.js';/);
  // Primeiro render: reserva o histórico restaurado inicial (antes do armamento).
  assert.match(page, /useEffect\(\(\) => \{\s*\n\s*reserveMessageIds\(messages\);/);
  // Snapshot do armamento do autoplay.
  const armBlock = page.slice(
    page.indexOf('const maybeArmAutoplay = useCallback'),
    page.indexOf('const handleWelcomeVoiceSettled = useCallback'),
  );
  assert.match(armBlock, /reserveMessageIds\(messages\);/);
  // Restauração assíncrona inicial do Supabase.
  const initialRestore = page.slice(
    page.indexOf('useEffect(() => {\n    if (!activeId) return;\n    const current = conversations.find'),
    page.indexOf('const pendingSyncRef = useRef([]);'),
  );
  assert.match(initialRestore, /reserveMessageIds\(loadedMessages\);/);
  // switchConversation (síncrono e assíncrono).
  const switchBlock = page.slice(
    page.indexOf('function switchConversation(id) {'),
    page.indexOf('async function handleUnresolvedMessage'),
  );
  assert.match(switchBlock, /reserveMessageIds\(conv\.messages \|\| \[\]\);/);
  assert.match(switchBlock, /reserveMessageIds\(loadedMessages\);/);
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
  const slice = page.slice(idx, idx + 1200);
  assert.match(slice, /looksLikeFreshFinancialStatement\(text\)/);
  assert.match(slice, /looksLikeFreshBalanceStatement\(text\)/);
  assert.match(slice, /abandonStalePendingState\(\);/);
  assert.match(slice, /\} else \{\s*handlePendingConversationInput\(text, userMsg\);\s*return;\s*\}/);
});

test('declarações de saldo também são frases novas autossuficientes (ajuste/pergunta de decisão, nunca resposta a pendência antiga)', async () => {
  const page = await source('UniChatPage.jsx');
  assert.match(page, /import \{[\s\S]*?looksLikeFreshBalanceStatement[\s\S]*?\} from '\.\.\/uni-conversation';/);
  const trigger = await source('../uni-conversation/financialPlanTrigger.js');
  assert.match(trigger, /export function looksLikeFreshBalanceStatement\(/);
  assert.match(trigger, /saldo/);
  assert.match(trigger, /\|estou\\s\+com\|to\\s\+com/);
  const idx = page.indexOf('if (hasPendingConversation) {');
  assert.ok(idx > -1);
  assert.match(page.slice(idx, idx + 950), /looksLikeFreshBalanceStatement\(text\)/);
});

test('CORREÇÃO URGENTE: pendência incompatível é abandonada quando a frase declara uma ação financeira NOVA (regra geral, além das looksLike*)', async () => {
  const page = await source('UniChatPage.jsx');
  assert.match(
    page,
    /const ACTION_STATEMENT_INTENTS = new Set\(\[[\s\S]*?'set_balance',[\s\S]*?'ambiguous_balance_or_income',[\s\S]*?'register_income',[\s\S]*?'register_expense',[\s\S]*?'register_transfer',[\s\S]*?'create_goal',[\s\S]*?\]\);/,
  );
  const idx = page.indexOf('if (hasPendingConversation) {');
  assert.ok(idx > -1);
  const slice = page.slice(idx, idx + 1400);
  // A mesma intenção da pendência continua sendo resposta legítima à
  // pendência (ex.: reiterar o próprio lançamento); intenção DIFERENTE é
  // um novo enunciado explícito e abandona a pendência.
  assert.match(slice, /const pendingActionIntent = \(pendingAction \?\? financialConversation\.state\.action\)\?\.intent;/);
  assert.match(slice, /const declaredIntent = classifyIntent\(text\)\.intent;/);
  assert.match(slice, /ACTION_STATEMENT_INTENTS\.has\(declaredIntent\) && declaredIntent !== pendingActionIntent/);
  assert.match(slice, /abandonStalePendingState\(\);/);
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
  assert.match(page, /restoredPendingIdentityRef\.current = identityKey;\s*\n\s*setPendingHydrated\(false\);\s*\n\s*setPendingHydrated\(true\);/);
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

// ============================================================================
// BUG REAL (prioridade de classificação): o FinancialQueryEngine só era
// consultado no caminho SEM pendência (runDeterministicFinancialFlow) --
// com uma Pending Action ativa (dependência de criação de conta/categoria,
// campo em esclarecimento), a consulta financeira era engolida pelo fluxo
// de pendência ou virava proposta de criação de conta. Regras corrigidas:
//   1. FinancialQueryEngine responde SEMPRE antes do fluxo de criação de
//      conta (também dentro do fluxo de pendência);
//   2. pergunta financeira NUNCA entra no fluxo de criação de conta;
//   3. criação de conta só com intenção explícita ou Pending Action
//      aguardando o campo de conta.
// ============================================================================

test('BUG 1: handlePendingConversationInput consulta o FinancialQueryEngine ANTES de qualquer branch de criação de conta/pendência', async () => {
  const page = await source('UniChatPage.jsx');
  const { body: slice, end } = extractFunctionBody(page, 'function handlePendingConversationInput(text, userMsg) {');
  assert.ok(end > -1, 'não foi possível localizar handlePendingConversationInput');
  const engineIdx = slice.indexOf('const engineOutcome = resolveFinancialQuery({');
  const dependencyIdx = slice.indexOf('const accountDependencyActive = isAccountCreationDependency');
  const creationBranchIdx = slice.indexOf("if (accountDependencyActive) {");
  const fallbackIdx = slice.indexOf('startAccountDependency(text)');
  assert.ok(engineIdx > -1, 'handlePendingConversationInput consulta o FinancialQueryEngine');
  assert.ok(dependencyIdx > -1 && engineIdx < dependencyIdx, 'o engine roda antes de calcular as dependências de criação');
  assert.ok(creationBranchIdx > -1 && engineIdx < creationBranchIdx, 'o engine roda antes do branch de confirmação de criação de conta');
  assert.ok(fallbackIdx > -1 && engineIdx < fallbackIdx, 'o engine roda antes do fallback startAccountDependency');
});

test('BUG 1: o gate do engine responde consultas reconhecidas dentro do fluxo de pendência e preserva a pendência (retorna true sem tocar o estado da conversa)', async () => {
  const page = await source('UniChatPage.jsx');
  const { body: slice } = extractFunctionBody(page, 'function handlePendingConversationInput(text, userMsg) {');
  assert.match(slice, /if \(\s*engineOutcome\.handled\s*&&\s*engineOutcome\.queryType !== 'transaction_reference'\s*\)\s*\{\s*syncMessageToSupabase\(userMsg\);/);
  assert.match(slice, /createAssistantResponse\(\s*engineOutcome\.response\.text,\s*\{ highlight: engineOutcome\.response\.highlight \},\s*\);/);
  assert.match(slice, /return true;\s*\}/, 'o gate responde a consulta e mantém a Pending Action intacta para o próximo input');
  // transaction_reference ("caixa", "confirmar", nomes/valores isolados) NÃO
  // toma a frente do fluxo de pendência -- são respostas legítimas ao campo
  // pendente, nunca perguntas financeiras.
  assert.match(slice, /engineOutcome\.queryType !== 'transaction_reference'/);
});

test('CORREÇÃO URGENTE: runDeterministicFinancialFlow consulta os motores de consulta SOMENTE quando a frase não é uma ação financeira declarada', async () => {
  const page = await source('UniChatPage.jsx');
  const { body: slice } = extractFunctionBody(page, 'function runDeterministicFinancialFlow(text, historySnapshot) {');
  assert.ok(slice.length > 0, 'não foi possível localizar runDeterministicFinancialFlow');
  // Declarações/ações (set_balance, ambiguidade, receita, despesa,
  // transferência, meta) pulam o FinancialQueryEngine e o interpretador
  // legado e vão direto para o fluxo de registro (interpret).
  assert.match(slice, /if \(!ACTION_STATEMENT_INTENTS\.has\(classifyIntent\(text\)\.intent\)\) \{/);
  const gateIdx = slice.indexOf('ACTION_STATEMENT_INTENTS.has(classifyIntent(text).intent)');
  const engineIdx = slice.indexOf('const engineOutcome = resolveFinancialQuery({');
  const interpreterIdx = slice.indexOf('const queryType = classifyFinancialQuery(text);');
  const interpretIdx = slice.indexOf('const result = financialConversation.interpret(text);');
  assert.ok(gateIdx > -1 && engineIdx > -1 && interpreterIdx > -1 && interpretIdx > -1);
  assert.ok(gateIdx < engineIdx, 'o gate de intenção roda antes do FinancialQueryEngine');
  assert.ok(engineIdx < interpreterIdx, 'o engine roda antes do interpretador legado');
  assert.ok(interpreterIdx < interpretIdx, 'os motores de consulta rodam antes do fluxo de registro');
});

test('BUG 2: criação de conta por fallback pós-interpret exige que o texto NÃO seja uma pergunta (guard isLikelyFinancialQuestion no fallback 1896)', async () => {
  const page = await source('UniChatPage.jsx');
  const { body: slice } = extractFunctionBody(page, 'function runDeterministicFinancialFlow(text, historySnapshot) {');
  assert.match(
    slice,
    /if \(\s*result\.action\?\.proposedAccount\s*&&\s*!isLikelyFinancialQuestion\(text\)\s*&&\s*openAccountCreationDependency\(result\)\s*\)\s*\{\s*return;\s*\}/,
  );
});

test('BUG 2: resposta "Caixa" a um campo pendente (Pending Action aguardando conta) continua criando -- a guarda só bloqueia perguntas', async () => {
  const page = await source('UniChatPage.jsx');
  const { body: slice } = extractFunctionBody(page, 'function handlePendingConversationInput(text, userMsg) {');
  assert.match(
    slice,
    /if \(\s*resolvedInput\.kind === 'account_not_found'\s*&&\s*!isLikelyFinancialQuestion\(text\)\s*&&\s*startAccountDependency\(text\)\s*\)\s*\{\s*return true;\s*\}/,
  );
});

test('BUG 2: isLikelyFinancialQuestion é uma heurística de início de pergunta -- os disparadores reais da criação (verbo de registro) não batem nela', async () => {
  const page = await source('UniChatPage.jsx');
  assert.match(page, /function isLikelyFinancialQuestion\(text\) \{/);
  assert.match(page, /\^\(\?:qual\|quais\|quanto\|quantos\|quantas\|quando\|onde\|como\|que\|quem\|por\\s\+que\|o\\s\+que\|para\\s\+que\)\\b\/iu/);
  // Um registro explícito ("gastei 50 no mercado") não começa com palavra de
  // pergunta -- a criação de conta por intenção explícita continua viva.
  assert.doesNotMatch(page.slice(page.indexOf('function isLikelyFinancialQuestion'), page.indexOf('export default function UniChatPage')), /gastei/);
});

test('BUG 3: dedup de narração por conteúdo fica DENTRO do pipeline oficial (narratedTextSession) -- nenhum caminho de resposta narra por fora', async () => {
  const pipeline = await source('useUniResponsePipeline.js');
  assert.match(pipeline, /hasNarratedText\(userId, text\)/);
  assert.match(pipeline, /markNarratedText\(userId, text\)/);
  // A ordem de operação do pipeline não muda: markSpoken continua ANTES de
  // qualquer decisão de fala (inclusive quando o dedup de conteúdo silencia).
  const markIdx = pipeline.indexOf('markSpoken(userId, msg.id);');
  const dedupIdx = pipeline.indexOf('hasNarratedText(userId, text)');
  const speakIdx = pipeline.indexOf('speakMessage(msg);', dedupIdx);
  assert.ok(markIdx > -1 && dedupIdx > markIdx && speakIdx > dedupIdx, 'marca por id → checa dedup de conteúdo → fala');
});

test('BUG 3: toda restauração de mensagens reserva IDs msg-N (troca de workspace/modo incluída) -- nenhum ponto reintroduz chave duplicada', async () => {
  const page = await source('UniChatPage.jsx');
  // Troca de workspace/perfil: o histórico restaurado precisa reservar os
  // IDs msg-N antes que qualquer mensagem nova possa ser criada -- sem
  // isso, o contador zerado do registry colidia com os IDs restaurados.
  const modeBlock = page.slice(
    page.indexOf('const candidates = updated'),
    page.indexOf('createAssistantResponse(', page.indexOf('const candidates = updated')),
  );
  assert.match(modeBlock, /setMessages\(c\.messages \|\| \[\]\)/);
  assert.match(modeBlock, /reserveMessageIds\(c\.messages \|\| \[\]\)/);
  assert.ok(
    modeBlock.indexOf('reserveMessageIds') > modeBlock.indexOf('setMessages'),
    'a reserva acontece junto à restauração (após o setMessages)',
  );
  // switchConversation (caminho síncrono): a restauração também reserva.
  const switchBlock = page.slice(
    page.indexOf('const conv = conversations.find'),
    page.indexOf('function handleUnresolvedMessage'),
  );
  assert.match(switchBlock, /setMessages\(conv\.messages \|\| \[\]\)/);
  assert.match(switchBlock, /reserveMessageIds\(conv\.messages \|\| \[\]\)/);
  // Restauração assíncrona do Supabase (efeito inicial + switch async):
  // reserva antes do setMessages em ambos.
  const loadBlock = page.slice(
    page.indexOf('const requestId = ++loadRequestIdRef.current'),
    page.indexOf('setConversations((prev) =>', page.indexOf('const requestId = ++loadRequestIdRef.current')),
  );
  assert.match(loadBlock, /markRestoredMessagesAsSpoken\(user\?\.id, loadedMessages\)/);
  assert.match(loadBlock, /reserveMessageIds\(loadedMessages\)/);
  assert.ok(
    loadBlock.indexOf('reserveMessageIds') < loadBlock.indexOf('setMessages((prev)'),
    'a restauração assíncrona reserva ANTES de substituir as mensagens',
  );
});

test('BUG 4: scroll consome stickToBottom em layout effect -- "Ver conversa completa" não abre mais no topo', async () => {
  const page = await source('UniChatPage.jsx');
  const scrollBlock = page.slice(
    page.indexOf('function scrollToLatest()'),
    page.indexOf('function pushMessage'),
  );
  assert.match(scrollBlock, /useLayoutEffect\(\(\) => \{/);
  assert.match(scrollBlock, /if \(!stickToBottom\.current\) return;/);
  assert.match(scrollBlock, /scrollRef\.current/);
  assert.match(scrollBlock, /el\.scrollTop = el\.scrollHeight;/);
  assert.match(scrollBlock, /}, \[messages\]\);/);
  // Contrato de aderência: nada de setTimeout arbitrário para rolar.
  assert.doesNotMatch(scrollBlock, /setTimeout\(/);
  // O usuário que rolou para cima (stickToBottom=false) mantém a leitura.
  assert.match(scrollBlock, /rolou para cima/);
});

test('BUG 5: hidratação funde mensagens por IDENTIDADE (clientMessageId/dbId) -- nunca por comprimento ou índice', async () => {
  const page = await source('UniChatPage.jsx');
  const loadBlock = page.slice(
    page.indexOf('const requestId = ++loadRequestIdRef.current'),
    page.indexOf('const pendingSyncRef = useRef([])'),
  );
  assert.match(loadBlock, /clientMessageId \?\? msg\.dbId \?\? msg\.id/);
  assert.match(loadBlock, /localIds\.has\(msg\.clientMessageId \?\? msg\.dbId \?\? msg\.id\)/);
  assert.match(loadBlock, /return \[\.\.\.prev, \.\.\.dbOnly\]/);
  assert.doesNotMatch(loadBlock, /prev\.length < loadedMessages\.length/);
});

// ============================================================================
// PARTE 2 — BLOCO 1: Uni Engine conectada ao pipeline real em Shadow Mode
// ============================================================================

// Fatia o fonte entre dois marcadores de início (sem depender de contagem de
// chaves) para inspecionar callbacks únicos do arquivo.
function betweenMarkers(page, from, to) {
  const start = page.indexOf(from);
  if (start === -1) return '';
  const end = to ? page.indexOf(to, start) : -1;
  return end === -1 ? page.slice(start) : page.slice(start, end);
}

test('BLOCO 1: a Uni Engine roda somente APÓS o resultado legado -- no ponto único de saída de resposta, nunca no envio', async () => {
  const page = await source('UniChatPage.jsx');
  // O envio apenas guarda o turno do usuário -- a engine não roda antes do
  // resultado legado existir (nenhum uniEngine.runShadow dentro de sendText).
  const sendBlock = extractFunctionBody(page, 'function sendText(text) {').body;
  assert.match(sendBlock, /lastEngineTurnRef\.current = \{/);
  assert.match(sendBlock, /userMessageId: userMsg\.id/);
  assert.doesNotMatch(sendBlock, /uniEngine\.runShadow\(/);
  // O motor observa (runShadow + runUniEngineIntegration) no ponto que JÁ
  // recebe o texto legado final, chamado por buildGuidedUniMessage →
  // createAssistantResponse.
  const runBlock = betweenMarkers(
    page,
    'const runEngineObservational = useCallback',
    'const applyEngineGuidanceToResponse = useCallback',
  );
  assert.ok(runBlock.length > 0, 'runEngineObservational não localizado');
  assert.match(runBlock, /uniEngine\.runShadow\(\{/);
  assert.match(runBlock, /runUniEngineIntegration\(\{/);
  const guidedBlock = betweenMarkers(
    page,
    'const applyEngineGuidanceToResponse = useCallback',
    'const buildGuidedUniMessage = useCallback',
  );
  assert.match(guidedBlock, /runEngineObservational\(legacyText, options\)/);
  const buildBlock = betweenMarkers(
    page,
    'const buildGuidedUniMessage = useCallback',
    'const { createAssistantResponse } = useUniResponsePipeline',
  );
  assert.match(buildBlock, /applyEngineGuidanceToResponse\(text, messageOptions\)/);
});

test('BLOCO 1: finalText exibido é SEMPRE o texto legado -- a resposta nunca é substituída pelo resultado da engine', async () => {
  const page = await source('UniChatPage.jsx');
  const guidedBlock = betweenMarkers(
    page,
    'const applyEngineGuidanceToResponse = useCallback',
    'const buildGuidedUniMessage = useCallback',
  );
  assert.match(guidedBlock, /return legacyText;/);
  assert.doesNotMatch(guidedBlock, /result\.finalText/);
  assert.doesNotMatch(guidedBlock, /finalText \?\? legacyText/);
});

test('BLOCO 1: engine desligada não altera nada -- config é sempre lida via uniEngine.getConfig e o texto exibido continua legado', async () => {
  const page = await source('UniChatPage.jsx');
  const runBlock = betweenMarkers(
    page,
    'const runEngineObservational = useCallback',
    'const applyEngineGuidanceToResponse = useCallback',
  );
  assert.match(runBlock, /uniEngine\.getConfig\(\)/);
  const guidedBlock = betweenMarkers(
    page,
    'const applyEngineGuidanceToResponse = useCallback',
    'const buildGuidedUniMessage = useCallback',
  );
  // nenhum branch lê o resultado da engine para decidir o texto exibido
  assert.match(guidedBlock, /return legacyText;/);
  assert.doesNotMatch(guidedBlock, /shadow/);
});

test('BLOCO 1: erro interno da engine nunca quebra o chat -- try/catch silencioso no ponto de observação', async () => {
  const page = await source('UniChatPage.jsx');
  const runBlock = betweenMarkers(
    page,
    'const runEngineObservational = useCallback',
    'const applyEngineGuidanceToResponse = useCallback',
  );
  assert.match(runBlock, /try \{/);
  assert.match(runBlock, /\} catch \{/);
  assert.doesNotMatch(runBlock, /throw /);
   // o fallback silencioso zera os refs e o texto legado segue intacto
   assert.match(runBlock, /lastEngineIntegrationResultRef\.current = null;/);
});

test('BLOCO 1: Shadow Mode não aplica guidance -- capabilities são calculadas na integração mas nunca alteram o fluxo real', async () => {
  const page = await source('UniChatPage.jsx');
  const runBlock = betweenMarkers(
    page,
    'const runEngineObservational = useCallback',
    'const applyEngineGuidanceToResponse = useCallback',
  );
  // a integração é chamada (calcula guidance/diagnostics/metadata/comparação)...
  assert.match(runBlock, /runUniEngineIntegration\(\{/);
  // ...mas o texto retornado ao pipeline é sempre o legado
  const guidedBlock = betweenMarkers(
    page,
    'const applyEngineGuidanceToResponse = useCallback',
    'const buildGuidedUniMessage = useCallback',
  );
  assert.match(guidedBlock, /return legacyText;/);
  assert.doesNotMatch(guidedBlock, /questionGuidance/);
  assert.doesNotMatch(guidedBlock, /clarificationGuidance/);
  assert.doesNotMatch(guidedBlock, /styleGuidance/);
  assert.doesNotMatch(guidedBlock, /lengthGuidance/);
});

test('BLOCO 1: Pending Action não é alterada -- a observação só LÊ o estado (refs), nunca escreve setPendingAction/savePendingAction', async () => {
  const page = await source('UniChatPage.jsx');
  const runBlock = betweenMarkers(
    page,
    'const runEngineObservational = useCallback',
    'const applyEngineGuidanceToResponse = useCallback',
  );
  assert.match(runBlock, /pendingActionRef\.current/);
  assert.doesNotMatch(runBlock, /setPendingAction\(/);
  assert.doesNotMatch(runBlock, /savePendingAction\(/);
});

test('BLOCO 1: confirmação não é pulada -- a observação não chama confirm/provideInput nem muta o estado de confirmação', async () => {
  const page = await source('UniChatPage.jsx');
  const runBlock = betweenMarkers(
    page,
    'const runEngineObservational = useCallback',
    'const applyEngineGuidanceToResponse = useCallback',
  );
  assert.doesNotMatch(runBlock, /\.confirm\(/);
  assert.doesNotMatch(runBlock, /provideInput\(/);
  assert.doesNotMatch(runBlock, /confirmation: \{/);
});

test('BLOCO 1: nenhuma execução financeira e nenhuma chamada direta a banco/Supabase/RPC no ponto de observação', async () => {
  const page = await source('UniChatPage.jsx');
  const runBlock = betweenMarkers(
    page,
    'const runEngineObservational = useCallback',
    'const applyEngineGuidanceToResponse = useCallback',
  );
  assert.doesNotMatch(runBlock, /executeFinancialIntentAction/);
  assert.doesNotMatch(runBlock, /executeConfirmedFinancialAction/);
  assert.doesNotMatch(runBlock, /\.rpc\(/);
  assert.doesNotMatch(runBlock, /supabase/);
});

test('BLOCO 1: nenhuma escrita de memória no chat -- a observação não persiste pending action nem memória de conversa', async () => {
  const page = await source('UniChatPage.jsx');
  const runBlock = betweenMarkers(
    page,
    'const runEngineObservational = useCallback',
    'const applyEngineGuidanceToResponse = useCallback',
  );
  assert.doesNotMatch(runBlock, /savePendingAction\(/);
  assert.doesNotMatch(runBlock, /savePendingActionStack\(/);
  // o único contato com memória é o adapter de captura Shadow (gated), nunca
  // uma escrita direta do chat
  assert.match(runBlock, /memoryAdapter/);
});

test('BLOCO 1: nenhum TTS adicional é disparado -- a observação nunca chama uniVoice.speak nem o autoplay', async () => {
  const page = await source('UniChatPage.jsx');
  const runBlock = betweenMarkers(
    page,
    'const runEngineObservational = useCallback',
    'const applyEngineGuidanceToResponse = useCallback',
  );
  assert.doesNotMatch(runBlock, /uniVoice\.speak/);
  assert.doesNotMatch(runBlock, /handleAutomaticSpeakMessage/);
  assert.doesNotMatch(runBlock, /handleSpeakMessage/);
});

test('BLOCO 1: sem execução duplicada para a mesma resposta -- guarda dedup por mensagem do usuário antes de rodar a engine', async () => {
  const page = await source('UniChatPage.jsx');
  const runBlock = betweenMarkers(
    page,
    'const runEngineObservational = useCallback',
    'const applyEngineGuidanceToResponse = useCallback',
  );
  assert.match(runBlock, /lastEngineAnalyzedMessageIdRef\.current === turn\.userMessageId/);
  // a guarda de dedup roda ANTES do try (antes de qualquer execução da engine)
  assert.ok(
    runBlock.indexOf('lastEngineAnalyzedMessageIdRef.current === turn.userMessageId')
      < runBlock.indexOf('try {'),
    'a guarda de dedup vem antes da execução da engine',
  );
});

test('BLOCO 1: resultado da engine/integração permanece serializável e fica só em ref local -- nunca persistido em banco/memória/telemetria', async () => {
  const page = await source('UniChatPage.jsx');
  const runBlock = betweenMarkers(
    page,
    'const runEngineObservational = useCallback',
    'const applyEngineGuidanceToResponse = useCallback',
  );
   assert.match(runBlock, /lastEngineIntegrationResultRef\.current = result;/);
  assert.doesNotMatch(runBlock, /localStorage/);
  assert.doesNotMatch(runBlock, /saveHistory\(/);
  assert.doesNotMatch(runBlock, /syncMessageToSupabase/);
});

// PARTE 2 — BLOCO 4: snapshot observacional consolidado da conversa.
// Construído APÓS integrationSnapshot + guidanceSnapshot, guardado apenas em
// ref dedicado, com falha segura e SEM nunca alterar o pipeline legado.
test('BLOCO 4: snapshot observacional é construído DEPOIS da integração e das guidance', async () => {
  const page = await source('UniChatPage.jsx');
  const runBlock = betweenMarkers(
    page,
    'const runEngineObservational = useCallback',
    'const applyEngineGuidanceToResponse = useCallback',
  );
  const integrationAssign = runBlock.indexOf('lastEngineIntegrationResultRef.current = result;');
  const guidanceAssign = runBlock.indexOf('lastGuidanceSnapshotRef.current = buildGuidanceSnapshot({');
  const observationAssign = runBlock.indexOf('lastObservationSnapshotRef.current = buildConversationObservationSnapshot({');
  assert.ok(integrationAssign !== -1, 'integração atribui ao ref de integração');
  assert.ok(guidanceAssign !== -1, 'guidance atribui ao ref de guidance');
  assert.ok(observationAssign !== -1, 'observation atribui ao ref dedicado');
  assert.ok(guidanceAssign > integrationAssign, 'guidance é construída após a integração');
  assert.ok(observationAssign > guidanceAssign, 'observation é construída após integration e guidance');
  assert.match(runBlock, /buildObservationSnapshot\(\{/);
  assert.match(runBlock, /integrationSnapshot: result,/);
  assert.match(runBlock, /guidanceSnapshot: lastGuidanceSnapshotRef\.current,/);
  assert.match(runBlock, /activationSnapshot: shadow\?\.activation \?\? null,/);
});

test('BLOCO 4: snapshot fica SOMENTE em ref dedicado -- nenhum state React, nenhuma renderização', async () => {
  const page = await source('UniChatPage.jsx');
  const runBlock = betweenMarkers(
    page,
    'const runEngineObservational = useCallback',
    'const applyEngineGuidanceToResponse = useCallback',
  );
  assert.match(runBlock, /lastObservationSnapshotRef\.current = /);
  assert.doesNotMatch(runBlock, /setObservationSnapshot/);
  assert.doesNotMatch(runBlock, /useState\(/);
  assert.doesNotMatch(runBlock, /render\(/);
});

test('BLOCO 4: helper local tem falha segura -- erro na construção do snapshot não quebra o chat', async () => {
  const page = await source('UniChatPage.jsx');
  const runBlock = betweenMarkers(
    page,
    'const runEngineObservational = useCallback',
    'const applyEngineGuidanceToResponse = useCallback',
  );
  assert.match(runBlock, /const buildConversationObservationSnapshot = \(/);
  assert.match(runBlock, /if \(!integrationSnapshot && !guidanceSnapshot\) return null;/);
  assert.match(runBlock, /\} catch \{\s*\n\s*return null;\s*\n\s*\}/);
  assert.match(runBlock, /lastObservationSnapshotRef\.current = null;/);
});

test('BLOCO 4: finalText continua sendo o legado -- observation jamais altera a resposta', async () => {
  const page = await source('UniChatPage.jsx');
  const runBlock = betweenMarkers(
    page,
    'const runEngineObservational = useCallback',
    'const applyEngineGuidanceToResponse = useCallback',
  );
  const guidedBlock = betweenMarkers(
    page,
    'const applyEngineGuidanceToResponse = useCallback',
    'const buildGuidedUniMessage = useCallback',
  );
  assert.match(runBlock, /buildObservationSnapshot/);
  assert.match(guidedBlock, /return legacyText;/);
});

test('BLOCO 4: snapshot não duplica execução -- dedup ocorre antes da construção', async () => {
  const page = await source('UniChatPage.jsx');
  const runBlock = betweenMarkers(
    page,
    'const runEngineObservational = useCallback',
    'const applyEngineGuidanceToResponse = useCallback',
  );
  const dedupGuard = runBlock.indexOf('lastEngineAnalyzedMessageIdRef.current === turn.userMessageId');
  const helperDef = runBlock.indexOf('const buildConversationObservationSnapshot = (');
  assert.ok(dedupGuard !== -1 && helperDef !== -1);
  assert.ok(dedupGuard < helperDef, 'dedup acontece antes de construir o snapshot');
});

test('BLOCO 4: pipeline legado intacto -- nenhuma execução, confirmação, memória, TTS ou persistência', async () => {
  const page = await source('UniChatPage.jsx');
  const runBlock = betweenMarkers(
    page,
    'const runEngineObservational = useCallback',
    'const applyEngineGuidanceToResponse = useCallback',
  );
  assert.doesNotMatch(runBlock, /executeFinancialIntentAction/);
  assert.doesNotMatch(runBlock, /executeConfirmedFinancialAction/);
  assert.doesNotMatch(runBlock, /\.rpc\(/);
  assert.doesNotMatch(runBlock, /savePendingActionStack/);
  assert.doesNotMatch(runBlock, /uniVoice\.speak/);
  assert.doesNotMatch(runBlock, /handleAutomaticSpeakMessage/);
  assert.doesNotMatch(runBlock, /localStorage/);
  assert.doesNotMatch(runBlock, /syncMessageToSupabase/);
  assert.doesNotMatch(runBlock, /insertMessage/);
  assert.doesNotMatch(runBlock, /await saveDecision/);
  assert.doesNotMatch(runBlock, /confirmation\./);
  assert.doesNotMatch(runBlock, /provideInput/);
});

test('BLOCO 4: snapshot observacional do chat é serializável e determinístico (mesma entrada -> mesma saída)', async () => {
  const { buildObservationSnapshot } = await import('../uni-engine/observation/buildObservationSnapshot.js');
  const { buildGuidanceSnapshot } = await import('../uni-engine/guidance/buildGuidanceSnapshot.js');
  const { runUniEngineIntegration } = await import('../uni-engine/integration/runUniEngineIntegration.js');
  const {
    buildIntegrationConfig,
    buildEngineResult,
    buildActiveDecision,
    legacyClarification,
  } = await import('../uni-engine/integration/testFixtures.js');
  const engine = buildEngineResult({
    decisionLayer: { decisionType: 'ask', nextDecisionType: 'ask', risk: 'LOW', confidence: 0.9 },
    comparison: { missingFields: ['amount'], agreementMetrics: { divergenceCount: 0 } },
    activation: {
      enabled: true,
      shadowMode: false,
      environment: 'development',
      decisions: [buildActiveDecision('QUESTION_GUIDANCE')],
    },
  });
  const integrationSnapshot = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification(),
    engineResult: engine,
    context: { isDev: true, confidence: 0.9, risk: 'LOW', dataSufficient: true },
  });
  const guidanceSnapshot = buildGuidanceSnapshot({
    legacy: legacyClarification(),
    engineResult: engine,
    context: { isDev: true },
  });
  const snapshot = buildObservationSnapshot({
    integrationSnapshot,
    guidanceSnapshot,
    activationSnapshot: engine.activation,
    context: { isDev: true, environment: 'development' },
  });
  assert.equal(snapshot.mode, 'observational');
  assert.equal(snapshot.legacyPreserved, true);
  assert.equal(snapshot.integrationSnapshot != null, true);
  assert.equal(snapshot.guidanceSnapshot != null, true);
  assert.equal(snapshot.activationSnapshot != null, true);
  assert.doesNotThrow(() => JSON.stringify(snapshot));
  const again = buildObservationSnapshot({
    integrationSnapshot,
    guidanceSnapshot,
    activationSnapshot: engine.activation,
    context: { isDev: true, environment: 'development' },
  });
  assert.equal(JSON.stringify(again), JSON.stringify(snapshot));
});

// PARTE 2 — BLOCO 5: estabilização — ciclo de vida dos refs observacionais.
// Todo novo turno zera os quatro refs de análise (shadow, integração,
// guidance, observação) antes de registrar o turno do usuário; o guard de
// deduplicação NÃO é zerado (ele persiste por mensagem do usuário).
test('BLOCO 5: novo turno zera TODOS os refs observacionais (shadow, integration, guidance, observation)', async () => {
  const page = await source('UniChatPage.jsx');
  const sendBlock = betweenMarkers(
    page,
    'lastEngineTurnRef.current = {',
    'const pendingActionIntent = (pendingAction ?? financialConversation.state.action)?.intent;',
  );
   assert.match(sendBlock, /lastEngineIntegrationResultRef\.current = null;/);
   assert.match(sendBlock, /lastGuidanceSnapshotRef\.current = null;/);
   assert.match(sendBlock, /lastObservationSnapshotRef\.current = null;/);
   const observationReset = sendBlock.indexOf('lastObservationSnapshotRef.current = null;');
   assert.ok(observationReset !== -1);
});

test('BLOCO 5: guard de deduplicação NÃO é zerado no novo turno -- persiste por mensagem do usuário', async () => {
  const page = await source('UniChatPage.jsx');
  const sendBlock = betweenMarkers(
    page,
    'lastEngineTurnRef.current = {',
    'const pendingActionIntent = (pendingAction ?? financialConversation.state.action)?.intent;',
  );
  assert.doesNotMatch(sendBlock, /lastEngineAnalyzedMessageIdRef\.current = null;/);
});

test('BLOCO 5: catch do runEngineObservational zera os quatro refs juntos (falha segura consistente)', async () => {
  const page = await source('UniChatPage.jsx');
  const runBlock = betweenMarkers(
    page,
    'const runEngineObservational = useCallback',
    'const applyEngineGuidanceToResponse = useCallback',
  );
  const catchStart = runBlock.indexOf('} catch {');
  const catchSlice = runBlock.slice(catchStart);
  assert.match(catchSlice, /lastEngineIntegrationResultRef\.current = null;/);
  assert.match(catchSlice, /lastGuidanceSnapshotRef\.current = null;/);
  assert.match(catchSlice, /lastObservationSnapshotRef\.current = null;/);
});

test('BLOCO 5: financialStateRef é sincronizado por um ÚNICO efeito -- sem duplicação', async () => {
  const page = await source('UniChatPage.jsx');
  const syncBlock = betweenMarkers(
    page,
    'financialContext.snapshot.accountBalancesById,',
    'const saveAccountForDependency = accountState.saveAccount;',
  );
  const effectCount = (syncBlock.match(/financialStateRef\.current = financialConversation\.state;/g) || []).length;
  assert.equal(effectCount, 1, `esperado 1 sincronização, encontradas ${effectCount}`);
});

// ============================================================================
// PARTE 3 — DECISION READINESS: camada observacional de prontidão técnica.
// O readiness consome o Observation Snapshot (Parte 2) + decisão da
// Decision Layer + decisões de Activation, tudo via ref dedicado, SEM
// aplicar nada, SEM state React, SEM persistência. Nunca re-executa a
// Decision Layer nem a Activation Engine.
// ============================================================================

test('BLOCO 3: readiness é importado e o ref dedicado existe ao lado dos refs observacionais', async () => {
  const page = await source('UniChatPage.jsx');
  const importLine = page.match(/import \{[\s\S]*?\} from '\.\.\/uni-engine\/index\.js';/)[0];
  assert.match(importLine, /buildDecisionReadinessSnapshot/);
  const refBlock = betweenMarkers(
    page,
    'const lastObservationSnapshotRef = useRef(null);',
    'const lastEngineAnalyzedMessageIdRef = useRef(null);',
  );
  assert.match(refBlock, /const lastDecisionReadinessSnapshotRef = useRef\(null\);/);
});

test('BLOCO 3: readiness é construído DEPOIS do observation snapshot e consome a decisão da Decision Layer', async () => {
  const page = await source('UniChatPage.jsx');
  const runBlock = betweenMarkers(
    page,
    'const runEngineObservational = useCallback',
    'const applyEngineGuidanceToResponse = useCallback',
  );
  assert.match(runBlock, /const buildConversationReadinessSnapshot = \(/);
  assert.match(runBlock, /if \(!observationSnapshot\) return null;/);
  assert.match(runBlock, /buildDecisionReadinessSnapshot\(\{/);
  assert.match(runBlock, /observationSnapshot,\s*\n\s*decisionSnapshot,/);
  const observationAssign = runBlock.indexOf('lastObservationSnapshotRef.current = buildConversationObservationSnapshot({');
  const readinessAssign = runBlock.indexOf('lastDecisionReadinessSnapshotRef.current = buildConversationReadinessSnapshot({');
  assert.ok(observationAssign !== -1, 'observation atribui ao ref dedicado');
  assert.ok(readinessAssign !== -1, 'readiness atribui ao ref dedicado');
  assert.ok(readinessAssign > observationAssign, 'readiness é construída após o observation snapshot');
  const readinessAssignBlock = runBlock.slice(readinessAssign, readinessAssign + 400);
  assert.match(readinessAssignBlock, /observationSnapshot: lastObservationSnapshotRef\.current,/);
  assert.match(readinessAssignBlock, /decisionSnapshot: shadow\?\.decisionLayer \?\? null,/);
});

test('BLOCO 3: readiness fica SOMENTE em ref -- nenhum state, renderização, aplicação ou persistência', async () => {
  const page = await source('UniChatPage.jsx');
  const runBlock = betweenMarkers(
    page,
    'const runEngineObservational = useCallback',
    'const applyEngineGuidanceToResponse = useCallback',
  );
  assert.match(runBlock, /lastDecisionReadinessSnapshotRef\.current = /);
  assert.doesNotMatch(runBlock, /setReadiness/);
  assert.doesNotMatch(runBlock, /useState\(/);
  assert.doesNotMatch(runBlock, /applyEngineGuidanceToResponse/);
  assert.doesNotMatch(runBlock, /executeFinancialIntentAction/);
  assert.doesNotMatch(runBlock, /\.rpc\(/);
  assert.doesNotMatch(runBlock, /localStorage/);
  assert.doesNotMatch(runBlock, /syncMessageToSupabase/);
  assert.doesNotMatch(runBlock, /uniVoice\.speak/);
});

test('BLOCO 3: helper local tem falha segura -- erro na construção não quebra o chat', async () => {
  const page = await source('UniChatPage.jsx');
  const runBlock = betweenMarkers(
    page,
    'const runEngineObservational = useCallback',
    'const applyEngineGuidanceToResponse = useCallback',
  );
  const helperStart = runBlock.indexOf('const buildConversationReadinessSnapshot = (');
  const helperBlock = runBlock.slice(helperStart, helperStart + 500);
  assert.match(helperBlock, /if \(!observationSnapshot\) return null;/);
  assert.match(helperBlock, /\} catch \{\s*\n\s*return null;\s*\n\s*\}/);
});

test('BLOCO 3: novo turno zera o ref de readiness junto com os demais refs observacionais', async () => {
  const page = await source('UniChatPage.jsx');
  const sendBlock = betweenMarkers(
    page,
    'lastEngineTurnRef.current = {',
    'const pendingActionIntent = (pendingAction ?? financialConversation.state.action)?.intent;',
  );
  assert.match(sendBlock, /lastObservationSnapshotRef\.current = null;/);
  assert.match(sendBlock, /lastDecisionReadinessSnapshotRef\.current = null;/);
  const observationReset = sendBlock.indexOf('lastObservationSnapshotRef.current = null;');
  const readinessReset = sendBlock.indexOf('lastDecisionReadinessSnapshotRef.current = null;');
  assert.ok(readinessReset > observationReset, 'readiness é zerado junto com os demais refs');
});

test('BLOCO 3: catch do runEngineObservational zera o ref de readiness (falha segura consistente)', async () => {
  const page = await source('UniChatPage.jsx');
  const runBlock = betweenMarkers(
    page,
    'const runEngineObservational = useCallback',
    'const applyEngineGuidanceToResponse = useCallback',
  );
  const catchStart = runBlock.indexOf('} catch {');
  const catchSlice = runBlock.slice(catchStart);
  assert.match(catchSlice, /lastObservationSnapshotRef\.current = null;/);
  assert.match(catchSlice, /lastDecisionReadinessSnapshotRef\.current = null;/);
});

// ============================================================================
// PARTE 4 — BLOCO 1: CAPABILITY ACTIVATION READINESS observacional.
// Determina, a partir das decisões de Activation JÁ produzidas, quais
// capabilities poderiam ser ativadas no futuro — sem nunca ativar nada, sem
// state React, sem persistência. Fluxo: Integration → Guidance → Observation
// → Decision Readiness → Capability Readiness.
// ============================================================================

test('BLOCO 1: capability readiness é importado e o ref dedicado existe ao lado dos demais', async () => {
  const page = await source('UniChatPage.jsx');
  const importLine = page.match(/import \{[\s\S]*?\} from '\.\.\/uni-engine\/index\.js';/)[0];
  assert.match(importLine, /buildCapabilityReadinessSnapshot/);
  const refBlock = betweenMarkers(
    page,
    'const lastDecisionReadinessSnapshotRef = useRef(null);',
    'const lastEngineAnalyzedMessageIdRef = useRef(null);',
  );
  assert.match(refBlock, /const lastCapabilityReadinessSnapshotRef = useRef\(null\);/);
});

test('BLOCO 1: capability readiness é construído DEPOIS do decision readiness', async () => {
  const page = await source('UniChatPage.jsx');
  const runBlock = betweenMarkers(
    page,
    'const runEngineObservational = useCallback',
    'const applyEngineGuidanceToResponse = useCallback',
  );
  assert.match(runBlock, /const buildConversationCapabilityReadinessSnapshot = \(/);
  assert.match(runBlock, /if \(!observationSnapshot\) return null;/);
  assert.match(runBlock, /buildCapabilityReadinessSnapshot\(\{/);
  const readinessAssign = runBlock.indexOf('lastDecisionReadinessSnapshotRef.current = buildConversationReadinessSnapshot({');
  const capabilityAssign = runBlock.indexOf('lastCapabilityReadinessSnapshotRef.current = buildConversationCapabilityReadinessSnapshot({');
  assert.ok(readinessAssign !== -1, 'decision readiness atribui ao ref dedicado');
  assert.ok(capabilityAssign !== -1, 'capability readiness atribui ao ref dedicado');
  assert.ok(capabilityAssign > readinessAssign, 'capability readiness é construída após o decision readiness');
  const capabilityBlock = runBlock.slice(capabilityAssign, capabilityAssign + 400);
  assert.match(capabilityBlock, /observationSnapshot: lastObservationSnapshotRef\.current,/);
  assert.match(capabilityBlock, /decisionReadinessSnapshot: lastDecisionReadinessSnapshotRef\.current \?\? null,/);
});

test('BLOCO 1: capability readiness fica SOMENTE em ref -- nenhum state, aplicação ou persistência', async () => {
  const page = await source('UniChatPage.jsx');
  const runBlock = betweenMarkers(
    page,
    'const runEngineObservational = useCallback',
    'const applyEngineGuidanceToResponse = useCallback',
  );
  assert.match(runBlock, /lastCapabilityReadinessSnapshotRef\.current = /);
  assert.doesNotMatch(runBlock, /setCapabilityReadiness/);
  assert.doesNotMatch(runBlock, /useState\(/);
  assert.doesNotMatch(runBlock, /applyEngineGuidanceToResponse/);
  assert.doesNotMatch(runBlock, /executeFinancialIntentAction/);
  assert.doesNotMatch(runBlock, /\.rpc\(/);
  assert.doesNotMatch(runBlock, /localStorage/);
  assert.doesNotMatch(runBlock, /syncMessageToSupabase/);
  assert.doesNotMatch(runBlock, /uniVoice\.speak/);
});

test('BLOCO 1: helper local tem falha segura -- erro na construção não quebra o chat', async () => {
  const page = await source('UniChatPage.jsx');
  const runBlock = betweenMarkers(
    page,
    'const runEngineObservational = useCallback',
    'const applyEngineGuidanceToResponse = useCallback',
  );
  const helperStart = runBlock.indexOf('const buildConversationCapabilityReadinessSnapshot = (');
  const helperBlock = runBlock.slice(helperStart, helperStart + 700);
  assert.match(helperBlock, /if \(!observationSnapshot\) return null;/);
  assert.match(helperBlock, /\} catch \{\s*\n\s*return null;\s*\n\s*\}/);
});

test('BLOCO 1: novo turno zera o ref de capability readiness junto com os demais', async () => {
  const page = await source('UniChatPage.jsx');
  const sendBlock = betweenMarkers(
    page,
    'lastEngineTurnRef.current = {',
    'const pendingActionIntent = (pendingAction ?? financialConversation.state.action)?.intent;',
  );
  assert.match(sendBlock, /lastDecisionReadinessSnapshotRef\.current = null;/);
  assert.match(sendBlock, /lastCapabilityReadinessSnapshotRef\.current = null;/);
  const readinessReset = sendBlock.indexOf('lastDecisionReadinessSnapshotRef.current = null;');
  const capabilityReset = sendBlock.indexOf('lastCapabilityReadinessSnapshotRef.current = null;');
  assert.ok(capabilityReset > readinessReset, 'capability readiness é zerado junto com os demais refs');
});

test('BLOCO 1: catch do runEngineObservational zera o ref de capability readiness', async () => {
  const page = await source('UniChatPage.jsx');
  const runBlock = betweenMarkers(
    page,
    'const runEngineObservational = useCallback',
    'const applyEngineGuidanceToResponse = useCallback',
  );
  const catchStart = runBlock.indexOf('} catch {');
  const catchSlice = runBlock.slice(catchStart);
  assert.match(catchSlice, /lastDecisionReadinessSnapshotRef\.current = null;/);
  assert.match(catchSlice, /lastCapabilityReadinessSnapshotRef\.current = null;/);
});

test('BLOCO 1: pipeline legado intacto -- nenhuma activation, confirmação, memória, TTS ou persistência', async () => {
  const page = await source('UniChatPage.jsx');
  const runBlock = betweenMarkers(
    page,
    'const runEngineObservational = useCallback',
    'const applyEngineGuidanceToResponse = useCallback',
  );
  assert.doesNotMatch(runBlock, /runActivationEngine/);
  assert.doesNotMatch(runBlock, /executeConfirmedFinancialAction/);
  assert.doesNotMatch(runBlock, /savePendingActionStack/);
  assert.doesNotMatch(runBlock, /handleAutomaticSpeakMessage/);
  assert.doesNotMatch(runBlock, /insertMessage/);
  assert.doesNotMatch(runBlock, /await saveDecision/);
  assert.doesNotMatch(runBlock, /confirmation\./);
  assert.doesNotMatch(runBlock, /provideInput/);
});

test('BLOCO 1: snapshot de capability readiness é serializável e determinístico', async () => {
  const { buildCapabilityReadinessSnapshot } = await import('../uni-engine/index.js');
  const { buildObservationSnapshot } = await import('../uni-engine/observation/buildObservationSnapshot.js');
  const { buildGuidanceSnapshot } = await import('../uni-engine/guidance/buildGuidanceSnapshot.js');
  const { runUniEngineIntegration } = await import('../uni-engine/integration/runUniEngineIntegration.js');
  const {
    buildIntegrationConfig,
    buildEngineResult,
    buildActiveDecision,
    legacyClarification,
  } = await import('../uni-engine/integration/testFixtures.js');
  const engine = buildEngineResult({
    decisionLayer: { decisionType: 'ask', nextDecisionType: 'ask', risk: 'LOW', confidence: 0.9 },
    comparison: { missingFields: ['amount'], agreementMetrics: { divergenceCount: 0 } },
    activation: {
      enabled: true,
      shadowMode: true,
      environment: 'development',
      decisions: [buildActiveDecision('QUESTION_GUIDANCE')],
    },
  });
  const legacy = legacyClarification();
  const integrationSnapshot = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy,
    engineResult: engine,
    context: { isDev: true, confidence: 0.9, risk: 'LOW', dataSufficient: true },
  });
  const guidanceSnapshot = buildGuidanceSnapshot({
    legacy,
    engineResult: engine,
    context: { isDev: true },
  });
  const observationSnapshot = buildObservationSnapshot({
    integrationSnapshot,
    guidanceSnapshot,
    activationSnapshot: engine.activation,
    context: { isDev: true, environment: 'development' },
  });
  const snapshot = buildCapabilityReadinessSnapshot({
    observationSnapshot,
    decisionReadinessSnapshot: { version: '1.0', mode: 'observational' },
    context: { isDev: true, environment: 'development' },
  });
  assert.equal(snapshot.mode, 'observational');
  assert.equal(snapshot.legacyPreserved, true);
  assert.equal(snapshot.applied, false);
  assert.equal(snapshot.shadowMode, true);
  assert.ok(snapshot.eligibleCapabilities.includes('QUESTION_GUIDANCE'));
  assert.doesNotThrow(() => JSON.stringify(snapshot));
  const again = buildCapabilityReadinessSnapshot({
    observationSnapshot,
    decisionReadinessSnapshot: { version: '1.0', mode: 'observational' },
    context: { isDev: true, environment: 'development' },
  });
  assert.equal(JSON.stringify(again), JSON.stringify(snapshot));
});

// ============================================================================
// PARTE 4 — BLOCO 2: EXECUTION READINESS observacional.
// Avalia se uma FUTURA execução seria segura — sem nunca executar nada, sem
// state React, sem persistência. Fluxo: Integration → Guidance → Observation
// → Decision Readiness → Capability Readiness → Execution Readiness.
// ============================================================================

test('BLOCO 2: execution readiness é importado e o ref dedicado existe ao lado dos demais', async () => {
  const page = await source('UniChatPage.jsx');
  const importLine = page.match(/import \{[\s\S]*?\} from '\.\.\/uni-engine\/index\.js';/)[0];
  assert.match(importLine, /buildExecutionReadinessSnapshot/);
  const refBlock = betweenMarkers(
    page,
    'const lastCapabilityReadinessSnapshotRef = useRef(null);',
    'const lastEngineAnalyzedMessageIdRef = useRef(null);',
  );
  assert.match(refBlock, /const lastExecutionReadinessSnapshotRef = useRef\(null\);/);
});

test('BLOCO 2: execution readiness é construído DEPOIS do capability readiness', async () => {
  const page = await source('UniChatPage.jsx');
  const runBlock = betweenMarkers(
    page,
    'const runEngineObservational = useCallback',
    'const applyEngineGuidanceToResponse = useCallback',
  );
  assert.match(runBlock, /const buildConversationExecutionReadinessSnapshot = \(/);
  assert.match(runBlock, /if \(!observationSnapshot\) return null;/);
  assert.match(runBlock, /buildExecutionReadinessSnapshot\(\{/);
  const capabilityAssign = runBlock.indexOf('lastCapabilityReadinessSnapshotRef.current = buildConversationCapabilityReadinessSnapshot({');
  const executionAssign = runBlock.indexOf('lastExecutionReadinessSnapshotRef.current = buildConversationExecutionReadinessSnapshot({');
  assert.ok(capabilityAssign !== -1, 'capability readiness atribui ao ref dedicado');
  assert.ok(executionAssign !== -1, 'execution readiness atribui ao ref dedicado');
  assert.ok(executionAssign > capabilityAssign, 'execution readiness é construída após o capability readiness');
  const executionBlock = runBlock.slice(executionAssign, executionAssign + 400);
  assert.match(executionBlock, /observationSnapshot: lastObservationSnapshotRef\.current,/);
  assert.match(executionBlock, /decisionReadinessSnapshot: lastDecisionReadinessSnapshotRef\.current \?\? null,/);
  assert.match(executionBlock, /capabilityReadinessSnapshot: lastCapabilityReadinessSnapshotRef\.current \?\? null,/);
});

test('BLOCO 2: execution readiness fica SOMENTE em ref -- nenhum state, execução ou persistência', async () => {
  const page = await source('UniChatPage.jsx');
  const runBlock = betweenMarkers(
    page,
    'const runEngineObservational = useCallback',
    'const applyEngineGuidanceToResponse = useCallback',
  );
  assert.match(runBlock, /lastExecutionReadinessSnapshotRef\.current = /);
  assert.doesNotMatch(runBlock, /setExecutionReadiness/);
  assert.doesNotMatch(runBlock, /useState\(/);
  assert.doesNotMatch(runBlock, /executeFinancialIntentAction/);
  assert.doesNotMatch(runBlock, /executeConfirmedFinancialAction/);
  assert.doesNotMatch(runBlock, /\.rpc\(/);
  assert.doesNotMatch(runBlock, /localStorage/);
  assert.doesNotMatch(runBlock, /syncMessageToSupabase/);
  assert.doesNotMatch(runBlock, /uniVoice\.speak/);
});

test('BLOCO 2: helper local tem falha segura -- erro na construção não quebra o chat', async () => {
  const page = await source('UniChatPage.jsx');
  const runBlock = betweenMarkers(
    page,
    'const runEngineObservational = useCallback',
    'const applyEngineGuidanceToResponse = useCallback',
  );
  const helperStart = runBlock.indexOf('const buildConversationExecutionReadinessSnapshot = (');
  const helperBlock = runBlock.slice(helperStart, helperStart + 700);
  assert.match(helperBlock, /if \(!observationSnapshot\) return null;/);
  assert.match(helperBlock, /\} catch \{\s*\n\s*return null;\s*\n\s*\}/);
});

test('BLOCO 2: novo turno zera o ref de execution readiness junto com os demais', async () => {
  const page = await source('UniChatPage.jsx');
  const sendBlock = betweenMarkers(
    page,
    'lastEngineTurnRef.current = {',
    'const pendingActionIntent = (pendingAction ?? financialConversation.state.action)?.intent;',
  );
  assert.match(sendBlock, /lastCapabilityReadinessSnapshotRef\.current = null;/);
  assert.match(sendBlock, /lastExecutionReadinessSnapshotRef\.current = null;/);
  const capabilityReset = sendBlock.indexOf('lastCapabilityReadinessSnapshotRef.current = null;');
  const executionReset = sendBlock.indexOf('lastExecutionReadinessSnapshotRef.current = null;');
  assert.ok(executionReset > capabilityReset, 'execution readiness é zerado junto com os demais refs');
});

test('BLOCO 2: catch do runEngineObservational zera o ref de execution readiness', async () => {
  const page = await source('UniChatPage.jsx');
  const runBlock = betweenMarkers(
    page,
    'const runEngineObservational = useCallback',
    'const applyEngineGuidanceToResponse = useCallback',
  );
  const catchStart = runBlock.indexOf('} catch {');
  const catchSlice = runBlock.slice(catchStart);
  assert.match(catchSlice, /lastCapabilityReadinessSnapshotRef\.current = null;/);
  assert.match(catchSlice, /lastExecutionReadinessSnapshotRef\.current = null;/);
});

test('BLOCO 2: pipeline legado intacto -- nenhuma execução, activation, confirmação, memória ou TTS', async () => {
  const page = await source('UniChatPage.jsx');
  const runBlock = betweenMarkers(
    page,
    'const runEngineObservational = useCallback',
    'const applyEngineGuidanceToResponse = useCallback',
  );
  assert.doesNotMatch(runBlock, /runActivationEngine/);
  assert.doesNotMatch(runBlock, /runDecisionLayer/);
  assert.doesNotMatch(runBlock, /savePendingActionStack/);
  assert.doesNotMatch(runBlock, /handleAutomaticSpeakMessage/);
  assert.doesNotMatch(runBlock, /insertMessage/);
  assert.doesNotMatch(runBlock, /await saveDecision/);
  assert.doesNotMatch(runBlock, /confirmation\./);
  assert.doesNotMatch(runBlock, /provideInput/);
});

test('BLOCO 2: snapshot de execution readiness é serializável e determinístico', async () => {
  const { buildExecutionReadinessSnapshot } = await import('../uni-engine/index.js');
  const { buildObservationSnapshot } = await import('../uni-engine/observation/buildObservationSnapshot.js');
  const { buildGuidanceSnapshot } = await import('../uni-engine/guidance/buildGuidanceSnapshot.js');
  const { runUniEngineIntegration } = await import('../uni-engine/integration/runUniEngineIntegration.js');
  const { buildCapabilityReadinessSnapshot } = await import('../uni-engine/capability-readiness/buildCapabilityReadinessSnapshot.js');
  const {
    buildIntegrationConfig,
    buildEngineResult,
    buildActiveDecision,
    legacyClarification,
  } = await import('../uni-engine/integration/testFixtures.js');
  const engine = buildEngineResult({
    decisionLayer: { decisionType: 'ask', nextDecisionType: 'ask', risk: 'LOW', confidence: 0.9 },
    comparison: { missingFields: ['amount'], agreementMetrics: { divergenceCount: 0 } },
    activation: {
      enabled: true,
      shadowMode: true,
      environment: 'development',
      decisions: [buildActiveDecision('QUESTION_GUIDANCE')],
    },
  });
  const legacy = legacyClarification();
  const integrationSnapshot = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy,
    engineResult: engine,
    context: { isDev: true, confidence: 0.9, risk: 'LOW', dataSufficient: true },
  });
  const guidanceSnapshot = buildGuidanceSnapshot({
    legacy,
    engineResult: engine,
    context: { isDev: true },
  });
  const observationSnapshot = buildObservationSnapshot({
    integrationSnapshot,
    guidanceSnapshot,
    activationSnapshot: engine.activation,
    context: { isDev: true, environment: 'development' },
  });
  const capabilityReadinessSnapshot = buildCapabilityReadinessSnapshot({
    observationSnapshot,
    decisionReadinessSnapshot: { version: '1.0', mode: 'observational', decisionStatus: 'ASK' },
    context: { isDev: true, environment: 'development' },
  });
  const snapshot = buildExecutionReadinessSnapshot({
    observationSnapshot,
    decisionReadinessSnapshot: {
      version: '1.0',
      mode: 'observational',
      decisionAvailable: true,
      decisionStatus: 'ASK',
      confidence: 0.9,
      risk: 'LOW',
      missingInformation: ['amount'],
      circuitBreakerStatus: { open: false, openCapabilities: [] },
    },
    capabilityReadinessSnapshot,
    context: { isDev: true, environment: 'development' },
  });
  assert.equal(snapshot.mode, 'observational');
  assert.equal(snapshot.legacyPreserved, true);
  assert.equal(snapshot.applied, false);
  assert.equal(snapshot.shadowMode, true);
  assert.equal(snapshot.executionAvailable, false);
  assert.ok(snapshot.requiredCapabilities.includes('FINANCIAL_EXECUTION'));
  assert.doesNotThrow(() => JSON.stringify(snapshot));
  const again = buildExecutionReadinessSnapshot({
    observationSnapshot,
    decisionReadinessSnapshot: {
      version: '1.0',
      mode: 'observational',
      decisionAvailable: true,
      decisionStatus: 'ASK',
      confidence: 0.9,
      risk: 'LOW',
      missingInformation: ['amount'],
      circuitBreakerStatus: { open: false, openCapabilities: [] },
    },
    capabilityReadinessSnapshot,
    context: { isDev: true, environment: 'development' },
  });
  assert.equal(JSON.stringify(again), JSON.stringify(snapshot));
});

// ============================================================================
// PARTE 5 — BLOCO 1: APPLICATION (primeira ativação controlada).
// Aplica SOMENTE RESPONSE_STYLE_GUIDANCE e RESPONSE_LENGTH_GUIDANCE, em DEV,
// com Integration + Activation habilitadas e usuário autorizado. O resultado
// fica SOMENTE em ref dedicado — nada é persistido, nada executa.
// PARTE 5 — BLOCO 4: a resposta visível passa a ser selecionada com segurança
// no ponto ÚNICO de saída (applyEngineGuidanceToResponse): o finalText só
// substitui o texto legado quando selectControlledVisibleResponse aprovar,
// usando o resultado FRESCO da MESMA execução (retorno direto, nunca um ref
// antigo). Qualquer falha → texto legado intacto.
// ============================================================================

test('PARTE 5: application é importado e o ref dedicado existe ao lado dos demais', async () => {
  const page = await source('UniChatPage.jsx');
  const importLine = page.match(/import \{[\s\S]*?\} from '\.\.\/uni-engine\/index\.js';/)[0];
  assert.match(importLine, /runControlledGuidanceApplication/);
  const refBlock = betweenMarkers(
    page,
    'const lastExecutionReadinessSnapshotRef = useRef(null);',
    'const lastEngineAnalyzedMessageIdRef = useRef(null);',
  );
  assert.match(refBlock, /const lastApplicationResultRef = useRef\(null\);/);
});

test('PARTE 5: application é executado DEPOIS do execution readiness', async () => {
  const page = await source('UniChatPage.jsx');
  const runBlock = betweenMarkers(
    page,
    'const runEngineObservational = useCallback',
    'const applyEngineGuidanceToResponse = useCallback',
  );
  assert.match(runBlock, /runControlledGuidanceApplication\(\{/);
  const executionAssign = runBlock.indexOf('lastExecutionReadinessSnapshotRef.current = buildConversationExecutionReadinessSnapshot({');
  const applicationAssign = runBlock.indexOf('lastApplicationResultRef.current = runControlledGuidanceApplication({');
  assert.ok(executionAssign !== -1, 'execution readiness atribui ao ref dedicado');
  assert.ok(applicationAssign !== -1, 'application atribui ao ref dedicado');
  assert.ok(applicationAssign > executionAssign, 'application é executada após o execution readiness');
  const applicationBlock = runBlock.slice(applicationAssign, applicationAssign + 400);
  assert.match(applicationBlock, /config: uniEngine\.getConfig\(\),/);
  assert.match(applicationBlock, /legacy: legacyResult,/);
  assert.match(applicationBlock, /engineResult: shadow,/);
  assert.match(applicationBlock, /guidance: lastGuidanceSnapshotRef\.current \?\? null,/);
});

test('PARTE 5: application fica SOMENTE em ref -- nenhum state, execução ou persistência', async () => {
  const page = await source('UniChatPage.jsx');
  const runBlock = betweenMarkers(
    page,
    'const runEngineObservational = useCallback',
    'const applyEngineGuidanceToResponse = useCallback',
  );
  assert.match(runBlock, /lastApplicationResultRef\.current = /);
  assert.doesNotMatch(runBlock, /setApplicationResult/);
  assert.doesNotMatch(runBlock, /useState\(/);
  assert.doesNotMatch(runBlock, /executeFinancialIntentAction/);
  assert.doesNotMatch(runBlock, /executeConfirmedFinancialAction/);
  assert.doesNotMatch(runBlock, /\.rpc\(/);
  assert.doesNotMatch(runBlock, /localStorage/);
  assert.doesNotMatch(runBlock, /syncMessageToSupabase/);
  assert.doesNotMatch(runBlock, /uniVoice\.speak/);
});

test('PARTE 5 BLOCO 4: resposta visível vem da seleção segura -- seletor importado da engine', async () => {
  const page = await source('UniChatPage.jsx');
  const importLine = page.match(/import \{[\s\S]*?\} from '\.\.\/uni-engine\/index\.js';/)[0];
  assert.match(importLine, /selectControlledVisibleResponse/);
});

test('PARTE 5 BLOCO 4: runEngineObservational RETORNA o resultado fresco da application (nunca um ref antigo)', async () => {
  const page = await source('UniChatPage.jsx');
  const runBlock = betweenMarkers(
    page,
    'const runEngineObservational = useCallback',
    'const applyEngineGuidanceToResponse = useCallback',
  );
  assert.match(runBlock, /if \(!turn \|\| !turn\.userMessageId\) return null;/);
  assert.match(runBlock, /if \(lastEngineAnalyzedMessageIdRef\.current === turn\.userMessageId\) return lastApplicationResultRef\.current;/);
  assert.match(runBlock, /return lastApplicationResultRef\.current;/);
  const catchStart = runBlock.indexOf('} catch {');
  assert.match(runBlock.slice(catchStart), /return null;/);
});

test('PARTE 5 BLOCO 4: applyEngineGuidanceToResponse usa o RETORNO do mesmo turno e o seletor', async () => {
  const page = await source('UniChatPage.jsx');
  const guidedBlock = betweenMarkers(
    page,
    'const applyEngineGuidanceToResponse = useCallback',
    'const buildGuidedUniMessage = useCallback',
  );
  assert.match(guidedBlock, /const applicationResult = runEngineObservational\(legacyText, options\);/);
  assert.match(guidedBlock, /if \(!applicationResult\) return legacyText;/);
  assert.match(guidedBlock, /selectControlledVisibleResponse\(\{/);
  assert.doesNotMatch(guidedBlock, /lastApplicationResultRef/);
});

test('PARTE 5 BLOCO 4: seletor recebe legacy, resultado fresco, config, ambiente, autorização e execution readiness', async () => {
  const page = await source('UniChatPage.jsx');
  const guidedBlock = betweenMarkers(
    page,
    'const applyEngineGuidanceToResponse = useCallback',
    'const buildGuidedUniMessage = useCallback',
  );
  assert.match(guidedBlock, /legacyText,/);
  assert.match(guidedBlock, /applicationResult,/);
  assert.match(guidedBlock, /config: uniEngine\.getConfig\(\),/);
  assert.match(guidedBlock, /environment: import\.meta\.env\.DEV \? 'development' : 'production',/);
  assert.match(guidedBlock, /authorized: Boolean\(/);
  assert.match(guidedBlock, /activationTestUserIds/);
  assert.match(guidedBlock, /executionReady:/);
  assert.match(guidedBlock, /lastExecutionReadinessSnapshotRef\.current\?\.executionBlockedReasons/);
});

test('PARTE 5 BLOCO 4: nenhum state, persistência, duplicidade de mensagem, execução ou TTS no ponto de saída', async () => {
  const page = await source('UniChatPage.jsx');
  const guidedBlock = betweenMarkers(
    page,
    'const applyEngineGuidanceToResponse = useCallback',
    'const buildGuidedUniMessage = useCallback',
  );
  assert.match(guidedBlock, /return legacyText;/);
  assert.doesNotMatch(guidedBlock, /setMessages|setState|useState\(/);
  assert.doesNotMatch(guidedBlock, /syncMessageToSupabase/);
  assert.doesNotMatch(guidedBlock, /localStorage/);
  assert.doesNotMatch(guidedBlock, /\.rpc\(/);
  assert.doesNotMatch(guidedBlock, /pushMessage/);
  assert.doesNotMatch(guidedBlock, /executeFinancialIntentAction|executeConfirmedFinancialAction/);
  assert.doesNotMatch(guidedBlock, /uniVoice\.speak/);
  assert.doesNotMatch(guidedBlock, /result\.finalText/);
});

test('PARTE 5 BLOCO 4: contexto da application reforça confiança, risco e circuit breaker do mesmo turno', async () => {
  const page = await source('UniChatPage.jsx');
  const runBlock = betweenMarkers(
    page,
    'const runEngineObservational = useCallback',
    'const applyEngineGuidanceToResponse = useCallback',
  );
  const applicationAssign = runBlock.indexOf('lastApplicationResultRef.current = runControlledGuidanceApplication({');
  const applicationBlock = runBlock.slice(applicationAssign, applicationAssign + 1100);
  assert.match(applicationBlock, /confidence: typeof shadow\?\.decisionLayer\?\.confidence === 'number'/);
  assert.match(applicationBlock, /risk: typeof shadow\?\.decisionLayer\?\.risk === 'string'/);
  assert.match(applicationBlock, /circuitBreakerOpen: \(lastExecutionReadinessSnapshotRef\.current\?\.executionBlockedReasons \?\? \[\]\)/);
});

test('PARTE 5: buildGuidedUniMessage passa o texto orientado ao buildUniMessage (ponto único de saída)', async () => {
  const page = await source('UniChatPage.jsx');
  const buildBlock = betweenMarkers(
    page,
    'const buildGuidedUniMessage = useCallback',
    'const { createAssistantResponse } = useUniResponsePipeline',
  );
  assert.match(buildBlock, /applyEngineGuidanceToResponse\(text, messageOptions\)/);
});

test('PARTE 5: novo turno zera o ref de application junto com os demais', async () => {
  const page = await source('UniChatPage.jsx');
  const sendBlock = betweenMarkers(
    page,
    'lastEngineTurnRef.current = {',
    'const pendingActionIntent = (pendingAction ?? financialConversation.state.action)?.intent;',
  );
  assert.match(sendBlock, /lastExecutionReadinessSnapshotRef\.current = null;/);
  assert.match(sendBlock, /lastApplicationResultRef\.current = null;/);
  const executionReset = sendBlock.indexOf('lastExecutionReadinessSnapshotRef.current = null;');
  const applicationReset = sendBlock.indexOf('lastApplicationResultRef.current = null;');
  assert.ok(applicationReset > executionReset, 'application é zerado junto com os demais refs');
});

test('PARTE 5: catch do runEngineObservational zera o ref de application', async () => {
  const page = await source('UniChatPage.jsx');
  const runBlock = betweenMarkers(
    page,
    'const runEngineObservational = useCallback',
    'const applyEngineGuidanceToResponse = useCallback',
  );
  const catchStart = runBlock.indexOf('} catch {');
  const catchSlice = runBlock.slice(catchStart);
  assert.match(catchSlice, /lastExecutionReadinessSnapshotRef\.current = null;/);
  assert.match(catchSlice, /lastApplicationResultRef\.current = null;/);
});

// ============================================================================
// PARTE 7 — CONVERSATION PLANNER observacional.
// Determina QUAL deve ser o próximo passo lógico da conversa (NEXT_STEP_*),
// consumindo SOMENTE os snapshots já existentes (Observation → Guidance →
// Decision → Capability Readiness → Execution Readiness → Application →
// Conversation Planner). Nunca gera texto, nunca executa, nunca altera o
// pipeline legado. Fluxo: ... → Application → Conversation Planner → retorno
// observacional.
// ============================================================================

test('PARTE 7: conversation planner importado e o ref dedicado existe ao lado dos demais', async () => {
  const page = await source('UniChatPage.jsx');
  const importLine = page.match(/import \{[\s\S]*?\} from '\.\.\/uni-engine\/index\.js';/)[0];
  assert.match(importLine, /buildConversationPlanSnapshot/);
  const refBlock = betweenMarkers(
    page,
    'const lastApplicationResultRef = useRef(null);',
    'useEffect(() => {',
  );
  assert.match(refBlock, /const lastConversationPlannerSnapshotRef = useRef\(null\);/);
});

test('PARTE 7: planner é construído DEPOIS da application (fluxo observacional completo)', async () => {
  const page = await source('UniChatPage.jsx');
  const runBlock = betweenMarkers(
    page,
    'const runEngineObservational = useCallback',
    'const applyEngineGuidanceToResponse = useCallback',
  );
  assert.match(runBlock, /const buildConversationPlannerSnapshot = \(\{/);
  assert.match(runBlock, /buildConversationPlanSnapshot\(\{/);
  const applicationAssign = runBlock.indexOf('lastApplicationResultRef.current = runControlledGuidanceApplication({');
  const plannerAssign = runBlock.indexOf('lastConversationPlannerSnapshotRef.current = buildConversationPlannerSnapshot({');
  assert.ok(applicationAssign !== -1, 'application atribui ao ref dedicado');
  assert.ok(plannerAssign !== -1, 'conversation planner atribui ao ref dedicado');
  assert.ok(plannerAssign > applicationAssign, 'conversation planner é construído após a application');
  const plannerBlock = runBlock.slice(plannerAssign, plannerAssign + 700);
  assert.match(plannerBlock, /observationSnapshot: lastObservationSnapshotRef\.current,/);
  assert.match(plannerBlock, /decisionSnapshot: shadow\?\.decisionLayer \?\? null,/);
  assert.match(plannerBlock, /decisionReadinessSnapshot: lastDecisionReadinessSnapshotRef\.current \?\? null,/);
  assert.match(plannerBlock, /capabilityReadinessSnapshot: lastCapabilityReadinessSnapshotRef\.current \?\? null,/);
  assert.match(plannerBlock, /executionReadinessSnapshot: lastExecutionReadinessSnapshotRef\.current \?\? null,/);
  assert.match(plannerBlock, /applicationResult: lastApplicationResultRef\.current,/);
});

test('PARTE 7: snapshot do planner fica SOMENTE em ref -- nenhum state, execução, texto ou persistência', async () => {
  const page = await source('UniChatPage.jsx');
  const runBlock = betweenMarkers(
    page,
    'const runEngineObservational = useCallback',
    'const applyEngineGuidanceToResponse = useCallback',
  );
  assert.doesNotMatch(runBlock, /runActivationEngine/);
  assert.doesNotMatch(runBlock, /executeConfirmedFinancialAction/);
  assert.doesNotMatch(runBlock, /savePendingActionStack/);
  assert.doesNotMatch(runBlock, /syncMessageToSupabase/);
  assert.doesNotMatch(runBlock, /insertMessage/);
  assert.doesNotMatch(runBlock, /localStorage/);
  assert.doesNotMatch(runBlock, /\.rpc\(/);
  assert.doesNotMatch(runBlock, /return lastConversationPlannerSnapshotRef\.current;/);
  assert.doesNotMatch(runBlock, /conversationPlannerSnapshotRef\.current.*(finalText|text:)/);
  assert.doesNotMatch(runBlock, /uniVoice\.speak/);
});

test('PARTE 7: snapshot do planner é serializável e determinístico (fluxo real)', async () => {
  const {
    createUniEngineConfig,
    runUniEngineIntegration,
    buildGuidanceSnapshot,
    buildObservationSnapshot,
    runControlledGuidanceApplication,
    buildConversationPlanSnapshot,
  } = await import('../uni-engine/index.js');
  const {
    buildEngineResult,
    buildActiveDecision,
    legacyClarification,
    buildIntegrationConfig,
  } = await import('../uni-engine/integration/testFixtures.js');
  const legacy = legacyClarification();
  const engine = buildEngineResult({
    decisionLayer: { decisionType: 'ask', nextDecisionType: 'ask', risk: 'LOW', confidence: 0.9 },
    comparison: { missingFields: ['account'], agreementMetrics: { divergenceCount: 0 } },
    activation: {
      enabled: true,
      shadowMode: true,
      environment: 'development',
      decisions: [buildActiveDecision('QUESTION_GUIDANCE')],
    },
  });
  const integrationSnapshot = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy,
    engineResult: engine,
    context: { isDev: true, confidence: 0.9, risk: 'LOW', dataSufficient: true },
  });
  const guidanceSnapshot = buildGuidanceSnapshot({
    legacy,
    engineResult: engine,
    context: { isDev: true },
  });
  const observationSnapshot = buildObservationSnapshot({
    integrationSnapshot,
    guidanceSnapshot,
    activationSnapshot: engine.activation,
    context: { isDev: true, environment: 'development' },
  });
  const config = createUniEngineConfig({
    env: {
      VITE_UNI_ENGINE_ENABLED: 'true',
      VITE_UNI_ENGINE_SHADOW_MODE: 'true',
      VITE_UNI_ENGINE_ACTIVATION_ENABLED: 'true',
      VITE_UNI_ENGINE_ACTIVATION_SHADOW: 'false',
      VITE_UNI_ENGINE_ACTIVATION_ENVIRONMENTS: 'development',
      VITE_UNI_ENGINE_ACTIVATION_TEST_USER_IDS: 'test-user-1',
      VITE_UNI_ENGINE_CAP_QUESTION_GUIDANCE: 'true',
      VITE_UNI_ENGINE_INTEGRATION_ENABLED: 'true',
      VITE_UNI_ENGINE_INTEGRATION_SHADOW: 'false',
      VITE_UNI_ENGINE_APPLICATION_ENABLED: 'true',
      VITE_UNI_ENGINE_APPLICATION_TELEMETRY: 'false',
    },
  });
  const applicationResult = runControlledGuidanceApplication({
    config,
    legacy,
    engineResult: engine,
    context: { isDev: true, environment: 'development', userId: 'test-user-1' },
  });
  const inputs = {
    observationSnapshot,
    decisionSnapshot: engine.decisionLayer,
    applicationResult,
    context: { isDev: true, environment: 'development' },
  };
  const snapshot = buildConversationPlanSnapshot(inputs);
  assert.equal(snapshot.mode, 'observational');
  assert.equal(snapshot.plannerStatus, 'PLANNED');
  assert.equal(snapshot.nextStep, 'NEXT_STEP_QUESTION');
  assert.equal(snapshot.legacyPreserved, true);
  assert.equal(snapshot.applied, false);
  assert.equal(snapshot.shadowMode, true);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.doesNotThrow(() => JSON.stringify(snapshot));
  const again = buildConversationPlanSnapshot(inputs);
  assert.equal(JSON.stringify(again), JSON.stringify(snapshot));
});

test('PARTE 7: novo turno zera o ref do planner junto com os demais', async () => {
  const page = await source('UniChatPage.jsx');
  const sendBlock = betweenMarkers(
    page,
    'lastEngineTurnRef.current = {',
    'const pendingActionIntent = (pendingAction ?? financialConversation.state.action)?.intent;',
  );
  assert.match(sendBlock, /lastApplicationResultRef\.current = null;/);
  assert.match(sendBlock, /lastConversationPlannerSnapshotRef\.current = null;/);
  const applicationReset = sendBlock.indexOf('lastApplicationResultRef.current = null;');
  const plannerReset = sendBlock.indexOf('lastConversationPlannerSnapshotRef.current = null;');
  assert.ok(plannerReset > applicationReset, 'planner é zerado junto com os demais refs');
});

test('PARTE 7: catch do runEngineObservational zera o ref do planner', async () => {
  const page = await source('UniChatPage.jsx');
  const runBlock = betweenMarkers(
    page,
    'const runEngineObservational = useCallback',
    'const applyEngineGuidanceToResponse = useCallback',
  );
  const catchStart = runBlock.indexOf('} catch {');
  const catchSlice = runBlock.slice(catchStart);
  assert.match(catchSlice, /lastApplicationResultRef\.current = null;/);
  assert.match(catchSlice, /lastConversationPlannerSnapshotRef\.current = null;/);
});

// ============================================================================
// PARTE 8 — CONVERSATION ROUTING controlado (DEV).
// Ponto ÚNICO de saída: consulta o Conversation Plan do MESMO turno uma única
// vez por mensagem e seleciona a rota (ANSWER/QUESTION/CLARIFICATION/
// CONFIRMATION/WAIT/NONE). A rota legada nunca é contornada; o resultado fica
// SOMENTE em ref dedicado; nenhum state React, nenhuma execução, nenhuma
// persistência, nenhum TTS.
// ============================================================================

test('PARTE 8: seletor importado do index e ref dedicado ao lado do planner', async () => {
  const page = await source('UniChatPage.jsx');
  const importLine = page.match(/import \{[\s\S]*?\} from '\.\.\/uni-engine\/index\.js';/)[0];
  assert.match(importLine, /selectControlledConversationRoute/);
  const refBlock = betweenMarkers(
    page,
    'const lastConversationPlannerSnapshotRef = useRef(null);',
    'useEffect(() => {',
  );
  assert.match(refBlock, /const lastConversationRoutingSnapshotRef = useRef\(null\);/);
});

test('PARTE 8: seletor consultado UMA vez no ponto único de saída, com planner do mesmo turno', async () => {
  const page = await source('UniChatPage.jsx');
  const guidedBlock = betweenMarkers(
    page,
    'const applyEngineGuidanceToResponse = useCallback',
    'const buildGuidedUniMessage = useCallback',
  );
  const occurrences = guidedBlock.match(/selectControlledConversationRoute\(/g) ?? [];
  assert.equal(occurrences.length, 1, 'seletor consultado exatamente uma vez por mensagem');
  assert.match(guidedBlock, /sameTurn:/);
  assert.match(guidedBlock, /lastConversationPlannerSnapshotRef\.current/);
  assert.match(guidedBlock, /lastConversationRoutingSnapshotRef\.current = routingSnapshot;/);
  assert.doesNotMatch(guidedBlock, /setMessages|setState|useState\(/);
  assert.doesNotMatch(guidedBlock, /syncMessageToSupabase/);
  assert.doesNotMatch(guidedBlock, /localStorage/);
  assert.doesNotMatch(guidedBlock, /\.rpc\(/);
  assert.doesNotMatch(guidedBlock, /pushMessage/);
  assert.doesNotMatch(guidedBlock, /executeFinancialIntentAction|executeConfirmedFinancialAction/);
  assert.doesNotMatch(guidedBlock, /uniVoice\.speak/);
});

test('PARTE 8: rota ANSWER usa o finalText; qualquer outra rota preserva o texto legado', async () => {
  const page = await source('UniChatPage.jsx');
  const guidedBlock = betweenMarkers(
    page,
    'const applyEngineGuidanceToResponse = useCallback',
    'const buildGuidedUniMessage = useCallback',
  );
  assert.match(guidedBlock, /selectedRoute === 'ROUTE_ANSWER'/);
  assert.match(guidedBlock, /selectControlledVisibleResponse\(\{/);
  assert.match(guidedBlock, /return legacyText;/);
});

test('PARTE 8: novo turno zera o ref do roteamento junto com os demais', async () => {
  const page = await source('UniChatPage.jsx');
  const sendBlock = betweenMarkers(
    page,
    'lastEngineTurnRef.current = {',
    'const pendingActionIntent = (pendingAction ?? financialConversation.state.action)?.intent;',
  );
  assert.match(sendBlock, /lastConversationRoutingSnapshotRef\.current = null;/);
});

test('PARTE 8: catch do runEngineObservational zera o ref do roteamento', async () => {
  const page = await source('UniChatPage.jsx');
  const runBlock = betweenMarkers(
    page,
    'const runEngineObservational = useCallback',
    'const applyEngineGuidanceToResponse = useCallback',
  );
  const catchStart = runBlock.indexOf('} catch {');
  const catchSlice = runBlock.slice(catchStart);
  assert.match(catchSlice, /lastConversationRoutingSnapshotRef\.current = null;/);
});

test('PARTE 8: seletor com flag desligada nunca aplica rota (fluxo real)', async () => {
  const {
    createUniEngineConfig,
    runUniEngineIntegration,
    buildGuidanceSnapshot,
    buildObservationSnapshot,
    runControlledGuidanceApplication,
    buildConversationPlanSnapshot,
    selectControlledConversationRoute,
  } = await import('../uni-engine/index.js');
  const {
    buildEngineResult,
    buildActiveDecision,
    legacyClarification,
    buildIntegrationConfig,
  } = await import('../uni-engine/integration/testFixtures.js');
  const legacy = legacyClarification();
  const engine = buildEngineResult({
    decisionLayer: { decisionType: 'ask', nextDecisionType: 'ask', risk: 'LOW', confidence: 0.9 },
    comparison: { missingFields: ['account'], agreementMetrics: { divergenceCount: 0 } },
    activation: {
      enabled: true,
      shadowMode: true,
      environment: 'development',
      decisions: [buildActiveDecision('QUESTION_GUIDANCE')],
    },
  });
  const integrationSnapshot = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy,
    engineResult: engine,
    context: { isDev: true, confidence: 0.9, risk: 'LOW', dataSufficient: true },
  });
  const guidanceSnapshot = buildGuidanceSnapshot({
    legacy,
    engineResult: engine,
    context: { isDev: true },
  });
  const observationSnapshot = buildObservationSnapshot({
    integrationSnapshot,
    guidanceSnapshot,
    activationSnapshot: engine.activation,
    context: { isDev: true, environment: 'development' },
  });
  const config = createUniEngineConfig({
    env: {
      VITE_UNI_ENGINE_ENABLED: 'true',
      VITE_UNI_ENGINE_SHADOW_MODE: 'true',
      VITE_UNI_ENGINE_ACTIVATION_ENABLED: 'true',
      VITE_UNI_ENGINE_ACTIVATION_SHADOW: 'false',
      VITE_UNI_ENGINE_ACTIVATION_ENVIRONMENTS: 'development',
      VITE_UNI_ENGINE_ACTIVATION_TEST_USER_IDS: 'test-user-1',
      VITE_UNI_ENGINE_CAP_QUESTION_GUIDANCE: 'true',
      VITE_UNI_ENGINE_INTEGRATION_ENABLED: 'true',
      VITE_UNI_ENGINE_INTEGRATION_SHADOW: 'false',
      VITE_UNI_ENGINE_APPLICATION_ENABLED: 'true',
      VITE_UNI_ENGINE_APPLICATION_TELEMETRY: 'false',
    },
  });
  const applicationResult = runControlledGuidanceApplication({
    config,
    legacy,
    engineResult: engine,
    context: { isDev: true, environment: 'development', userId: 'test-user-1' },
  });
  const plan = buildConversationPlanSnapshot({
    observationSnapshot,
    decisionSnapshot: engine.decisionLayer,
    applicationResult,
    context: { isDev: true, environment: 'development' },
  });
  const routing = selectControlledConversationRoute({
    config,
    environment: 'development',
    authorized: true,
    conversationPlan: plan,
    sameTurn: true,
    legacyText: legacy.text,
    legacyResponse: { text: legacy.text },
    applicationResult,
    isDev: true,
  });
  assert.equal(routing.enabled, false);
  assert.equal(routing.applied, false);
  assert.equal(routing.selectedRoute, 'ROUTE_LEGACY_FALLBACK');
  assert.equal(routing.fallbackReason, 'ROUTING_DISABLED');
  assert.equal(routing.legacyPreserved, true);
  assert.equal(routing.safety.financialExecution, false);
  assert.equal(Object.isFrozen(routing), true);
});
