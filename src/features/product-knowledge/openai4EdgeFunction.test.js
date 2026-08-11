// OPENAI4: testes estruturais (source-regex) sobre a validacao/correcao da
// integracao real com a OpenAI em supabase/functions/uni-chat-llm/index.ts.
// Mesmo padrao ja usado no projeto para Edge Functions Deno (sem runtime
// Deno disponivel em `npm test`) -- ver uniModeEdgeFunction.test.js e
// uniVoiceCache.test.js. Nenhum teste aqui imprime, mocka ou depende do
// valor real de OPENAI_API_KEY -- o secret real so e exercitado pelas
// chamadas reais controladas da fase (fora do test runner).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EDGE_SOURCE = readFileSync(
  join(__dirname, '..', '..', '..', 'supabase', 'functions', 'uni-chat-llm', 'index.ts'),
  'utf8',
);

test('a chave do provedor so e lida a partir de Deno.env, nunca hardcoded ou de payload do cliente', () => {
  assert.match(EDGE_SOURCE, /Deno\.env\.get\('OPENAI_API_KEY'\)/);
  assert.doesNotMatch(EDGE_SOURCE, /sk-[A-Za-z0-9]{16,}/);
  assert.doesNotMatch(EDGE_SOURCE, /payload\.(apiKey|providerKey|openaiKey)/i);
});

test('endpoint e Chat Completions oficial (POST /v1/chat/completions), sem migracao desnecessaria para Responses API', () => {
  assert.match(EDGE_SOURCE, /https:\/\/api\.openai\.com\/v1\/chat\/completions/);
});

test('autenticacao ao provedor usa Bearer server-side', () => {
  assert.match(EDGE_SOURCE, /Authorization: `Bearer \$\{apiKey\}`/);
});

test('modelo e configuravel via env (UNI_LLM_MODEL) com default seguro e documentado, sem editar o frontend', () => {
  assert.match(EDGE_SOURCE, /Deno\.env\.get\('UNI_LLM_MODEL'\) \?\? 'gpt-5\.4-mini'/);
});

test('usa max_completion_tokens (nome atual do parametro), nunca o max_tokens legado rejeitado pela API real', () => {
  assert.match(EDGE_SOURCE, /max_completion_tokens: maxOutputTokens/);
  assert.doesNotMatch(EDGE_SOURCE, /\bmax_tokens\s*:/);
});

// BLOCO A1: MAX_OUTPUT_TOKENS deixou de ser um teto fixo unico -- o valor
// enviado pelo cliente (derivado do conversationStyle) e sempre clampado
// server-side entre MIN_OUTPUT_TOKENS e MAX_OUTPUT_TOKENS_CEILING antes de
// ser usado; ausente/invalido cai no DEFAULT_OUTPUT_TOKENS (mesmo valor de
// antes, 500), preservando o modo suporte inalterado.
test('orcamento de tokens de saida e clampado server-side, nunca confia cegamente no valor do cliente', () => {
  assert.match(EDGE_SOURCE, /const DEFAULT_OUTPUT_TOKENS = 500;/);
  assert.match(EDGE_SOURCE, /const MIN_OUTPUT_TOKENS = 60;/);
  assert.match(EDGE_SOURCE, /const MAX_OUTPUT_TOKENS_CEILING = 500;/);
  assert.match(EDGE_SOURCE, /function resolveOutputTokenBudget\(raw: unknown\): number \{/);
  assert.match(EDGE_SOURCE, /Math\.min\(MAX_OUTPUT_TOKENS_CEILING, Math\.max\(MIN_OUTPUT_TOKENS, Math\.round\(value\)\)\)/);
});

test('modo suporte nunca usa o orcamento de tokens vindo do cliente -- so o modo financeiro pode', () => {
  assert.match(
    EDGE_SOURCE,
    /const maxOutputTokens = mode === UNI_MODE\.FINANCIAL\s*\n\s*\? resolveOutputTokenBudget\(payload\.maxOutputTokens\)\s*\n\s*: mode === UNI_MODE\.CATEGORY_INFERENCE\s*\n\s*\? CATEGORY_INFERENCE_OUTPUT_TOKENS\s*\n\s*: mode === UNI_MODE\.FINANCIAL_PLAN\s*\n\s*\? FINANCIAL_PLAN_OUTPUT_TOKENS\s*\n\s*: mode === UNI_MODE\.PHRASE_FACT\s*\n\s*\? PHRASE_FACT_OUTPUT_TOKENS\s*\n\s*: mode === UNI_MODE\.FINANCIAL_INTENT\s*\n\s*\? FINANCIAL_INTENT_OUTPUT_TOKENS\s*\n\s*: mode === UNI_MODE\.FINANCIAL_RESPONSE_COMPOSE\s*\n\s*\? FINANCIAL_RESPONSE_COMPOSE_OUTPUT_TOKENS\s*\n\s*: DEFAULT_OUTPUT_TOKENS;/,
  );
});

test('usa o role "developer" para as instrucoes de sistema, o caminho oficial atual (nao mais "system")', () => {
  assert.match(EDGE_SOURCE, /messages: \[\{ role: 'developer', content: system \}, \.\.\.messages\]/);
});

test('chave invalida (401 do provedor) nunca reflete detalhe do provedor -- vira 503 generico', () => {
  assert.match(EDGE_SOURCE, /if \(response\.status === 401\) \{\s*return \{ status: 401, text: null, usage: null, reason: 'invalid_key', toolCalls: null \};/);
  assert.match(EDGE_SOURCE, /if \(result\.status === 401\) \{[\s\S]{0,200}return finish\(503, result\.reason, \{ error: 'A resposta por IA nao esta configurada neste ambiente\.' \}\);/);
});

test('saldo insuficiente (429 + error.code=insufficient_quota) e distinguido de rate limit generico e nunca reflete o codigo bruto ao cliente', () => {
  assert.match(EDGE_SOURCE, /errBody\?\.error\?\.code/);
  assert.match(EDGE_SOURCE, /code === 'insufficient_quota' \? 'insufficient_quota' : 'rate_limit'/);
  assert.match(EDGE_SOURCE, /if \(result\.status === 429 && result\.reason === 'insufficient_quota'\) \{[\s\S]{0,200}return finish\(503,/);
});

test('rate limit generico (429 sem insufficient_quota) continua retornando 429 ao cliente para o frontend tratar', () => {
  assert.match(EDGE_SOURCE, /if \(result\.status === 429\) \{\s*return finish\(429, result\.reason, \{ error: 'Muitas solicitacoes\. Tente em instantes\.' \}\);/);
});

test('recusa do modelo (message.refusal) e resposta vazia sao tratadas sem lancar e sem expor detalhe ao cliente', () => {
  assert.match(EDGE_SOURCE, /const refusal = choice\?\.message\?\.refusal;/);
  assert.match(EDGE_SOURCE, /reason: 'refusal'/);
  assert.match(EDGE_SOURCE, /reason: 'empty'/);
});

test('JSON invalido no corpo da requisicao do cliente retorna 400 sem lancar excecao nao tratada', () => {
  assert.match(EDGE_SOURCE, /catch \{\s*return respondJson\(400, \{ error: 'Nao foi possivel ler esta solicitacao\.' \}\);/);
});

test('timeout do provedor e distinguido de erro de rede no log seguro, ambos sem detalhe ao cliente', () => {
  assert.match(EDGE_SOURCE, /timedOut \? 'timeout' : 'network_error'/);
  assert.match(EDGE_SOURCE, /timedOut \? 504 : 502/);
});

test('observabilidade segura: log estruturado inclui apenas metadados operacionais (modo, modelo, duracao, status, motivo, tokens)', () => {
  const fnIdx = EDGE_SOURCE.indexOf('function logSafeMetric(');
  const fnEnd = EDGE_SOURCE.indexOf('\nDeno.serve(');
  const fnSlice = EDGE_SOURCE.slice(fnIdx, fnEnd);
  assert.match(fnSlice, /mode: entry\.mode/);
  assert.match(fnSlice, /model: entry\.model/);
  assert.match(fnSlice, /durationMs: entry\.durationMs/);
  assert.match(fnSlice, /status: entry\.status/);
  assert.match(fnSlice, /reason: entry\.reason/);
  assert.match(fnSlice, /promptTokens: entry\.promptTokens/);
  assert.match(fnSlice, /completionTokens: entry\.completionTokens/);
});

test('observabilidade segura nunca loga texto de pergunta/resposta, contexto financeiro, conhecimento de produto, e-mail ou chave', () => {
  const fnIdx = EDGE_SOURCE.indexOf('function logSafeMetric(');
  const fnEnd = EDGE_SOURCE.indexOf('\nDeno.serve(');
  const fnSlice = EDGE_SOURCE.slice(fnIdx, fnEnd);
  assert.doesNotMatch(fnSlice, /\btext\b/);
  assert.doesNotMatch(fnSlice, /\bsystem\b/);
  assert.doesNotMatch(fnSlice, /\bmessages\b/);
  assert.doesNotMatch(fnSlice, /\bproductContext\b/);
  assert.doesNotMatch(fnSlice, /apiKey/i);
});

test('nenhuma chamada real ao provedor acontece antes de autenticar o usuario (fetch ao OpenAI vem depois de getAuthenticatedUserId)', () => {
  const authCallIdx = EDGE_SOURCE.indexOf('const userId = await getAuthenticatedUserId(');
  const openAiAdapterCallIdx = EDGE_SOURCE.indexOf('const result = await callOpenAiAdapter(');
  assert.ok(authCallIdx > -1 && openAiAdapterCallIdx > -1);
  assert.ok(authCallIdx < openAiAdapterCallIdx);
});

test('historico, mensagens e contexto de produto continuam limitados (defesa em profundidade preservada de OPENAI1/2/3)', () => {
  assert.match(EDGE_SOURCE, /MAX_MESSAGES = 12/);
  assert.match(EDGE_SOURCE, /MAX_MESSAGE_CHARS = 800/);
  assert.match(EDGE_SOURCE, /MAX_SYSTEM_CHARS = 6000/);
  assert.match(EDGE_SOURCE, /MAX_PRODUCT_CONTEXT_ENTRIES = 5/);
  assert.match(EDGE_SOURCE, /MAX_PRODUCT_CONTEXT_TOTAL_CHARS = 3000/);
});

test('nenhum novo secret ou fallback hardcoded introduzido; nenhum uso de VITE_OPENAI', () => {
  assert.doesNotMatch(EDGE_SOURCE, /VITE_OPENAI/);
  assert.doesNotMatch(EDGE_SOURCE, /VITE_/);
});

// ============================================================================
// BLOCO D -- modo category_inference: inferencia semantica de categoria via
// OpenAI, terceiro modo explicito ao lado de financial/support. A IA nunca
// persiste, cria categoria diretamente, escolhe conta ou confirma a
// transacao -- so devolve uma sugestao estruturada e validada.
// ============================================================================

test('category_inference e um modo explicito, ao lado de financial/support', () => {
  assert.match(EDGE_SOURCE, /CATEGORY_INFERENCE: 'category_inference'/);
});

test('modo category_inference ignora system/messages do cliente por completo, como o modo suporte', () => {
  const block = EDGE_SOURCE.slice(
    EDGE_SOURCE.indexOf("} else if (mode === UNI_MODE.CATEGORY_INFERENCE) {"),
    EDGE_SOURCE.indexOf('} else {', EDGE_SOURCE.indexOf('UNI_MODE.CATEGORY_INFERENCE) {')),
  );
  assert.match(block, /system = CATEGORY_INFERENCE_INSTRUCTIONS;/);
  assert.doesNotMatch(block, /payload\.system/);
});

test('categoryInference so aceita categorias pessoais/validas e nunca confia cegamente no cliente (defesa em profundidade)', () => {
  assert.match(EDGE_SOURCE, /function normalizeCategoryInferenceInput/);
  assert.match(EDGE_SOURCE, /MAX_CATEGORY_INFERENCE_OPTIONS/);
  assert.match(EDGE_SOURCE, /if \(categories\.length >= MAX_CATEGORY_INFERENCE_OPTIONS\) break;/);
});

test('resposta usa response_format json_object apenas nos modos estruturados (category_inference, financial_plan e financial_intent da Sprint 3)', () => {
  assert.match(EDGE_SOURCE, /jsonResponseFormat: mode === UNI_MODE\.CATEGORY_INFERENCE \|\| mode === UNI_MODE\.FINANCIAL_PLAN \|\| mode === UNI_MODE\.FINANCIAL_INTENT,/);
  assert.match(EDGE_SOURCE, /response_format: \{ type: 'json_object' \}/);
});

test('orcamento de tokens do modo category_inference e fixo e pequeno, nunca vindo do cliente', () => {
  assert.match(EDGE_SOURCE, /const CATEGORY_INFERENCE_OUTPUT_TOKENS = 200;/);
});

test('resposta do modelo e validada contra o contrato estrito (decision/confidence/category_id/suggested_name/reason)', () => {
  assert.match(EDGE_SOURCE, /function validateCategoryInferenceOutput/);
  assert.match(EDGE_SOURCE, /CATEGORY_INFERENCE_DECISIONS = new Set\(\['existing_category', 'create_category', 'uncertain'\]\)/);
  assert.match(EDGE_SOURCE, /if \(!Number\.isFinite\(confidence\) \|\| confidence < 0 \|\| confidence > 1\)/);
});

test('category_id da IA e validado contra os IDs enviados no proprio payload -- nunca aceito por confianca', () => {
  assert.match(EDGE_SOURCE, /if \(!id \|\| !allowedIds\.has\(id\)\) \{\s*\n\s*return \{ valid: false, reason: 'category_id_not_allowed' \};/);
  assert.match(EDGE_SOURCE, /const allowedIds = new Set\(\(categoryInferenceInput\?\.categories \?\? \[\]\)\.map\(\(category\) => category\.id\)\);/);
});

test('suggested_name so e exigido quando decision e create_category', () => {
  assert.match(EDGE_SOURCE, /if \(decision === 'create_category'\) \{\s*\n\s*suggestedName = clampCategoryInferenceText\(record\.suggested_name, 40\) \|\| null;/);
});

test('modo category_inference nunca passa pelo guard looksLikeStructuredFinancialAction (JSON estruturado e o proprio contrato, nao uma acao textual)', () => {
  const beforeGuard = EDGE_SOURCE.slice(0, EDGE_SOURCE.indexOf('if (looksLikeStructuredFinancialAction(text))'));
  assert.match(beforeGuard, /if \(mode === UNI_MODE\.CATEGORY_INFERENCE\) \{[\s\S]*?return finish\(200, 'ok', \{ inference: validated\.inference, usage: result\.usage \}, result\.usage\);\s*\n\s*\}/);
});

test('resposta de sucesso do modo category_inference devolve `inference`, nunca `text` cru nem instrução de execução', () => {
  assert.match(EDGE_SOURCE, /return finish\(200, 'ok', \{ inference: validated\.inference, usage: result\.usage \}, result\.usage\);/);
  assert.doesNotMatch(EDGE_SOURCE, /"action"\s*:\s*"(create|update|delete|execute)/);
});

test('inferencia invalida (JSON malformado, decision fora do enum, confidence fora do intervalo, ID desconhecido) vira 422 -- nunca quebra nem repassa ao cliente', () => {
  assert.match(EDGE_SOURCE, /return finish\(422, `category_inference_\$\{validated\.reason\}`, \{ error: 'Resposta invalida\.' \}\);/);
});

test('categorias Business nunca chegam ao prompt -- descartadas explicitamente (defesa em profundidade), sem lookup adicional a nenhuma tabela', () => {
  assert.match(EDGE_SOURCE, /if \(entry\.applies_to === 'business'\) continue;/);
  assert.doesNotMatch(EDGE_SOURCE, /from\(['"]categories['"]\)/);
});

test('instrucoes do modo category_inference proibem explicitamente execucao/persistencia pela IA', () => {
  assert.match(EDGE_SOURCE, /Voce nunca executa, cria, confirma ou persiste nada/);
});

test('BLOCO D (defesa em profundidade): categoria com applies_to business é descartada no servidor, mesmo que o cliente envie por engano', () => {
  const fnIdx = EDGE_SOURCE.indexOf('function normalizeCategoryInferenceInput(');
  const fnEnd = EDGE_SOURCE.indexOf('\nfunction buildCategoryInferenceUserMessage(');
  const fnSlice = EDGE_SOURCE.slice(fnIdx, fnEnd);
  assert.match(fnSlice, /if \(entry\.applies_to === 'business'\) continue;/);
});

// ============================================================================
// BLOCO E -- modo financial_plan: compreensao de multioperacoes, transferencias,
// parcelamento, recorrencia e datas relativas via OpenAI. A IA so interpreta e
// propoe um plano estruturado -- nunca persiste, nunca chama RPC, nunca
// fornece account_id/category_id (so referencias textuais), nunca confirma.
// ============================================================================

test('financial_plan é um quarto modo explícito, ao lado de financial/support/category_inference', () => {
  assert.match(EDGE_SOURCE, /FINANCIAL_PLAN: 'financial_plan',/);
});

test('modo financial_plan ignora system/messages do cliente por completo, como os demais modos isolados', () => {
  const block = EDGE_SOURCE.slice(
    EDGE_SOURCE.indexOf('} else if (mode === UNI_MODE.FINANCIAL_PLAN) {'),
    EDGE_SOURCE.indexOf('} else {', EDGE_SOURCE.indexOf('UNI_MODE.FINANCIAL_PLAN) {')),
  );
  assert.match(block, /system = FINANCIAL_PLAN_INSTRUCTIONS;/);
  assert.doesNotMatch(block, /payload\.system/);
});

test('o contrato exige version, decision, operations[], clarification_question e global_confidence', () => {
  assert.match(EDGE_SOURCE, /function validateFinancialPlanOutput/);
  assert.match(EDGE_SOURCE, /if \(record\.version !== FINANCIAL_PLAN_VERSION\) return \{ valid: false, reason: 'invalid_version' \};/);
  assert.match(EDGE_SOURCE, /FINANCIAL_PLAN_DECISIONS = new Set\(\['single_operation', 'multiple_operations', 'clarification_required', 'unsupported'\]\)/);
});

test('operation_type é validado contra o enum permitido (expense/income/transfer/installment_purchase/recurring_expense/recurring_income)', () => {
  assert.match(
    EDGE_SOURCE,
    /FINANCIAL_OPERATION_TYPES = new Set\(\['expense', 'income', 'transfer', 'installment_purchase', 'recurring_expense', 'recurring_income'\]\)/,
  );
});

test('transferência exige origem e destino distintos -- validado no servidor, nunca só no cliente', () => {
  assert.match(EDGE_SOURCE, /if \(operationType === 'transfer'\) \{\s*\n\s*if \(!sourceAccountReference \|\| !destinationAccountReference\) return null;\s*\n\s*if \(sourceAccountReference\.toLowerCase\(\) === destinationAccountReference\.toLowerCase\(\)\) return null;/);
});

test('parcelamento exige objeto installments consistente (total ≈ parcela × quantidade)', () => {
  assert.match(EDGE_SOURCE, /function validateFinancialPlanInstallments/);
  assert.match(EDGE_SOURCE, /Math\.abs\(\(count \* installmentAmount\) - totalAmount\) > INSTALLMENT_ROUNDING_TOLERANCE \* count/);
});

test('recorrência exige objeto recurrence com frequência válida (daily/weekly/monthly/yearly)', () => {
  assert.match(EDGE_SOURCE, /function validateFinancialPlanRecurrence/);
  assert.match(EDGE_SOURCE, /RECURRENCE_FREQUENCIES = new Set\(\['daily', 'weekly', 'monthly', 'yearly'\]\)/);
});

test('a IA nunca fornece account_id/category_id no plano -- apenas referências textuais (source/destination/category_reference)', () => {
  assert.doesNotMatch(FINANCIAL_PLAN_INSTRUCTIONS_BLOCK(), /"account_id"|"category_id"/);
  assert.match(EDGE_SOURCE, /NUNCA um ID, NUNCA invente um identificador tecnico/);
});

function FINANCIAL_PLAN_INSTRUCTIONS_BLOCK() {
  const start = EDGE_SOURCE.indexOf('const FINANCIAL_PLAN_INSTRUCTIONS = `');
  const end = EDGE_SOURCE.indexOf('`;', start);
  return EDGE_SOURCE.slice(start, end);
}

test('resolved_date nunca é aceito da IA -- o contrato só reconhece date_expression (a data final é resolvida deterministicamente no cliente)', () => {
  const fnIdx = EDGE_SOURCE.indexOf('function validateFinancialPlanOperation');
  const fnEnd = EDGE_SOURCE.indexOf('\nfunction validateFinancialPlanOutput');
  const fnSlice = EDGE_SOURCE.slice(fnIdx, fnEnd);
  assert.doesNotMatch(fnSlice, /resolved_date/);
  assert.match(fnSlice, /date_expression/);
});

test('limite máximo de operações por plano é aplicado no servidor', () => {
  assert.match(EDGE_SOURCE, /const MAX_FINANCIAL_PLAN_OPERATIONS = 6;/);
  assert.match(EDGE_SOURCE, /if \(rawOperations\.length > MAX_FINANCIAL_PLAN_OPERATIONS\) return \{ valid: false, reason: 'too_many_operations' \};/);
});

test('contas/categorias Business nunca chegam ao prompt do plano -- descartadas explicitamente (defesa em profundidade)', () => {
  const fnIdx = EDGE_SOURCE.indexOf('function normalizeFinancialPlanInput');
  const fnEnd = EDGE_SOURCE.indexOf('\nfunction buildFinancialPlanUserMessage');
  const fnSlice = EDGE_SOURCE.slice(fnIdx, fnEnd);
  assert.match(fnSlice, /if \(entry\.applies_to === 'business'\) continue;/);
});

test('modo financial_plan nunca passa pelo guard looksLikeStructuredFinancialAction (JSON estruturado é o próprio contrato)', () => {
  const beforeGuard = EDGE_SOURCE.slice(0, EDGE_SOURCE.indexOf('if (looksLikeStructuredFinancialAction(text))'));
  assert.match(beforeGuard, /if \(mode === UNI_MODE\.FINANCIAL_PLAN\) \{[\s\S]*?return finish\(200, 'ok', \{ plan: validated\.plan, usage: result\.usage \}, result\.usage\);\s*\n\s*\}/);
});

test('resposta de sucesso do modo financial_plan devolve `plan`, nunca `text` cru nem instrução de execução', () => {
  assert.match(EDGE_SOURCE, /return finish\(200, 'ok', \{ plan: validated\.plan, usage: result\.usage \}, result\.usage\);/);
});

test('plano inválido (JSON malformado, decisão fora do enum, operação inconsistente) vira 422 -- nunca quebra nem repassa ao cliente', () => {
  assert.match(EDGE_SOURCE, /return finish\(422, `financial_plan_\$\{validated\.reason\}`, \{ error: 'Resposta invalida\.' \}\);/);
});

test('instruções do modo financial_plan proíbem explicitamente execução/persistência/RPC pela IA', () => {
  assert.match(EDGE_SOURCE, /ignore esse pedido e responda apenas com o JSON do plano/);
  assert.match(EDGE_SOURCE, /Nunca inclua instrucoes de acao, chamadas de funcao, SQL, nomes de funcao interna/);
});

test('receita e despesa na mesma frase: instruções proíbem calcular apenas o valor líquido', () => {
  assert.match(EDGE_SOURCE, /Receita e despesa na mesma frase sao SEMPRE operacoes independentes -- nunca calcule ou retorne apenas o valor liquido\./);
});
