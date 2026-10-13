import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('P1-09: resultado assíncrono da Agenda valida turno, conversa, usuário e workspace antes de publicar', async () => {
  const page = await source('./UniChatPage.jsx');
  const { body: block } = extractFunctionBody(page, 'function runAgendaTurn(turn) {');

  assert.match(block, /isAgendaRequestCurrent\(agendaRequest\)/);
  assert.match(page, /const agendaRequest = \{ \.\.\.agendaIdentity, turnToken \};/);
  assert.match(page, /isAgendaRequestContextCurrent\([\s\S]*agendaRequestContextRef\.current,[\s\S]*uniTurnTokenRef\.current/);
  assert.match(block, /if \(!isAgendaRequestCurrent\(agendaRequest\)\) return;/);
});

test('runtime: saudação pura é respondida antes de qualquer fluxo financeiro', async () => {
  const page = await source('./UniChatPage.jsx');
  const { body } = extractFunctionBody(page, 'function sendText(text, metadata) {');
  const commonIdx = body.indexOf("declaredIntent === 'conversation_common'");
  const financialIdx = body.indexOf('runDeterministicFinancialFlow(functionalText, historySnapshot, roteiaPeloModelo);');

  assert.ok(commonIdx !== -1, 'gate de conversa comum precisa existir');
  assert.ok(financialIdx !== -1, 'fluxo financeiro funcional precisa continuar existindo');
  assert.ok(commonIdx < financialIdx, 'conversa comum precisa ser resolvida antes do financeiro');
  assert.match(body, /resolveCommonConversationResponse\(text\)/);
});

test('runtime: saudação funcional é removida apenas da cópia usada pelos domínios', async () => {
  const page = await source('./UniChatPage.jsx');
  const { body } = extractFunctionBody(page, 'function sendText(text, metadata) {');

  assert.match(body, /const functionalText = stripLeadingConversationalPrefix\(text\) \|\| text\.trim\(\);/);
  assert.match(body, /const userMsg = buildUserMessage\(text\);/);
  assert.match(body, /runAgendaTurn\(\{ functionalText, agendaIdentity, agendaRequest, messageSource, historySnapshot \}\);/);
  const { body: agenda } = extractFunctionBody(page, 'function runAgendaTurn(turn) {');
  assert.match(agenda, /agendaConversationRef\.current\.handle\(\{\s*text: functionalText,/);
  assert.match(body, /runDeterministicFinancialFlow\(functionalText, historySnapshot, roteiaPeloModelo\);/);
});

test('P1-D: transições invalidam Agenda sincronamente e liberam loading antes de qualquer await', async () => {
  const page = await source('./UniChatPage.jsx');
  const mode = extractFunctionBody(page, 'function handleModeChange(next) {').body;
  const newChat = extractFunctionBody(page, 'function handleNewChat() {').body;
  const deleting = extractFunctionBody(page, 'async function handleDeleteConversation(id) {').body;
  const switching = extractFunctionBody(page, 'function switchConversation(id) {').body;

  assert.match(mode, /invalidateAgendaRequest\(\{ mode: next \}\);\s*setIsTyping\(false\);/);
  assert.match(newChat, /invalidateAgendaRequest\(\{ conversationId: conv\.id, mode \}\);/);
  assert.match(switching, /invalidateAgendaRequest\(\{ conversationId: id, mode: convMode \}\);/);
  assert.match(deleting, /if \(deletingActive\) \{\s*invalidateAgendaRequest\(\);\s*setIsTyping\(false\);/);
  assert.ok(
    deleting.indexOf('invalidateAgendaRequest();') < deleting.indexOf('await dataService.deleteConversation(id);'),
    'exclusão ativa precisa invalidar a operação antes da chamada remota',
  );
});

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

// BUG REAL (voz): com o card "Criar categoria para continuar" na tela, a
// correção "Salário não é despesa, é receita" caía no aviso "confirme a criação"
// e o card não mudava. A correção vale para o lançamento atrás do card.
test('correção falada com o card de criar categoria na tela corrige o lançamento e troca o card', async () => {
  const page = await source('UniChatPage.jsx');
  const { body, end } = extractFunctionBody(page, 'function correctDraftBehindCategoryCreation(text) {');
  assert.ok(end > -1, 'não foi possível localizar correctDraftBehindCategoryCreation');

  // Só corrige com uma correção clara e com o rascunho original guardado.
  assert.match(body, /item\.type === 'financial_transaction'/);
  assert.match(body, /resolvePendingActionInput\(\{[\s\S]*action: parentSnapshot\.action,/);
  assert.match(body, /if \(resolved\.kind !== 'correction'\) return false;/);
  // Categoria existente de outro tipo não é correção.
  assert.match(body, /chosenCategory\.category_type !== wantedType\) return false;/);
  // O card de criação sai e o rascunho volta com a correção, sem criar nada.
  assert.match(body, /status: 'updated'/);
  assert.match(body, /pendingActionStackRef\.current = null;/);
  assert.match(body, /financialConversation\.restore\(parentSnapshot\);/);
  assert.match(body, /financialConversation\.provideInput\(\s*\{ \.\.\.resolved\.overrides,[\s\S]*?categoryName: proposedCategoryName[\s\S]*?parentSnapshot\.parsed,/);
  // O nome proposto pelo card de criação é preservado se a categoria ainda faltar.
  assert.match(body, /getActivePendingAction\(stack\)\?\.fields\?\.category\?\.name/);
  assert.match(body, /publishConversationResultWithInference\(result\)/);
  assert.doesNotMatch(body, /handleConfirmAction|completeCategoryCreationDependency/);

  // A tentativa de correção vem antes do aviso genérico.
  const pending = extractFunctionBody(page, 'function handlePendingConversationInput(text, userMsg) {').body;
  const attempt = pending.indexOf('categoryDependencyActive && correctDraftBehindCategoryCreation(text)');
  const generic = pending.indexOf('Para continuar, confirme a criação da categoria');
  assert.ok(attempt > -1, 'a correção precisa ser tentada com o card de categoria ativo');
  assert.ok(attempt < generic, 'a correção precisa vir antes do aviso genérico');
});

test('"Cancelar" do card sem lançamento pronto não depende de existir plano financeiro', async () => {
  const page = await source('UniChatPage.jsx');
  // extractFunctionBody pararia na chave do parâmetro desestruturado.
  const cancelStart = page.indexOf('function handleCancelAction(id, { cascade = false } = {}) {');
  assert.ok(cancelStart > -1);
  const cancel = page.slice(cancelStart, cancelStart + 3600);
  // Sem plano, financialPlanRef.current é null: o handler consulta isso antes de
  // chegar nas dependências de conta e categoria.
  assert.match(cancel, /isPlanReadyForFinalConfirmation\(financialPlanRef\.current\)/);
  assert.ok(
    cancel.indexOf('isPlanReadyForFinalConfirmation(financialPlanRef.current)')
      < cancel.indexOf('cancelCategoryCreationDependency(stack, { cascade })'),
    'a consulta do plano acontece antes do cancelamento da categoria',
  );
  assert.match(page, /const financialPlanRef = useRef\(null\);/);
});

test('cancelar o lançamento que sobrou depois de "cancelar só a criação" também limpa a pilha', async () => {
  const page = await source('UniChatPage.jsx');
  const start = page.indexOf("createAssistantResponse('Tudo bem. Não registrei nada.');");
  assert.ok(start > -1);
  const before = page.slice(start - 500, start);
  assert.match(before, /pendingActionStackRef\.current = null;\s*setPendingActionStack\(null\);/);
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
  assert.match(page, /import \{\s*\n\s*useUniLlm, AI_STATUS, resolveConversationStyle,\s*\n\s*createPhraseStructuredFactService, isLlmPhrasingFlagEnabled,\s*\n\s*\} from '\.\.\/uni-llm';/);
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
  assert.match(fnBody, /createAssistantResponse\(\s*finalResponseText \|\| \(llmDailyLimitReached \? UNI_LLM_DAILY_LIMIT_TEXT : UNI_DETERMINISTIC_FALLBACK_TEXT\),\s*\);/);
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

test('BUG REAL: barreira financeira pede reformulação, nunca uma resposta de incapacidade', async () => {
  const page = await source('UniChatPage.jsx');
  const resultBlock = page.slice(
    page.indexOf('const result = financialConversation.interpret(text);'),
    page.indexOf('if (result.action?.status'),
  );
  const barrierBlock = resultBlock.slice(
    resultBlock.indexOf('if (looksLikeUnclassifiedFinancialStatement(text)) {'),
    resultBlock.indexOf('void handleUnresolvedMessage(text, historySnapshot);'),
  );
  assert.match(barrierBlock, /Pode reformular dizendo o valor e do que se trata\?/);
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

test('falha/ausência de suporte a voz mantém a digitação funcional (input sempre habilitado)', async () => {
  const chatInput = await source('components/ChatInput.jsx');
  assert.doesNotMatch(chatInput, /input[\s\S]{0,120}disabled=\{.*voice/i);
  assert.match(chatInput, /onChange=\{\(e\) => onChange\(e\.target\.value\)\}/);
});

test('MessageBubble renderiza o texto sem nenhum controle de voz', async () => {
  const bubble = await source('components/MessageBubble.jsx');
  assert.match(bubble, /<p className=\{styles\.text\}>/);
  assert.doesNotMatch(bubble, /voiceEnabled|showSpeak|onSpeakMessage/);
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
  assert.match(afterEnabledBlock, /const usedDeterministicFallback = !finalResponseText;/);
  assert.match(afterEnabledBlock, /createAssistantResponse\(\s*finalResponseText \|\| \(llmDailyLimitReached \? UNI_LLM_DAILY_LIMIT_TEXT : UNI_DETERMINISTIC_FALLBACK_TEXT\),\s*\);/);
});

test('fallback textual na Home simplificada neutraliza o estado de erro e libera a proxima interacao', async () => {
  const page = await source('UniChatPage.jsx');
  const fnBody = page.slice(
    page.indexOf('async function handleUnresolvedMessage'),
    page.indexOf('function handleCancelAi'),
  );
  assert.match(
    fnBody,
    /if \(usedDeterministicFallback && isSimplifiedExperience\) \{\s*\n\s*setAiStatus\(AI_STATUS\.UNAVAILABLE\);\s*\n\s*\}/,
  );
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

test('escritas do chat usam a RPC atômica e allowlist restrita, incluindo transferência (BUG 2)', async () => {
  const page = await source('UniChatPage.jsx');
  assert.match(page, /import \{\s*executeConfirmedFinancialAction,\s*executeConfirmedInstallmentPurchase,\s*\}/);
  assert.match(page, /executeAtomicAction: executeConfirmedFinancialAction/);
  assert.match(page, /ALLOWED_CHAT_WRITE_INTENTS = Object\.freeze\(\[/);
  assert.match(page, /'register_income',\s+'register_expense',\s+'set_balance',[\s\S]*?'ambiguous_balance_or_income',[\s\S]*?'register_transfer',/);
  // Sem o uni-interpret, transferência e meta recebem aviso de que ainda
  // não são registradas pela conversa.
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

test('card de confirmação de lançamento nunca mostra o campo Espaço, e nunca aceita texto livre como execução', async () => {
  const adapter = await source('uniChatAdapter.js');
  const page = await source('UniChatPage.jsx');
  // A pedido do usuário: o card (Tipo/Categoria/Descrição/Valor/Data) não
  // mostra mais qual espaço (Pessoal/Empresa) recebe o lançamento -- o
  // workspace ativo já está visível no resto da UI, e o campo aqui era
  // redundante.
  assert.doesNotMatch(adapter, /label: 'Espaço'/);
  assert.match(page, /buildConfirmationFromAction\(result\.action\)/);
  assert.match(page, /replyType === 'confirm'/);
  assert.match(page, /resolvedInput\.kind !== 'correction'/);
});

test('plano com uma única ação pronta publica o mesmo card e roteia confirmar/cancelar para a pendência real', async () => {
  const page = await source('UniChatPage.jsx');
  assert.match(page, /const action = getSingleReadyPlanAction\(plan\);/);
  assert.match(page, /confirmation: buildConfirmationFromAction\(action\)/);
  assert.match(page, /type: 'confirmation'/);
  assert.match(page, /Revise as informações antes de registrar\./);

  const confirm = extractFunctionBody(page, 'async function handleConfirmAction(id) {').body;
  assert.match(confirm, /isPlanReadyForFinalConfirmation\(financialPlanRef\.current\)/);
  assert.match(confirm, /await confirmFinancialPlan\(\);/);

  const cancelStart = page.indexOf('function handleCancelAction(id, { cascade = false } = {}) {');
  const cancel = page.slice(cancelStart, cancelStart + 900);
  assert.match(cancel, /isPlanReadyForFinalConfirmation\(financialPlanRef\.current\)/);
  assert.match(cancel, /cancelFinancialPlanEntirely\(\);/);
});

// ============================================================================
// Hidratação (reload/login): termina depois que (1) a sessão carrega e (2)
// o histórico inicial termina de ser restaurado. Os ids restaurados são
// reservados para mensagens novas nunca colidirem. Sem timeout.
// ============================================================================

test('hidratação: maybeMarkHistoryHydrated é o ÚNICO ponto que marca o fim da hidratação -- reserva os ids restaurados ANTES de marcar, e nunca usa timeout', async () => {
  const page = await source('UniChatPage.jsx');
  const idx = page.indexOf('const maybeMarkHistoryHydrated = useCallback');
  assert.ok(idx > -1, 'esperava maybeMarkHistoryHydrated definido');
  const block = page.slice(idx, page.indexOf('}, [messages, user]);', idx));
  // Guardas determinísticas da hidratação: marco já atingido, restaurações
  // em voo e sessão ainda não carregada.
  assert.match(block, /if \(historyHydratedRef\.current\) return;/);
  assert.match(block, /if \(pendingRestoresRef\.current > 0\) return;/);
  assert.match(block, /if \(isSupabaseConfigured && !user\?\.id\) return;/);
  assert.doesNotMatch(block, /isWelcomeVoicePending|markRestoredMessagesAsSpoken/);
  const reserveIdx = block.indexOf('reserveMessageIds(messages);');
  const markIdx = block.indexOf('setHistoryHydrated(true);');
  assert.ok(reserveIdx > -1 && markIdx > reserveIdx, 'a reserva dos ids acontece ANTES de marcar a hidratação');
  assert.doesNotMatch(block, /setTimeout|setInterval/, 'a correção é determinística -- nunca timeout arbitrário');
});

test('hidratação: restauração inicial do Supabase controla pendingRestoresRef', async () => {
  const page = await source('UniChatPage.jsx');
  const idx = page.indexOf('useEffect(() => {\n    if (!activeId) return;\n    const current = conversations.find');
  assert.ok(idx > -1, 'esperava o efeito de restauração inicial');
  const block = page.slice(idx, page.indexOf('const pendingSyncRef = useRef([]);', idx));
  assert.match(block, /pendingRestoresRef\.current \+= 1;/);
  assert.match(block, /pendingRestoresRef\.current -= 1;/);
  assert.doesNotMatch(block, /markRestoredMessagesAsSpoken/);
});

test('hidratação: switchConversation conta a restauração assíncrona em pendingRestoresRef', async () => {
  const page = await source('UniChatPage.jsx');
  const idx = page.indexOf('function switchConversation(id) {');
  assert.ok(idx > -1);
  const block = page.slice(idx, page.indexOf('async function handleUnresolvedMessage', idx));
  assert.match(block, /pendingRestoresRef\.current \+= 1;/);
  assert.doesNotMatch(block, /markRestoredMessagesAsSpoken|uniVoice/);
});

test('BLOCO VOZ ID: pontos de restauração reservam IDs restaurados (reserveMessageIds) -- mensagens novas nunca colidem com histórico', async () => {
  const page = await source('UniChatPage.jsx');
  assert.match(page, /import \{ reserveMessageIds \} from '\.\/messageIdRegistry\.js';/);
  // Primeiro render: reserva o histórico restaurado inicial (antes da hidratação).
  assert.match(page, /useEffect\(\(\) => \{\s*\n\s*reserveMessageIds\(messages\);/);
  // Fim da hidratação.
  const armBlock = page.slice(
    page.indexOf('const maybeMarkHistoryHydrated = useCallback'),
    page.indexOf('}, [messages, user]);', page.indexOf('const maybeMarkHistoryHydrated = useCallback')),
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
// Plano financeiro em UniChatPage: o uni-interpret monta as operações
// (#80); corrigir/confirmar/cancelar reaproveitam o mesmo texto livre já
// usado pela pendência de uma única operação; persistência continua uma
// operação por vez pelo RPC atômico já existente.
// ============================================================================

test('#80: sem o uni-interpret, transferência recebe o aviso de que ainda não é registrada pela Uni', async () => {
  const page = await source('UniChatPage.jsx');
  const idx = page.indexOf('if (isUnsupportedIntentEligibleForPlan(result.parsed?.intent)) {');
  assert.ok(idx > -1);
  const slice = page.slice(idx, idx + 300);
  assert.match(slice, /Transferências ainda não podem ser registradas pela Uni\./);
  assert.doesNotMatch(page, /attemptFinancialPlan|financialPlanService/);
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

  assert.match(fnBody, /const replyType = classifyPendingActionReply\(text, \{ subjectName: replySubjectName \}\);/);

  const guardIdx = fnBody.indexOf('!pendingAction\n      && !accountDependencyActive\n      && !categoryDependencyActive\n      && !categoryConfirmationPending');
  assert.ok(guardIdx > -1, 'a barreira de cancelamento durante esclarecimento deve existir');

  const replyTypeIdx = fnBody.indexOf('const replyType = classifyPendingActionReply(text, { subjectName: replySubjectName });');
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
  const { body: slice, end } = extractFunctionBody(page, 'async function confirmFinancialPlan() {');
  assert.ok(end > -1);
  assert.match(slice, /getPersistablePlanOperations\(workingPlan\)\s*\.filter\(\(op\) => op\.status === PLAN_OPERATION_STATUS\.READY\)/);
  assert.match(slice, /for \(const op of persistable\) \{/);
  // Compra parcelada vai pela RPC que grava todas as parcelas de uma vez (#221).
  assert.match(
    slice,
    /executeFinancialIntentAction\(op\.action, \{\s*executeAtomicAction: op\.action\.installments\s*\? executeConfirmedInstallmentPurchase\s*: executeConfirmedFinancialAction,\s*\}\)/,
  );
  assert.match(slice, /markPlanOperationFailed\(workingPlan, op\.temporaryId\)/);
  // O retorno da RPC vai junto: a resposta repete quantas parcelas ficaram previstas.
  assert.match(slice, /markPlanOperationConfirmed\(workingPlan, op\.temporaryId, result\.data\)/);
});

test('BLOCO E: capacidades pendentes (parcelamento/recorrência) nunca são persistidas na confirmação do plano', async () => {
  const page = await source('UniChatPage.jsx');
  assert.match(page, /getPersistablePlanOperations,\n/);
  const { body: slice } = extractFunctionBody(page, 'async function confirmFinancialPlan() {');
  // getPersistablePlanOperations já exclui capabilityPending (ver pendingFinancialPlan.js);
  // a chamada real nunca itera plan.operations diretamente.
  assert.doesNotMatch(slice, /for \(const op of workingPlan\.operations\)/);
});

test('BLOCO E: notifica mudança de dados financeiros só quando algo foi de fato persistido (completed/partial)', async () => {
  const page = await source('UniChatPage.jsx');
  const { body: slice } = extractFunctionBody(page, 'async function confirmFinancialPlan() {');
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
  assert.match(slice, /looksLikeFreshFinancialStatement\(functionalText\)/);
  assert.match(slice, /looksLikeFreshBalanceStatement\(functionalText\)/);
  assert.match(slice, /abandonStalePendingState\(\);/);
  assert.match(slice, /\} else \{\s*handlePendingConversationInput\(functionalText, userMsg\);\s*return;\s*\}/);
});

test('BUG REAL: ajuste falado ("na verdade paguei 150 reais") corrige a pendência em vez de abandoná-la', async () => {
  const page = await source('UniChatPage.jsx');
  assert.match(page, /import \{[\s\S]*?looksLikePendingCorrection[\s\S]*?\} from '\.\.\/uni-conversation';/);
  const idx = page.indexOf('if (hasPendingConversation) {');
  const slice = page.slice(idx, idx + 1400);
  assert.match(slice, /!looksLikePendingCorrection\(functionalText\)\s*&& \(looksLikeFreshFinancialStatement\(functionalText\)/);
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
  assert.match(page.slice(idx, idx + 950), /looksLikeFreshBalanceStatement\(functionalText\)/);
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
  assert.match(page.slice(page.indexOf('function sendText(text, metadata) {'), idx), /const declaredIntent = classifyIntent\(text\)\.intent;/);
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
  // A exclusão de lançamento (#189) é pendência real como a edição.
  assert.match(slice, /const hasRealPendingEntity = Boolean\(\s*pendingAction\s*\|\|\s*pendingActionStack\?\.actions\?\.length\s*\|\|\s*isFinancialPlanActive\(\)\s*\|\|\s*edicaoAtiva\(edicaoPendente\)\s*\|\|\s*exclusaoAtiva\(exclusaoPendente\),\s*\);/);
  assert.match(slice, /if \(hasRealPendingEntity\) return;/);
  assert.match(slice, /\[pendingHydrated, pendingAction, pendingActionStack, edicaoPendente, exclusaoPendente\]/);
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
  const buttonsIdx = card.indexOf("{status === 'pending' && !isEditing && (");
  assert.ok(buttonsIdx > -1);
  const slice = card.slice(buttonsIdx, buttonsIdx + 800);
  assert.match(slice, /Confirmar/);
  assert.match(slice, /Cancelar/);
  // O outro bloco de botões é o do formulário de edição, que também só
  // existe com status pendente.
  assert.match(card, /const isEditing = canEditInline && status === 'pending' && editValues !== null;/);
  const allButtonBlocks = [...card.matchAll(/className=\{styles\.actions\}/g)];
  assert.equal(allButtonBlocks.length, 2);
});

test('ActionConfirmation exibe "Expirado" para uma confirmação órfã saneada, sem inventar um "confirmado" falso', async () => {
  const card = await source('components/ActionConfirmation.jsx');
  assert.match(card, /status === 'expired' && <span className=\{styles\.statusMuted\}>Expirado<\/span>/);
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
  // Sprint 2: entre a condição e syncMessageToSupabase agora só existe o
  // efeito colateral opcional de memória (remember) -- nunca uma segunda
  // publicação nem uma mudança na condição em si.
  assert.match(slice, /if \(\s*engineOutcome\.handled\s*&&\s*engineOutcome\.queryType !== 'transaction_reference'\s*\)\s*\{[\s\S]*?syncMessageToSupabase\(userMsg\);/);
  assert.match(slice, /createAssistantResponse\(\s*engineOutcome\.response\.text,\s*\{ highlight: engineOutcome\.response\.highlight \},\s*\);/);
  assert.match(slice, /return true;\s*\}/, 'o gate responde a consulta e mantém a Pending Action intacta para o próximo input');
  // transaction_reference ("caixa", "confirmar", nomes/valores isolados) NÃO
  // toma a frente do fluxo de pendência -- são respostas legítimas ao campo
  // pendente, nunca perguntas financeiras.
  assert.match(slice, /engineOutcome\.queryType !== 'transaction_reference'/);
});

test('CORREÇÃO URGENTE: runDeterministicFinancialFlow consulta os motores de consulta SOMENTE quando a frase não é uma ação financeira declarada', async () => {
  const page = await source('UniChatPage.jsx');
  const { body: slice } = extractFunctionBody(page, 'function runDeterministicFinancialFlow(text, historySnapshot, modeloJaLeu = false) {');
  assert.ok(slice.length > 0, 'não foi possível localizar runDeterministicFinancialFlow');
  // Declarações/ações (set_balance, ambiguidade, receita, despesa,
  // transferência, meta) pulam o FinancialQueryEngine e o interpretador
  // legado e vão direto para o fluxo de registro (interpret).
  // Sprint 2: o gate consome resolvedText (pós-memória conversacional),
  // nunca o text bruto -- mas a REGRA em si (ação vence consulta) é a
  // mesma de antes.
  assert.match(slice, /if \(!ACTION_STATEMENT_INTENTS\.has\(classifyIntent\(resolvedText\)\.intent\)\) \{/);
  const gateIdx = slice.indexOf('ACTION_STATEMENT_INTENTS.has(classifyIntent(resolvedText).intent)');
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
  const { body: slice } = extractFunctionBody(page, 'function runDeterministicFinancialFlow(text, historySnapshot, modeloJaLeu = false) {');
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
  assert.doesNotMatch(loadBlock, /markRestoredMessagesAsSpoken/);
  assert.match(loadBlock, /reserveMessageIds\(loadedMessages\)/);
  assert.ok(
    loadBlock.indexOf('reserveMessageIds') < loadBlock.indexOf('setMessages((prev)'),
    'a restauração assíncrona reserva ANTES de substituir as mensagens',
  );
});

test('BUG 4: scroll consome stickToBottom em layout effect -- a conversa aberta a partir da Home não abre mais no topo', async () => {
  const page = await source('UniChatPage.jsx');
  const scrollBlock = page.slice(
    page.indexOf('function scrollToLatest()'),
    page.indexOf('function pushMessage'),
  );
  assert.match(scrollBlock, /useLayoutEffect\(\(\) => \{/);
  assert.match(scrollBlock, /if \(!stickToBottom\.current\) return;/);
  assert.match(scrollBlock, /scrollRef\.current/);
  assert.match(scrollBlock, /el\.scrollTop = el\.scrollHeight;/);
  assert.match(scrollBlock, /}, \[messages, historyHydrated, isKeyboardOpen, messagesMountTick\]\);/);
  // Contrato de aderência: nada de setTimeout arbitrário para rolar.
  assert.doesNotMatch(scrollBlock, /setTimeout\(/);
  // O usuário que rolou para cima (stickToBottom=false) mantém a leitura.
  assert.match(scrollBlock, /rolou para cima/);
});

// HOTFIX FINAL -- causa raiz real medida diretamente no DOM: abrir a conversa
// a partir da Home (troca de rota client-side, SEM reload) faz
// `.body`/`.messages` montarem pela primeira vez nesse commit, mas
// `messages`/`historyHydrated` já tinham o MESMO valor de quando a Home
// (early return, nunca renderiza `.body`) era exibida -- o efeito de scroll
// não tinha nenhuma dependência nova para reagir, e o container ficava com
// scrollTop=0 (medido: distanceFromBottom ~8878px). `messagesMountTick`
// fecha esse gap.
test('HOTFIX FINAL: callback ref de `.messages` incrementa messagesMountTick a cada montagem -- entra nas dependências do layout effect de scroll, nunca faz a rolagem sozinho (child ref pode disparar antes do parent ref -- scrollRef.current -- estar anexado no mesmo commit)', async () => {
  const page = await source('UniChatPage.jsx');
  const scrollBlock = page.slice(
    page.indexOf('function scrollToLatest()'),
    page.indexOf('function pushMessage'),
  );
  assert.match(scrollBlock, /const \[messagesMountTick, setMessagesMountTick\] = useState\(0\);/);
  assert.match(scrollBlock, /const setMessagesContentRef = useCallback\(\(node\) => \{\s*\n\s*if \(node\) setMessagesMountTick\(\(tick\) => tick \+ 1\);\s*\n\s*\}, \[\]\);/);
  // o callback ref NUNCA mexe em scrollRef/scrollTop diretamente -- só sinaliza;
  // quem rola é sempre o useLayoutEffect (depois que TODO o commit, inclusive
  // o ref pai .body, já assentou).
  const refIdx = scrollBlock.indexOf('const setMessagesContentRef = useCallback');
  const refEndIdx = scrollBlock.indexOf('}, []);', refIdx);
  const refBody = scrollBlock.slice(refIdx, refEndIdx);
  assert.doesNotMatch(refBody, /scrollRef\.current/);
  assert.doesNotMatch(refBody, /scrollTop/);
  assert.match(page, /<div className=\{styles\.messages\} ref=\{setMessagesContentRef\}>/);
});

test('HOTFIX FINAL P2: posicionamento no fim reage também à conclusão da hidratação (historyHydrated), não só a mudanças de `messages` -- e reconfirma a posição após o paint real via requestAnimationFrame (pega reflow tardio, ex.: fonte web assíncrona), sem timer arbitrário', async () => {
  const page = await source('UniChatPage.jsx');
  const scrollBlock = page.slice(
    page.indexOf('function scrollToLatest()'),
    page.indexOf('function pushMessage'),
  );
  assert.match(scrollBlock, /const rafId = window\.requestAnimationFrame\(\(\) => \{/);
  assert.match(scrollBlock, /return \(\) => window\.cancelAnimationFrame\(rafId\);/);
  // o callback do rAF confere stickToBottom.current DE NOVO (não reaplica
  // cegamente) -- se o usuário rolou para cima entre o commit e o paint, o
  // rAF também respeita a leitura manual.
  const rafIdx = scrollBlock.indexOf('const rafId = window.requestAnimationFrame(() => {');
  const rafBody = scrollBlock.slice(rafIdx, scrollBlock.indexOf('});', rafIdx));
  assert.match(rafBody, /if \(!stickToBottom\.current\) return;/);
});

// BUG 1 (Sprint 4, Bloco 4.0): a fusão por identidade (antes inline e
// quebrada -- comparava dbId, presente só em mensagens restauradas, contra
// clientMessageId, nunca preenchido por dbToMessage) foi extraída para
// mergeRestoredMessages.js, onde é coberta por testes COMPORTAMENTAIS reais
// (mergeRestoredMessages.test.js) que reproduzem o defeito e confirmam a
// correção. Aqui só confirmamos que a hidratação delega para essa função
// central, em vez de reimplementar a lógica inline.
test('BUG 1: hidratação delega a fusão de mensagens para mergeRestoredMessages (identidade estável, testada em mergeRestoredMessages.test.js)', async () => {
  const page = await source('UniChatPage.jsx');
  assert.match(page, /import \{ dedupeMessagesForRender, mergeRestoredMessages \} from '\.\/mergeRestoredMessages\.js';/);
  const loadBlock = page.slice(
    page.indexOf('const requestId = ++loadRequestIdRef.current'),
    page.indexOf('const pendingSyncRef = useRef([])'),
  );
  assert.match(loadBlock, /setMessages\(\(prev\) => mergeRestoredMessages\(prev, loadedMessages\)\);/);
  // nenhuma reimplementação inline sobreviveu -- a lógica antiga (comparação
  // quebrada dbId/clientMessageId, merge por comprimento) não existe mais
  // aqui, só a chamada à função central.
  assert.doesNotMatch(loadBlock, /localIds\.has\(/);
  assert.doesNotMatch(loadBlock, /prev\.length < loadedMessages\.length/);
});

// HOTFIX FINAL P1: barreira final de segurança logo antes do .map() que
// gera as keys React -- protege mesmo que alguma origem upstream ainda
// entregue duas entradas com a mesma identidade (ver dedupeMessagesForRender
// em mergeRestoredMessages.js, coberta por testes comportamentais próprios).
test('HOTFIX FINAL P1: o chat completo renderiza renderedMessages (dedupeMessagesForRender(messages)), nunca messages cru, no .map() que gera as keys', async () => {
  const page = await source('UniChatPage.jsx');
  assert.match(page, /const renderedMessages = useMemo\(\(\) => dedupeMessagesForRender\(messages\), \[messages\]\);/);
  assert.match(page, /\{renderedMessages\.map\(\(message\) => \(/);
  // `messages` (estado real) nunca é substituído -- hidratação/scroll/
  // persistência continuam operando sobre a fonte de verdade intocada.
  assert.match(page, /setMessages\(\(prev\) => mergeRestoredMessages\(prev, loadedMessages\)\);/);
});

// ============================================================================
// Ponto único de saída: a política de resposta financeira pública recebe o
// texto da pergunta do turno; a resposta do LLM só com espaços cai no texto
// padrão.
// ============================================================================

test('buildGuidedUniMessage aplica a política pública com o texto da pergunta do turno', async () => {
  const page = await source('UniChatPage.jsx');
  const buildBlock = page.slice(
    page.indexOf('const buildGuidedUniMessage = useCallback'),
    page.indexOf('const { createAssistantResponse } = useUniResponsePipeline'),
  );
  assert.match(buildBlock, /text: typeof text === 'string' \? text : '',/);
  assert.match(buildBlock, /requestText: lastUserTurnTextRef\.current,/);
  assert.match(buildBlock, /return buildUniMessage\(publicText, messageOptions\);/);
  const { body } = extractFunctionBody(page, 'function sendText(text, metadata) {');
  // Gravado antes da primeira resposta do turno (o resumo público sai logo depois).
  const gravaIndex = body.indexOf('lastUserTurnTextRef.current = text;');
  const resumoIndex = body.indexOf('responderResumoSemSaldo(');
  assert.ok(gravaIndex > -1 && resumoIndex > -1 && gravaIndex < resumoIndex);
});

test('FASE 21: createAssistantResponse permanece o único ponto de publicação em handleUnresolvedMessage', async () => {
  const page = await source('UniChatPage.jsx');
  const fnBody = page.slice(
    page.indexOf('async function handleUnresolvedMessage'),
    page.indexOf('function handleCancelAi'),
  );
  const matches = fnBody.match(/createAssistantResponse\(/g) ?? [];
  assert.equal(matches.length, 1, 'createAssistantResponse deve ser chamado exatamente uma vez em handleUnresolvedMessage');
});

test('handleUnresolvedMessage tira os espaços da resposta do LLM e trata resposta em branco como falha', async () => {
  const page = await source('UniChatPage.jsx');
  const fnBody = page.slice(
    page.indexOf('async function handleUnresolvedMessage'),
    page.indexOf('function handleCancelAi'),
  );
  assert.match(fnBody, /const finalResponseText = \(typeof llmText === 'string' \? llmText\.trim\(\) : ''\) \|\| null;/);
  assert.match(fnBody, /createAssistantResponse\(\s*finalResponseText \|\| \(llmDailyLimitReached \? UNI_LLM_DAILY_LIMIT_TEXT : UNI_DETERMINISTIC_FALLBACK_TEXT\),\s*\);/);
});

// ============================================================================
// Sprint 1 (IA Conversacional) -- ponte "fato estruturado -> frase natural"
// para as perguntas de clarificação, atrás de VITE_UNI_LLM_PHRASING_ENABLED
// (default desligada). Fallback para o texto canônico (uniResponseBuilder.js)
// é preservado em qualquer falha/flag desligada.
// ============================================================================

test('Sprint 1: attemptNaturalPhrasing só age em needs_clarification, com service suportado, senão preserva o result original', async () => {
  const page = await source('UniChatPage.jsx');
  const fnBody = page.slice(
    page.indexOf('async function attemptNaturalPhrasing'),
    page.indexOf('async function publishConversationResultWithInference'),
  );
  assert.match(fnBody, /action\?\.status !== 'needs_clarification' \|\| !issue \|\| !phraseStructuredFactService\.isSupported\(\)/);
  assert.match(fnBody, /return result;/);
});

test('Sprint 1: attemptNaturalPhrasing nunca envia IDs/saldos dos candidatos -- só nomes', async () => {
  const page = await source('UniChatPage.jsx');
  const fnBody = page.slice(
    page.indexOf('async function attemptNaturalPhrasing'),
    page.indexOf('async function publishConversationResultWithInference'),
  );
  assert.match(fnBody, /issue\.candidates\.slice\(0, 8\)\.map\(\(candidate\) => candidate\?\.name\)/);
});

test('Sprint 1: falha/ausência de texto fraseado preserva o result original (fallback para o texto canônico)', async () => {
  const page = await source('UniChatPage.jsx');
  const fnBody = page.slice(
    page.indexOf('async function attemptNaturalPhrasing'),
    page.indexOf('async function publishConversationResultWithInference'),
  );
  assert.match(fnBody, /if \(!text\) \{[\s\S]{0,200}return result;/);
});

test('Sprint 1: publishConversationResultWithInference fraseia e publica (a categoria vem do uni-interpret, #80)', async () => {
  const page = await source('UniChatPage.jsx');
  const fnBody = page.slice(
    page.indexOf('async function publishConversationResultWithInference'),
    page.indexOf('async function publishConversationResultWithInference') + 400,
  );
  assert.match(fnBody, /const phrased = await attemptNaturalPhrasing\(result\);\s*\n\s*publishConversationResult\(phrased\);/);
  assert.doesNotMatch(page, /attemptCategoryInference|categoryInferenceService/);
});

test('Sprint 1: phraseStructuredFactService combina uniLlm.enabled com a flag adicional VITE_UNI_LLM_PHRASING_ENABLED', async () => {
  const page = await source('UniChatPage.jsx');
  assert.match(page, /enabled: uniLlm\.enabled && isLlmPhrasingFlagEnabled\(\),/);
});

// ============================================================================
// Sprint 2 — Memória Conversacional + Interpretação Temporal
// ============================================================================

test('Sprint 2: conversationalMemoryRef é criado com createConversationalMemory (mesmo padrão createXStore)', async () => {
  const page = await source('UniChatPage.jsx');
  assert.match(page, /const conversationalMemoryRef = useRef\(createConversationalMemory\(\)\);/);
  assert.match(page, /createConversationalMemory,\n\s*classifyPendingActionRelation,\n\s*createAgendaConversationFlow,\n\} from '..\/uni-conversation';/);
});

test('Agenda voice-first usa o mesmo sendText e abandona pendência antes de uma fala financeira nova', async () => {
  const page = await source('UniChatPage.jsx');
  const { body } = extractFunctionBody(page, 'function sendText(text, metadata) {');
  assert.match(body, /metadata\?\.source === 'voice'/);
  assert.match(body, /runAgendaTurn\(\{/);
  assert.match(body, /const shouldAbandonAgendaForFinancial = hasPendingAgendaConversation/);
  assert.match(body, /isRetiredBalanceRequest/);
  assert.match(body, /void agendaConversationRef\.current\.abandonPending\(agendaIdentity\)\.catch\(\(\) => \{\}\);/);
  const abandonIndex = body.indexOf('agendaConversationRef.current.abandonPending(agendaIdentity)');
  const handleIndex = body.indexOf('runAgendaTurn({');
  assert.ok(abandonIndex >= 0 && handleIndex > abandonIndex);
  assert.match(body, /if \(hasAgendaConversation\)[\s\S]*return;[\s\S]*if \(hasPendingConversation\)/);
});

test('Agenda voice-first usa identidade do workspace autenticado e o pipeline oficial de resposta', async () => {
  const page = await source('UniChatPage.jsx');
  const { body } = extractFunctionBody(page, 'function sendText(text, metadata) {');
  assert.match(body, /workspaceId: effectiveWorkspace\?\.id/);
  assert.match(body, /conversationId: activeId \?\? 'local-conversation'/);
  const { body: agenda } = extractFunctionBody(page, 'function runAgendaTurn(turn) {');
  assert.match(agenda, /if \(result\.route === 'financial' && result\.financialText\)/);
  assert.match(agenda, /runDeterministicFinancialFlow\(result\.financialText, historySnapshot\)/);
  assert.match(agenda, /if \(result\.handled && result\.text\)[\s\S]*createAssistantResponse\(result\.text, \{ deduplicateNarration: false \}\)/);
});

test('Sprint 2: conversationalMemoryRef é resetado em switchConversation', async () => {
  const page = await source('UniChatPage.jsx');
  const { body } = extractFunctionBody(page, 'function switchConversation(id) {');
  assert.notEqual(body, '');
  assert.match(body, /conversationalMemoryRef\.current\.reset\(\);/);
});

test('Sprint 2: resolveReferences é chamado ANTES do motor de consultas em runDeterministicFinancialFlow', async () => {
  const page = await source('UniChatPage.jsx');
  const { body } = extractFunctionBody(page, 'function runDeterministicFinancialFlow(text, historySnapshot, modeloJaLeu = false) {');
  assert.notEqual(body, '');
  const resolveIndex = body.indexOf('conversationalMemoryRef.current.resolveReferences(text)');
  const engineIndex = body.indexOf('resolveFinancialQuery({');
  assert.ok(resolveIndex > -1, 'resolveReferences deve ser chamado dentro da função');
  assert.ok(engineIndex > -1, 'resolveFinancialQuery deve continuar sendo chamado');
  assert.ok(resolveIndex < engineIndex, 'resolveReferences precisa rodar antes do motor de consultas');
  // O parser determinístico (resolveFinancialQuery) recebe o texto JÁ
  // resolvido -- nunca o texto bruto -- sem que o próprio parser saiba que
  // existe substituição.
  assert.match(body, /resolveFinancialQuery\(\{\s*text: resolvedText,/);
});

test('Sprint 2: resolveReferences também roda antes do motor de consultas no caminho de pendência (handlePendingConversationInput)', async () => {
  const page = await source('UniChatPage.jsx');
  const { body } = extractFunctionBody(page, 'function handlePendingConversationInput(text, userMsg) {');
  assert.notEqual(body, '');
  const resolveIndex = body.indexOf('conversationalMemoryRef.current.resolveReferences(text)');
  const engineIndex = body.indexOf('resolveFinancialQuery({');
  assert.ok(resolveIndex > -1 && engineIndex > -1 && resolveIndex < engineIndex);
});

test('Sprint 2: lastQuery da memória é repassado ao motor de consultas nos 2 pontos de chamada do determinístico', async () => {
  const page = await source('UniChatPage.jsx');
  const occurrences = page.match(/lastQuery: conversationalMemoryRef\.current\.getLastQuery\(\),/g) || [];
  assert.equal(occurrences.length, 2);
});

test('Sprint 2: consultas de período bem-sucedidas alimentam a memória (remember) sem duplicar a publicação da resposta', async () => {
  const page = await source('UniChatPage.jsx');
  const { body: runBody } = extractFunctionBody(page, 'function runDeterministicFinancialFlow(text, historySnapshot, modeloJaLeu = false) {');
  const rememberIndex = runBody.indexOf('conversationalMemoryRef.current.remember({');
  const createAssistantIndex = runBody.indexOf('createAssistantResponse(\n            engineOutcome.response.text,');
  assert.ok(rememberIndex > -1);
  assert.ok(createAssistantIndex > -1);
  // remember() nunca substitui createAssistantResponse -- é chamado antes,
  // como efeito colateral de memória, e a publicação continua sendo feita
  // por uma única chamada a createAssistantResponse (ponto único de saída).
  assert.ok(rememberIndex < createAssistantIndex);
  // Dentro do bloco "if (engineOutcome.handled)" especificamente, a
  // publicação continua sendo feita por UMA única chamada a
  // createAssistantResponse (ponto único de saída) -- remember() nunca
  // adiciona uma segunda.
  const { body: handledBlock } = extractFunctionBody(runBody, 'if (engineOutcome.handled) {');
  const createAssistantCallsInBlock = (handledBlock.match(/createAssistantResponse\(/g) || []).length;
  assert.equal(createAssistantCallsInBlock, 1);
});

test('Sprint 2: um registro confirmado alimenta a memória com conta/categoria reais (nunca inventadas) antes da resposta final', async () => {
  const page = await source('UniChatPage.jsx');
  const { body } = extractFunctionBody(page, 'async function handleConfirmAction(id) {');
  assert.notEqual(body, '');
  assert.match(body, /const persistedTransaction = outcome\.result\.data;/);
  assert.match(body, /accountState\.accounts\s*\n\s*\.find\(\(account\) => account\.id === persistedTransaction\?\.account_id\)\?\.name \?\? null;/);
  assert.match(body, /conversationalMemoryRef\.current\.remember\(\{/);
});

test('Sprint 2: llmContext adiciona a data de referência ao system prompt de forma puramente aditiva', async () => {
  const llmContext = await source('../uni-llm/llmContext.js');
  assert.match(llmContext, /Data de referencia de hoje: \$\{referenceDate\}\.`\);/);
  assert.match(llmContext, /referenceDate: referenceDate \?\? financialContext\?\.snapshot\?\.referenceDate \?\? null,/);
});

// ============================================================================
// S6/S7 (lote estabilidade): nenhuma falha pode deixar a Uni travada --
// confirmFinancialPlan usa try/finally que SEMPRE zera isExecutingAction e
// confirmingPlanRef, e os guards de troca de conversa de
// handleConfirmAction também zetam os flags antes de abortar.
// ============================================================================

test('S6: confirmFinancialPlan libera isExecutingAction/confirmingPlanRef em finally (nunca trava após erro)', async () => {
  const page = await source('UniChatPage.jsx');
  const { body: slice, end } = extractFunctionBody(page, 'async function confirmFinancialPlan() {');
  assert.ok(end > -1);
  // o reset está dentro de um bloco finally que SEMPRE roda, sucesso ou erro
  assert.match(slice, /try \{/);
  assert.match(slice, /\} finally \{/);
  const finallyBlock = slice.slice(slice.indexOf('} finally {'), slice.indexOf('} finally {') + 300);
  assert.match(finallyBlock, /setIsExecutingAction\(false\)/);
  assert.match(finallyBlock, /confirmingPlanRef\.current = false/);
});

test('S6: confirmFinancialPlan preserva o flow de notificação/sucesso SEM prender os flags', async () => {
  const page = await source('UniChatPage.jsx');
  const { body: slice } = extractFunctionBody(page, 'async function confirmFinancialPlan() {');
  // o fluxo de sucesso continua depois do finally: notify para completed/partial
  assert.match(slice, /notifyFinancialDataChanged\('uni-chat'\)/);
  // e a publicação da resposta acontece dentro do try (antes do finally)
  assert.ok(slice.indexOf('createAssistantResponse(buildPlanResultText') < slice.indexOf('} finally'));
});

test('S7: guards de troca de conversa em handleConfirmAction zeram isExecutingAction/confirmingRef antes de abortar', async () => {
  const page = await source('UniChatPage.jsx');
  const idx = page.indexOf('async function handleConfirmAction(id) {');
  assert.ok(idx > -1);
  const slice = page.slice(idx, page.length);
  // ambos os guards "conversa mudou" restauram os flags
  assert.ok(
    slice.match(/activeIdRef\.current !== currentConversationId\s*\)\s*\{\s*setIsExecutingAction\(false\);\s*confirmingRef\.current = false;/),
    'guard de conversa deve restaurar flags',
  );
  assert.ok(
    (slice.match(/activeIdRef\.current !== currentConversationId \|\| effectiveWorkspace\?\.id !== currentWorkspaceId\s*\)\s*\{\s*setIsExecutingAction\(false\);\s*confirmingRef\.current = false;/g) ?? []).length >= 2,
    'guards de workspace devem restaurar flags',
  );
});

// ============================================================
// S4 (lote estabilidade): resposta assíncrona de turno antigo
// nunca sobrescreve um turno novo -- token de turno único por
// sendText, verificado pelas cadeias que publicam resposta.
// ============================================================

test('S4: sendText captura token de turno único por envio', async () => {
  const page = await source('UniChatPage.jsx');
  const idx = page.indexOf('function sendText(text, metadata) {');
  assert.ok(idx > -1);
  const slice = page.slice(idx, idx + 1400);
  assert.match(slice, /const turnToken = \+\+uniTurnTokenRef\.current;/);
});

test('S4: setTimeout do think-delay aborta quando o turno mudou (sem resposta duplicada/concorrente)', async () => {
  const page = await source('UniChatPage.jsx');
  assert.match(page, /uniTurnTokenRef\.current !== turnToken\) return;/);
});

test('S4: handleUnresolvedMessage aborta publicação se um novo turno começou durante o LLM', async () => {
  const page = await source('UniChatPage.jsx');
  const idx = page.indexOf('async function handleUnresolvedMessage(text, history) {');
  assert.ok(idx > -1);
  const slice = page.slice(idx, idx + 400);
  assert.match(slice, /const turnTokenAtStart = uniTurnTokenRef\.current;/);
  // guard antes de qualquer publicação final, inclusive da marcação de fallback
  assert.match(page, /if \(uniTurnTokenRef\.current !== turnTokenAtStart\) return;\s*\n\s*const usedDeterministicFallback = !finalResponseText;\s*\n\s*createAssistantResponse/);
});

// ============================================================
// S8 (lote estabilidade): falha de restauração do Supabase nunca
// prende a hidratação para sempre -- decremento do
// pendingRestoresRef é feito em finally.
// ============================================================

test('S8: pendingRestoresRef decrementa em finally do loadMessages (erro de restore não prende a hidratação)', async () => {
  const page = await source('UniChatPage.jsx');
  const idx = page.indexOf("dataService.loadMessages(activeId).then(");
  assert.ok(idx > -1);
  const slice = page.slice(idx, idx + 2600);
  assert.match(slice, /\.finally\(\(\) => \{\s*\n\s*\/\/ decremento SEMPRE roda \(sucesso ou erro\), liberando a hidratação\.\s*\n\s*pendingRestoresRef\.current -= 1;/);
  assert.match(slice, /\.catch\(/);
});

test('Preview R1: respostas da Agenda saem pelo pipeline oficial, que ignora as opções da antiga narração', async () => {
  const [page, pipeline] = await Promise.all([
    source('UniChatPage.jsx'),
    source('useUniResponsePipeline.js'),
  ]);
  const { body: agendaBlock } = extractFunctionBody(page, 'function runAgendaTurn(turn) {');
  assert.match(agendaBlock, /createAssistantResponse\(result\.text/);
  assert.match(pipeline, /delete messageOptions\.deduplicateNarration;/);
});

test('resposta sem IA diz que não entendeu, e o teto diário tem aviso próprio', async () => {
  const page = await source('UniChatPage.jsx');
  assert.match(page, /UNI_DETERMINISTIC_FALLBACK_TEXT =\s*\n\s*'Não entendi esse pedido\./);
  assert.doesNotMatch(page, /'Entendi\. Posso ajudar a registrar/);
  assert.match(page, /UNI_LLM_DAILY_LIMIT_TEXT =\s*\n\s*'Você chegou ao limite de respostas da Uni por hoje\./);
  assert.match(page, /llmDailyLimitReached = outcome\?\.dailyLimitReached === true;/);
});

test('edição de lançamento salvo: pedido e resposta só são tratados sem rascunho ou agenda em andamento', async () => {
  const page = await source('UniChatPage.jsx');
  const desvio = page.indexOf('// Edição de lançamento salvo: resposta à lista ou ao card');
  assert.ok(desvio > -1);
  // Depois de conversa comum e antes da agenda: "muda a data do mercado pra
  // ontem" é classificado como agenda e precisa ser testado como edição antes.
  assert.ok(desvio > page.indexOf("if (declaredIntent === 'conversation_common' && (!roteiaPeloModelo || hasPendingConversation)) {"));
  assert.ok(desvio < page.indexOf('if (hasAgendaConversation) {\n      syncMessageToSupabase(userMsg);'));
  const trecho = page.slice(desvio, desvio + 1400);
  assert.match(trecho, /if \(!hasPendingFinancialConversation && !hasPendingAgendaConversation\) \{/);
  assert.match(trecho, /if \(edicaoAtiva\(\) && tratarRespostaDaEdicao\(functionalText, userMsg, turnToken\)\) return;/);
  assert.match(trecho, /if \(tentarPedidoDeEdicao\(functionalText, userMsg, declaredIntent, turnToken\)\) return;/);
  assert.match(trecho, /encerrarEdicao\('expired'\);/);
});

test('edição de lançamento salvo: o toque no card confirma ou cancela a edição antes de qualquer outra pendência', async () => {
  const page = await source('UniChatPage.jsx');
  const confirmar = page.slice(page.indexOf('async function handleConfirmAction(id) {'));
  // O pedido de categoria vem antes: são cards paralelos, cada um pelo id.
  assert.match(confirmar.slice(0, 900), /if \(edicaoPendenteRef\.current\?\.messageId === id\) \{\s*if \(edicaoAtiva\(\)\) \{\s*await confirmarEdicao\(id\);\s*\} else \{\s*encerrarEdicao\('expired'\);\s*reportConfirmationError\(id, TEXTO_EDICAO_VENCIDA\);/);
  const cancelar = page.slice(page.indexOf('function handleCancelAction(id, { cascade = false } = {}) {'));
  assert.match(cancelar.slice(0, 500), /if \(edicaoPendenteRef\.current\?\.messageId === id\) \{\s*cancelarEdicao\(id\);/);
});

test('edição de lançamento salvo: grava só a versão lida e recarrega saldos depois', async () => {
  const page = await source('UniChatPage.jsx');
  const corpo = page.slice(page.indexOf('async function confirmarEdicao(id) {'), page.indexOf('function cancelarEdicao(id) {'));
  assert.match(corpo, /\{ expectedUpdatedAt: edicao\.transacao\.updated_at \}/);
  assert.match(corpo, /resultado\?\.error\?\.code === 'TRANSACTION_CHANGED'/);
  assert.match(corpo, /transactionsState\.refresh\(\),\s*balanceState\.refresh\(\),/);
  assert.match(corpo, /notifyFinancialDataChanged\('uni-chat'\);/);
  // Todo caminho termina com resposta ou erro no card: a conversa por voz
  // espera por um dos dois.
  assert.match(corpo, /reportConfirmationError\(\s*messageId,/);
  assert.match(corpo, /createAssistantResponse\(withFollowUpQuestion\(textoDaAlteracaoFeita/);
});

test('edição de lançamento salvo: o card é montado com o lançamento relido do servidor', async () => {
  const page = await source('UniChatPage.jsx');
  const corpo = page.slice(page.indexOf('async function prepararAlteracao('), page.indexOf('function publicarResultadoDaBusca('));
  assert.match(corpo, /await getTransaction\(workspaceId, transacaoId\)/);
  assert.match(corpo, /confirmation: cardDaAlteracao\(transacao, alteracao\.campos, contexto\)/);
  assert.match(corpo, /etapa: 'confirmar'/);
});

test('edição de lançamento salvo: "corrige pra 50" usa o último lançamento confirmado na conversa', async () => {
  const page = await source('UniChatPage.jsx');
  const confirmar = page.slice(page.indexOf('async function handleConfirmAction(id) {'));
  assert.match(confirmar, /const persistedTransaction = outcome\.result\.data;\s*if \(persistedTransaction\?\.id\) \{\s*ultimoConfirmadoRef\.current = \{/);
  assert.match(page, /const ULTIMO_CONFIRMADO_TTL_MS = 30 \* 60 \* 1000;/);
});

test('edição de lançamento salvo: edição vencida avisa em vez de cair no fluxo genérico', async () => {
  const page = await source('UniChatPage.jsx');
  const desvio = page.slice(page.indexOf('// Edição de lançamento salvo: resposta à lista ou ao card'));
  assert.match(desvio.slice(0, 900), /if \(edicaoPendenteRef\.current && !edicaoAtiva\(\)\) \{[\s\S]*?encerrarEdicao\('expired'\);[\s\S]*?createAssistantResponse\(TEXTO_EDICAO_VENCIDA/);
});

test('edição de lançamento salvo: frase de lançamento novo nunca vira "não encontrei" nem escolha da lista', async () => {
  const page = await source('UniChatPage.jsx');
  const tentar = page.slice(page.indexOf('function tentarPedidoDeEdicao('), page.indexOf('function tratarRespostaDaEdicao('));
  assert.match(tentar, /ACTION_STATEMENT_INTENTS\.has\(declaredIntent\)\s*\|\|\s*looksLikeFreshFinancialStatement\(texto\)/);
  assert.doesNotMatch(tentar, /\$\{pedido\.alvo\}/);
  const tratar = page.slice(page.indexOf('function tratarRespostaDaEdicao('), page.indexOf('async function confirmarEdicao('));
  assert.ok(tratar.indexOf('looksLikeFreshFinancialStatement(texto)') < tratar.indexOf('escolherCandidato(texto'));
});

test('pergunta sobre a categoria com o card na tela não vira categoria nova', async () => {
  const page = await source('UniChatPage.jsx');
  const changesSubject = page.indexOf("if (relation.relation === 'changes_subject') {");
  const newCategory = page.indexOf('resolvedInput.requestedCategoryName && action');
  assert.ok(changesSubject > 0 && newCategory > changesSubject);
  // Só o card do rascunho sai de cena, e só depois de a criação abrir.
  assert.match(
    page,
    /if \(startCategoryDependency\(resolvedInput\.requestedCategoryName, draftAction\)\) \{\s*setMessages\([\s\S]{0,120}message\.id === draftCardId/,
  );
});

// #80, BUG REAL EM PRODUCAO (voz, 10/10/2026): "Fazer um lançamento de
// teste… valor 350 reais" não casava com a regex de intenção, ia para o chat
// geral, e a Uni respondia que não conseguia registrar.
test('#80: com IA, o uni-interpret decide a frase nova antes das regras fixas', async () => {
  const page = await source('UniChatPage.jsx');
  const { body } = extractFunctionBody(page, 'function sendText(text, metadata) {');
  // Saldo declarado e meta também passam pelo modelo (#80, etapa 2b).
  assert.match(body, /const roteiaPeloModelo = Boolean\(effectiveWorkspace\?\.id && uniInterpretClient\.isSupported\(\)\);/);
  assert.doesNotMatch(page, /INTENTS_FORA_DO_INTERPRETADOR/);
  const modelIdx = body.indexOf('void rotearPeloModelo(functionalText,');
  const rulesIdx = body.indexOf('function runRuleBasedFlow() {');
  assert.ok(modelIdx > -1 && rulesIdx > modelIdx, 'o modelo roda antes das regras');
  assert.match(body, /if \(!handled\) runRuleBasedFlow\(\);/);
  // Sem nada pendente, os atalhos de regex não decidem a intenção. Com
  // rascunho na tela, cumprimento e agenda explícita continuam tirando a vez
  // dele, porque o modelo não é consultado nesse caso.
  assert.match(body, /if \(declaredIntent === 'conversation_common' && \(!roteiaPeloModelo \|\| hasPendingConversation\)\) \{/);
  assert.match(body, /declaredIntent\.startsWith\('agenda_'\) && \(!roteiaPeloModelo \|\| hasPendingFinancialConversation\)/);
  assert.ok(body.indexOf('const hasPendingFinancialConversation') < body.indexOf('const hasAgendaConversation'));
});

test('#80: lançamento e plano interpretados pelo modelo nunca vão ao chat geral', async () => {
  const page = await source('UniChatPage.jsx');
  const { body } = extractFunctionBody(page, 'async function rotearPeloModelo(text, turn) {');
  assert.notEqual(body, '');
  const lancamento = body.slice(body.indexOf('case ROTAS_INTERPRETACAO.LANCAMENTO:'), body.indexOf('case ROTAS_INTERPRETACAO.CONSULTA:'));
  assert.match(lancamento, /financialConversation\.startFromParsed\(parsed, overrides\)/);
  // O plano nasce da mesma interpretação: nenhuma segunda chamada à IA.
  assert.match(body, /case ROTAS_INTERPRETACAO\.CONSULTA: \{[\s\S]*?runDeterministicFinancialFlow\(text, historySnapshot, true\);/);
  assert.match(lancamento, /iniciarPlanoFinanceiro\(interpretacaoParaPlano\(interpretacao\), text\);/);
  assert.doesNotMatch(lancamento, /handleUnresolvedMessage/);
  assert.doesNotMatch(lancamento, /não consigo registrar/i);
  // Turno trocado durante a frase natural não deixa rascunho invisível.
  assert.match(lancamento, /financialConversation\.reset\(\);/);
});

test('#80: saldo responde que o app não usa mais saldo e meta sem ação responde que ainda não cria objetivos', async () => {
  const page = await source('UniChatPage.jsx');
  const { body } = extractFunctionBody(page, 'async function rotearPeloModelo(text, turn) {');
  // A mesma resposta da trava de saldo do sendText, sem card de ajuste.
  assert.match(body, /case ROTAS_INTERPRETACAO\.SALDO:\s*setIsTyping\(false\);\s*responderResumoSemSaldo\(text, true\);\s*return true;/);
  const { body: sendText } = extractFunctionBody(page, 'function sendText(text, metadata) {');
  assert.match(sendText, /responderResumoSemSaldo\(functionalText, isRetiredBalanceRequest\);/);
  const saldo = body.slice(body.indexOf('case ROTAS_INTERPRETACAO.SALDO:'), body.indexOf('case ROTAS_INTERPRETACAO.META:'));
  assert.doesNotMatch(saldo, /startFromParsed/);
  // Interpretação sem ação de meta (função antiga): a resposta de antes.
  assert.match(body, /case ROTAS_INTERPRETACAO\.META:\s*setIsTyping\(false\);[\s\S]*?if \(!interpretacao\.meta\?\.acao\) \{\s*createAssistantResponse\(TEXTO_META_SEM_CRIACAO, \{ deduplicateNarration: false \}\);\s*return true;\s*\}/);
  // Sem o modelo, a meta recebe a mesma resposta pelas regras.
  assert.match(page, /result\.parsed\?\.intent === 'create_goal'\) \{\s*createAssistantResponse\(TEXTO_META_SEM_CRIACAO\);/);
});

// #192: meta pela conversa e pela voz, no padrão do pedido de categoria.
test('#192: pedido de meta com ação vai ao card ou à consulta, confirma e cancela pelo toque e pela frase', async () => {
  const page = await source('UniChatPage.jsx');
  const { body } = extractFunctionBody(page, 'async function rotearPeloModelo(text, turn) {');
  assert.match(body, /case ROTAS_INTERPRETACAO\.META:[\s\S]*?await iniciarPedidoDeMeta\(interpretacao\.meta, turnToken\);\s*return true;/);
  // Consultar responde na hora; excluir confere os aportes antes do card.
  const { body: iniciar } = extractFunctionBody(page, 'async function iniciarPedidoDeMeta(pedidoDoModelo, turnToken) {');
  assert.match(iniciar, /acao === 'consultar'[\s\S]*?textoDaConsultaDeMetas\(pedidoDoModelo, \{ metas: goalsState\.goals \}\)/);
  assert.match(iniciar, /await listContributions\(pronto\.meta\.id\)/);
  assert.match(iniciar, /uniTurnTokenRef\.current !== turnToken\) return;/);
  assert.match(iniciar, /metaTemDinheiro\(pronto\.meta, quantidadeDeAportes\)[\s\S]*?textoDaMetaComAportes\(pronto\.meta, quantidadeDeAportes\)/);
  // Metas sem ler (erro) não viram "você não tem metas"; recarga com a lista em mãos não bloqueia.
  assert.match(iniciar, /goalsState\.isLoading && goalsState\.goals\.length === 0/);
  assert.match(iniciar, /goalsState\.error && goalsState\.error\.code !== 'SUPABASE_NOT_CONFIGURED'/);
  // Grava pelo hook da tela Metas.
  const { body: confirmar } = extractFunctionBody(page, 'async function confirmarPedidoDeMeta(id) {');
  assert.match(confirmar, /goalsState\.addGoal\(pronto\.payload\)/);
  assert.match(confirmar, /goalsState\.editGoal\(pronto\.meta\.id, pronto\.payload\)/);
  assert.match(confirmar, /goalsState\.removeGoal\(pronto\.meta\.id\)/);
  assert.match(confirmar, /notifyFinancialDataChanged\('uni-chat'\)/);
  // Toque no card, frase nova e troca de assunto.
  const { body: confirmAction } = extractFunctionBody(page, 'async function handleConfirmAction(id) {');
  assert.match(confirmAction, /metaPendenteRef\.current\?\.messageId === id[\s\S]*?await confirmarPedidoDeMeta\(id\)[\s\S]*?reportConfirmationError\(id, TEXTO_META_VENCIDA\)/);
  // A chave da desestruturação confunde extractFunctionBody: a busca é na página.
  assert.match(page, /function handleCancelAction\(id, \{ cascade = false \} = \{\}\) \{[\s\S]*?metaPendenteRef\.current\?\.messageId === id\) \{\s*cancelarPedidoDeMeta\(id\);/);
  const { body: sendText } = extractFunctionBody(page, 'function sendText(text, metadata) {');
  assert.match(sendText, /if \(tratarPedidoDeMetaPendente\(functionalText, userMsg\)\) return;/);
  const { body: abandonar } = extractFunctionBody(page, 'function abandonStalePendingState() {');
  assert.match(abandonar, /encerrarPedidoDeMeta\('expired'\)/);
});

// #161: aporte e retirada pela conversa gravam pela mesma função da folha.
test('#161: aporte e retirada conferem as contas, gravam pelo hook da tela com chave de idempotência e falam o novo guardado', async () => {
  const page = await source('UniChatPage.jsx');
  const { body: iniciar } = extractFunctionBody(page, 'async function iniciarPedidoDeMeta(pedidoDoModelo, turnToken) {');
  // Só a primeira carga das contas conta como "sem contas": recarga e erro
  // de gravação antiga mantêm a lista.
  assert.match(iniciar, /const contasSemLer = accountState\.accounts\.length === 0 && \(accountState\.isLoading \|\| accountState\.error\);/);
  assert.match(iniciar, /montarPedidoDeMeta\(pedidoDoModelo, \{\s*metas: goalsState\.goals,\s*contas: contasSemLer \? null : accountState\.activeAccounts,/);
  assert.match(iniciar, /clientOperationId: movimento \? globalThis\.crypto\?\.randomUUID\?\.\(\) \?\? null : null,/);
  const { body: confirmar } = extractFunctionBody(page, 'async function confirmarPedidoDeMeta(id) {');
  assert.match(confirmar, /goalsState\.addGoalContribution\(pronto\.meta\.id, pronto\.payload\)/);
  // Erro da gravação não pode virar "não consegui ler as suas metas" no pedido seguinte.
  assert.match(confirmar, /if \(resultado\?\.error\) \{\s*(?:\/\/[^\n]*\n\s*)*goalsState\.clearError\(\);/);
  assert.match(confirmar, /textoDoErroDoMovimento\(resultado\.error, pronto\.acao\)/);
  assert.match(confirmar, /textoDoPedidoDeMetaFeito\(pronto, \{ metaAtualizada: resultado\?\.data\?\.meta \?\? null \}\)/);
});

test('#80: consulta com parâmetros soma o período inteiro no banco; outra pergunta ou falha vai para as regras', async () => {
  const page = await source('UniChatPage.jsx');
  const { body } = extractFunctionBody(page, 'async function rotearPeloModelo(text, turn) {');
  const consulta = body.slice(body.indexOf('case ROTAS_INTERPRETACAO.CONSULTA:'), body.indexOf('case ROTAS_INTERPRETACAO.AGENDA:'));
  assert.match(consulta, /if \(consultaRespondivel\(interpretacao\.consulta\)\) \{\s*const resposta = await responderConsultaDoModelo\(interpretacao\.consulta, interpretacao\.dataReferencia\);\s*if \(uniTurnTokenRef\.current !== turnToken\) return true;/);
  // A memória troca a última consulta: as regras não refinam uma pergunta anterior.
  assert.match(consulta, /if \(resposta\) \{\s*setIsTyping\(false\);\s*conversationalMemoryRef\.current\.remember\(memoriaDaConsulta\(interpretacao\.consulta, resposta\)\);\s*createAssistantResponse\(resposta, \{ deduplicateNarration: false \}\);\s*return true;\s*\}/);
  assert.match(consulta, /setIsTyping\(false\);\s*runDeterministicFinancialFlow\(text, historySnapshot, true\);\s*return true;\s*\}\s*$/);

  // O chat só carrega as movimentações recentes: a soma vem do período
  // inteiro, só das concluídas, e falha de busca devolve null.
  const { body: busca } = extractFunctionBody(page, 'async function responderConsultaDoModelo(consulta, dataDaFuncao) {');
  assert.match(busca, /listTransactionsForPeriod\(effectiveWorkspace\.id, \{\s*dateFrom: periodo\.inicio,\s*dateTo: periodo\.fim,\s*status: 'completed',\s*\}\)/);
  assert.match(busca, /if \(error\) return null;/);
  assert.match(busca, /catch \{\s*return null;\s*\}/);
});

test('#80: sem interpretação ou sem entender, as regras fixas tentam antes do chat geral', async () => {
  const page = await source('UniChatPage.jsx');
  const { body } = extractFunctionBody(page, 'async function rotearPeloModelo(text, turn) {');
  assert.match(body, /if \(!rota \|\| rota === ROTAS_INTERPRETACAO\.NAO_ENTENDI\) \{\s*setIsTyping\(false\);\s*return false;\s*\}/);
  assert.doesNotMatch(body, /handleUnresolvedMessage/);
});

test('#80: plano só com parcela ou recorrência não fica pendente prendendo as próximas frases', async () => {
  const page = await source('UniChatPage.jsx');
  const { body } = extractFunctionBody(page, 'function iniciarPlanoFinanceiro(plan, text) {');
  assert.match(body, /if \(newPlan\.operations\.every\(\(operation\) => operation\.capabilityPending\)\) \{[\s\S]*?Nada foi registrado\.[\s\S]*?return;\s*\}\s*setFinancialPlan\(newPlan\);/);
});

test('#80: sem o modelo, várias operações ou parcela pedem outro jeito em vez de abrir um card errado', async () => {
  const page = await source('UniChatPage.jsx');
  const { body } = extractFunctionBody(page, 'function runRuleBasedFlow() {');
  assert.match(body, /const motivo = motivoParaNaoLerSemModelo\(functionalText\);\s*if \(motivo\) \{\s*createAssistantResponse\(TEXTO_SEM_MODELO\[motivo\]\);\s*return;\s*\}/);
});

test('#80: recorrência numa operação só abre o card do mês e avisa que a repetição não é automática', async () => {
  const page = await source('UniChatPage.jsx');
  const { body } = extractFunctionBody(page, 'async function rotearPeloModelo(text, turn) {');
  assert.match(body, /publishConversationResult\(phrased\);\s*if \(interpretacao\.operacoes\[0\]\?\.recorrente === true\) \{\s*createAssistantResponse\(TEXTO_RECORRENCIA_SO_ESTE_LANCAMENTO/);
});

// BUG REAL EM PRODUÇÃO (voz, 11/10/2026): com a Uni perguntando o valor, a
// frase inteira com valor, data e categoria ia para as regras, que só liam a
// categoria; a Uni perguntou o valor quatro vezes. A resposta ao rascunho é
// lida pelo uni-interpret, com o rascunho, antes das regras.
test('#80: resposta ao rascunho vai ao uni-interpret antes das regras, que ficam de reserva', async () => {
  const page = await source('UniChatPage.jsx');
  const { body } = extractFunctionBody(page, 'function handlePendingConversationInput(text, userMsg) {');
  const modelo = body.indexOf('if (podeLerRascunhoPeloModelo(action)) {');
  const regras = body.indexOf('const resolvedInput = resolvePendingActionInput({');
  const dependencia = body.indexOf('if (categoryDependencyActive) {');
  assert.ok(modelo > -1 && regras > -1 && modelo < regras, 'o modelo lê antes das regras');
  assert.ok(dependencia > -1 && dependencia < modelo, 'cards de criar conta ou categoria seguem com o fluxo próprio');
  assert.match(body, /void lerRascunhoPeloModelo\(text, action, responderPelasRegras\);/);

  const { body: leitura } = extractFunctionBody(page, 'async function lerRascunhoPeloModelo(text, action, pelasRegras) {');
  assert.match(leitura, /rascunho: montarRascunhoParaInterpretacao\(action\)/);
  // #184: a correção só escolhe entre as categorias visíveis (sem as ocultas).
  assert.match(leitura, /const correcao = correcaoDoRascunho\(interpretacao, action, \{ categorias: categoriasSugeriveis \}\);/);
  // Toque no card durante a espera: a resposta do modelo é descartada.
  assert.match(leitura, /if \(rascunhoAtualRef\.current !== action\) return;/);
  assert.match(leitura, /if \(!correcao\) \{\s*pelasRegras\(\);/);
  assert.match(leitura, /uniTurnTokenRef\.current !== turnToken/);
  // Com o modelo lendo primeiro, a segunda chamada depois das regras sobra.
  assert.doesNotMatch(page, /correctPendingWithAi/);
});

// Conversa por voz de 11/10/2026: pedir a categoria Impostos virou um
// lançamento sem valor. Pedido de categoria tem card próprio.
test('pedido de categoria: card próprio, confirmado e cancelado pelo id antes das outras pendências', async () => {
  const page = await source('UniChatPage.jsx');
  const confirmar = page.slice(page.indexOf('async function handleConfirmAction(id) {'));
  assert.match(confirmar.slice(0, 400), /if \(categoriaPendenteRef\.current\?\.messageId === id\) \{\s*if \(pedidoDeCategoriaAtivo\(\)\) \{\s*await confirmarPedidoDeCategoria\(id\);\s*\} else \{\s*encerrarPedidoDeCategoria\('expired'\);\s*reportConfirmationError\(id, TEXTO_CATEGORIA_VENCIDA\);/);
  const cancelar = page.slice(page.indexOf('function handleCancelAction(id, { cascade = false } = {}) {'));
  assert.match(cancelar.slice(0, 300), /if \(categoriaPendenteRef\.current\?\.messageId === id\) \{\s*cancelarPedidoDeCategoria\(id\);/);
  assert.match(page, /case ROTAS_INTERPRETACAO\.CATEGORIA:\s*setIsTyping\(false\);\s*iniciarPedidoDeCategoria\(interpretacao\.categoria\);/);
  // Confirmar falando chega como "Confirmar" pelo sendText.
  assert.match(page, /if \(tratarPedidoDeCategoriaPendente\(functionalText, userMsg\)\) return;/);
  // Card vencido: "Confirmar" ouve que nada foi salvo, como na edição.
  const pendente = extractFunctionBody(page, 'function tratarPedidoDeCategoriaPendente(texto, userMsg) {').body;
  assert.match(pendente, /if \(respostaAoPedidoDeCategoria\(texto, pendente\.pronto\) === 'input'\) return false;\s*syncMessageToSupabase\(userMsg\);\s*createAssistantResponse\(TEXTO_CATEGORIA_VENCIDA/);
  // Trocar de assunto abandona também o pedido de categoria.
  const abandono = extractFunctionBody(page, 'function abandonStalePendingState() {').body;
  assert.match(abandono, /encerrarPedidoDeCategoria\('expired'\);/);
  // Papel ainda carregando não vira "sem permissão".
  assert.match(page, /if \(workspaceRole\.isLoading\) \{\s*createAssistantResponse\('Ainda estou carregando as permissões/);
});

test('pedido de categoria: grava pelo hook da tela, com o texto de erro de lá', async () => {
  const page = await source('UniChatPage.jsx');
  const corpo = page.slice(page.indexOf('async function confirmarPedidoDeCategoria(id) {'), page.indexOf('function cancelarPedidoDeCategoria(id) {'));
  assert.match(corpo, /categoryState\.saveCategory\(\{ name: pronto\.nome, category_type: pronto\.categoryType \}\)/);
  assert.match(corpo, /categoryState\.saveCategory\(\{ name: pronto\.nome \}, pronto\.categoria\.id\)/);
  assert.match(corpo, /categoryState\.removeCategory\(pronto\.categoria\.id\)/);
  assert.match(corpo, /getCategoryErrorMessage\(resultado\.error,/);
  assert.match(corpo, /createAssistantResponse\(withFollowUpQuestion\(textoDoPedidoFeito\(pronto\)\)\)/);
  // Gravou: o pedido acaba antes de conferir a conversa, e as outras telas
  // recarregam as categorias.
  assert.ok(corpo.indexOf('categoriaPendenteRef.current = null;') < corpo.indexOf('if (activeIdRef.current !== pendente.conversationId) return;'));
  assert.match(corpo, /notifyFinancialDataChanged\('uni-chat'\);/);
});
