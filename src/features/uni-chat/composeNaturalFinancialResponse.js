// Sprint 4 (Blocos 4.3.1, 4.3.4, 4.3.5, 4.3.6) — composição de resposta
// natural a partir de FATOS JÁ ESTRUTURADOS.
//
// Decisão de escopo (documentada no relatório final do Ciclo 2): esta
// implementação é 100% determinística -- nunca chama a LLM para "reescrever"
// o texto. O `responseDraft` que ela recebe já vem pronto e correto do
// orquestrador semântico (financialSemanticOrchestrator.js), construído
// pelos handlers do registro de capacidades a partir do snapshot real
// (financialCapabilityRegistry.js) -- esta camada só ADICIONA acolhimento
// (4.3.4) e explicação de termos (4.3.5) em cima desse texto, nunca
// recalcula nem reformula os números.
//
// Uma composição verdadeiramente natural via LLM (recebendo os fatos
// estruturados e devolvendo texto livre) exigiria um novo modo na Edge
// Function uni-chat-llm + deploy em DEV -- fora do escopo deste ciclo sem
// autorização explícita (ver relatório final). A flag
// VITE_UNI_LLM_RESPONSE_COMPOSER_ENABLED existe e nasce `false`, mas não
// tem nenhuma implementação por trás dela ainda -- é um placeholder
// documentado, não uma capacidade real.
import { normalizeFinancialText } from './financialSnapshot.js';

const EMOTIONAL_TAGS = new Set(['emotional_concern', 'emotional_distress']);

// Bloco 4.3.5 — glossário de termos financeiros. Uma frase simples, com
// exemplo prático, sempre a mesma explicação (determinística, nunca
// inventada por uma LLM).
const GLOSSARY = Object.freeze({
  categoria: 'Categoria é o grupo usado para organizar um gasto -- por exemplo, uma compra no mercado entra em Alimentação.',
  saldo: 'Saldo é quanto você tem disponível numa conta ou no total, somando entradas e saídas.',
  receita: 'Receita é qualquer dinheiro que entra, como salário ou um pagamento recebido.',
  despesa: 'Despesa é qualquer dinheiro que sai, como uma compra ou conta paga.',
  'fluxo de caixa': 'Fluxo de caixa é a diferença entre o que entrou e o que saiu num período.',
  periodo: 'Período é o intervalo de tempo que você quer consultar, como "este mês" ou "julho".',
  conta: 'Conta é onde o dinheiro fica guardado ou de onde ele sai, como um banco ou carteira.',
  comparacao: 'Comparação mostra a diferença entre dois períodos, por exemplo este mês e o mês passado.',
  media: 'Média é a soma de um conjunto de valores dividida pela quantidade de valores.',
  recorrencia: 'Recorrência é um gasto ou receita que se repete regularmente, como uma assinatura.',
  orcamento: 'Orçamento é um limite planejado de gastos para um período.',
});

// Devolve a explicação de um termo financeiro conhecido, ou null se o
// termo não está no glossário -- nunca inventa uma explicação para um
// termo desconhecido.
export function explainFinancialTerm(rawTerm) {
  const normalized = normalizeFinancialText(rawTerm);
  if (!normalized) return null;
  const key = Object.keys(GLOSSARY).find((entry) => normalized === entry || normalized.includes(entry));
  if (!key) return null;
  return { term: key, explanation: GLOSSARY[key] };
}

function buildEmotionalPrefix(reasoningTags) {
  const hasEmotionalSignal = Array.isArray(reasoningTags) && reasoningTags.some((tag) => EMOTIONAL_TAGS.has(tag));
  return hasEmotionalSignal ? 'Entendo a preocupação. ' : '';
}

// Bloco 4.3.1 — composição principal. Recebe o responseDraft JÁ PRONTO
// (nunca recalcula) e só adiciona acolhimento/explicação de termo.
// `structuredResult` é aceito no contrato de entrada só para simetria com
// o pedido do ciclo (facts) e para uso futuro por uma composição via LLM;
// esta implementação determinística não precisa dele para montar o texto,
// já que responseDraft já reflete os fatos com segurança.
export function composeNaturalFinancialResponse({
  responseDraft,
  reasoningTags = [],
  termToExplain = null,
} = {}) {
  if (typeof responseDraft !== 'string' || !responseDraft.trim()) return null;

  const glossary = termToExplain ? explainFinancialTerm(termToExplain) : null;
  const prefix = buildEmotionalPrefix(reasoningTags);

  if (glossary) {
    return `${glossary.explanation} ${responseDraft}`.trim();
  }
  return `${prefix}${responseDraft}`.trim();
}

// ── Bloco 4.3.6 — guardrails ────────────────────────────────────────────
// Extrai valores monetários (R$ ...) mencionados num texto -- usado para
// confirmar que nenhum número "novo" (nunca fornecido pelos fatos) foi
// mencionado. Serve tanto para auditar esta composição determinística
// (deve sempre passar) quanto para validar uma futura composição via LLM.
// Bloco 4.7 (matriz de naturalidade): o número após "R$" precisa ser
// capturado por INTEIRO -- um texto real pode vir com separador de milhar
// ("R$ 3.000,00") ou sem ele ("R$ 3000,00", formato usado por alguns
// pontos do motor determinístico), e a LLM (texto livre) não tem garantia
// de formatação. Um regex que trunca em 3 dígitos (`\d{1,3}` sem
// continuação) cortava "3000" em "300", fazendo o guardrail REJEITAR
// respostas corretas (falso positivo) -- pior, um valor inventado que
// coincidisse nos 3 primeiros dígitos com um valor real poderia passar
// como válido (falso negativo). Capturar a sequência completa de
// dígitos/pontos/vírgulas e só então decidir o separador decimal resolve
// os dois problemas na raiz.
function parseBrlAmount(raw) {
  const cleaned = raw.replace(/^-?R\$\s?/, '');
  const isNegative = raw.trim().startsWith('-');
  const hasComma = cleaned.includes(',');
  let normalized;
  if (hasComma) {
    // "3.000,00" / "3000,00" -- toda a formatação BR: ponto é milhar,
    // vírgula é decimal.
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else {
    const dotParts = cleaned.split('.');
    // Sem vírgula, mas com ponto(s): "3.000" (BR, milhar sem decimais) vs
    // "3.5" (decimal curto, formato não-BR ocasional da LLM). O último
    // grupo com exatamente 3 dígitos e mais de um grupo no total é o
    // sinal de separador de milhar; caso contrário o ponto é decimal.
    const looksLikeThousands = dotParts.length > 1 && dotParts[dotParts.length - 1].length === 3;
    normalized = looksLikeThousands ? dotParts.join('') : cleaned;
  }
  const value = Number(normalized);
  return Number.isFinite(value) ? (isNegative ? -Math.abs(value) : value) : null;
}

export function extractMentionedCurrencyValues(text) {
  if (typeof text !== 'string') return [];
  // A captura sempre termina em dígito (nunca engole um "." de fim de
  // frase como se fosse separador de milhar).
  const matches = text.match(/-?R\$\s?-?\d+(?:[.,]\d+)*/g) || [];
  return matches
    .map(parseBrlAmount)
    .filter((n) => Number.isFinite(n));
}

function flattenNumbers(value, out = []) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    out.push(Math.round(value * 100) / 100);
  } else if (Array.isArray(value)) {
    for (const item of value) flattenNumbers(item, out);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) flattenNumbers(item, out);
  }
  return out;
}

// Valida que todo valor monetário mencionado no texto final existe em
// algum lugar dos fatos estruturados (com tolerância de arredondamento).
// Nunca lança; retorno { valid, inventedValues }.
export function validateComposedResponse(text, structuredResult) {
  const mentioned = extractMentionedCurrencyValues(text);
  if (mentioned.length === 0) return { valid: true, inventedValues: [] };
  const allowed = flattenNumbers(structuredResult);
  const invented = mentioned.filter((value) => !allowed.some((a) => Math.abs(a - value) < 0.01));
  return { valid: invented.length === 0, inventedValues: invented };
}
