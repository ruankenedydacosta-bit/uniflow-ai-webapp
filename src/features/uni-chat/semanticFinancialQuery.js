// Sprint 3 (Interpretação Semântica) — ponte entre a interpretação
// estruturada da LLM (interpretFinancialIntent.js) e o motor de consultas
// determinístico JÁ EXISTENTE (financialQueryEngine.js, Sprint 2/2.1).
//
// Reaproveita 100% da lógica de consulta já comprovada: a LLM só decide O
// QUE o usuário quis dizer (intent + entidades em texto livre); este
// módulo VALIDA essas entidades contra dados reais (findAccountsByPhrase/
// findCategoriesByPhrase, já usados pelo motor determinístico) e monta uma
// frase canônica equivalente, que passa pelo MESMO resolveFinancialQuery()
// de sempre -- nenhuma lógica de soma/comparação/filtro é duplicada aqui.
//
// Nunca executa escrita: intenções de create_*/set_balance são
// reconhecidas mas devolvidas como handled:false -- o texto original
// continua seguindo para o parser de registro determinístico existente
// (financialConversation.interpret), que já exige confirmação explícita.
import {
  FINANCIAL_INTENT_STATUS,
  isFinancialIntentReadType,
  isFinancialIntentWriteType,
} from '../uni-llm/financialIntentSchema.js';
import { findAccountsByPhrase, findCategoriesByPhrase, resolveFinancialQuery } from './financialQueryEngine.js';

// Confiança baixa nunca executa nada -- vira pergunta de esclarecimento
// (ou, sem uma já pronta, cai no fallback seguro). Confiança média só
// executa quando a entidade resolve de forma INEQUÍVOCA contra dados
// reais; confiança alta segue o mesmo caminho de validação, só não é mais
// permissiva com relação a AMBIGUIDADE -- ambiguidade real (duas contas
// parecidas) sempre pergunta, em qualquer nível de confiança.
export const CONFIDENCE_THRESHOLD_LOW = 0.5;
export const CONFIDENCE_THRESHOLD_HIGH = 0.8;

const INTENT_TEXT_BUILDERS = Object.freeze({
  total_expenses: ({ period }) => `quanto gastei ${period ? period : 'este mês'}`,
  account_balance: ({ account }) => (account ? `quanto tenho na conta ${account}` : null),
  expenses_by_account: ({ account, period }) => (account
    ? `quanto gastei na conta ${account} ${period ? period : 'este mês'}`
    : null),
  expenses_by_category: ({ category, period }) => (category
    ? `quanto gastei com ${category} ${period ? period : ''}`.trim()
    : null),
  period_comparison: ({ comparisonPeriod }) => (comparisonPeriod ? `compara com ${comparisonPeriod}` : null),
  query_refinement: ({ account, category }) => (account
    ? `só na conta ${account}`
    : category ? `só com ${category}` : null),
});

// Só estas intenções têm equivalente hoje no motor determinístico
// (financialQueryEngine.js). As demais (financial_summary, total_balance,
// top_expenses, recent_transactions, income_by_*, period_detail) exigiriam
// uma ferramenta nova ou mapeamento para Tool Calling -- fora do escopo
// desta Sprint (ver relatório final, "riscos restantes"/"recomendações
// para a Sprint 4"). Para essas, o resultado é handled:false e o pipeline
// cai no comportamento seguro anterior (handleUnresolvedMessage, que já
// tem Tool Calling ligado quando a flag correspondente está ativa).
const MAPPED_INTENTS = new Set(Object.keys(INTENT_TEXT_BUILDERS));

// Marcador de reasoningTags que indica preocupação/ansiedade -- usado só
// para acolhimento local (prefixo de frase), NUNCA para decidir números.
const EMOTIONAL_TAGS = new Set(['emotional_concern', 'emotional_distress']);

function resolveEntityAgainstReal(rawPhrase, finder, snapshot) {
  if (!rawPhrase) return { resolved: null, ambiguous: false, matches: [] };
  const { matches, ambiguous } = finder(snapshot, rawPhrase);
  if (ambiguous) return { resolved: null, ambiguous: true, matches };
  if (matches.length === 1) return { resolved: matches[0].name, ambiguous: false, matches };
  // Nenhuma correspondência: NUNCA inventa -- devolve o texto original só
  // para o motor determinístico decidir (ele já sabe dizer "não encontrei
  // essa conta/categoria" sem alucinar).
  return { resolved: rawPhrase, ambiguous: false, matches: [] };
}

function buildAmbiguityQuestion(kind, matches) {
  const names = matches.map((m) => m.name).join(', ');
  return `Encontrei ${matches.length} ${kind} parecidas: ${names}. Qual delas você quer dizer?`;
}

// Função pura central: recebe a interpretação JÁ VALIDADA pelo schema
// (financialIntentSchema.js) e decide o que fazer. Nunca lança.
export function resolveSemanticFinancialIntent({
  interpretation,
  snapshot,
  mode = 'pessoal',
  conversationStyle,
  history = [],
  referenceDate = null,
  lastQuery = null,
} = {}) {
  if (!interpretation || !snapshot) return { handled: false };

  const { status, intent, confidence, entities, clarificationQuestion, reasoningTags } = interpretation;

  if (status === FINANCIAL_INTENT_STATUS.NOT_FINANCIAL || status === FINANCIAL_INTENT_STATUS.UNSUPPORTED) {
    return { handled: false };
  }

  // Confiança baixa: nunca executa. Se a própria LLM já formulou uma
  // pergunta curta e específica, usa ela -- nunca a genérica "não entendi".
  if (confidence < CONFIDENCE_THRESHOLD_LOW || status === FINANCIAL_INTENT_STATUS.NEEDS_CLARIFICATION) {
    if (clarificationQuestion) {
      return { handled: true, response: { text: clarificationQuestion, highlight: null }, semantic: true };
    }
    return { handled: false };
  }

  if (!intent || isFinancialIntentWriteType(intent)) {
    // Escrita: nunca executada aqui -- devolve handled:false para o texto
    // original seguir para o fluxo determinístico de registro existente.
    return { handled: false };
  }
  if (!isFinancialIntentReadType(intent) || !MAPPED_INTENTS.has(intent)) {
    // Intenção de leitura reconhecida, mas sem equivalente no motor
    // determinístico ainda (ver MAPPED_INTENTS acima) -- cai no fallback
    // seguro (handleUnresolvedMessage / Tool Calling já ligado).
    return { handled: false };
  }

  // Validação determinística das entidades contra dados REAIS -- a LLM só
  // disse o que o usuário mencionou ("Nu", "mercado"); aqui é onde se
  // decide se isso corresponde a algo que existe de verdade.
  const accountResolution = resolveEntityAgainstReal(entities.account, findAccountsByPhrase, snapshot);
  if (accountResolution.ambiguous) {
    return {
      handled: true,
      response: { text: buildAmbiguityQuestion('contas', accountResolution.matches), highlight: null },
      semantic: true,
    };
  }
  const categoryResolution = resolveEntityAgainstReal(entities.category, findCategoriesByPhrase, snapshot);
  if (categoryResolution.ambiguous) {
    return {
      handled: true,
      response: { text: buildAmbiguityQuestion('categorias', categoryResolution.matches), highlight: null },
      semantic: true,
    };
  }

  // Confiança média: só prossegue se as entidades mencionadas resolveram
  // sem ambiguidade (já garantido acima -- ambiguidade sempre pergunta,
  // independente do nível de confiança).
  const canonicalText = INTENT_TEXT_BUILDERS[intent]({
    account: accountResolution.resolved,
    category: categoryResolution.resolved,
    period: entities.period,
    comparisonPeriod: entities.comparisonPeriod,
  });
  if (!canonicalText) return { handled: false };

  const outcome = resolveFinancialQuery({
    text: canonicalText,
    snapshot,
    mode,
    conversationStyle,
    history,
    referenceDate,
    lastQuery,
  });
  if (!outcome.handled) return { handled: false };

  // Acolhimento (Sprint 3, item 9): reasoningTags sinaliza preocupação --
  // prefixo curto e determinístico, NUNCA uma segunda chamada à LLM (custo
  // e complexidade extra fora do escopo desta Sprint) e nunca altera o
  // número/fato reportado, só antecede com uma frase de acolhimento.
  const isEmotional = Array.isArray(reasoningTags) && reasoningTags.some((tag) => EMOTIONAL_TAGS.has(tag));
  const text = isEmotional
    ? `Entendo a preocupação. ${outcome.response.text}`
    : outcome.response.text;

  return {
    handled: true,
    response: { text, highlight: outcome.response.highlight },
    queryType: outcome.queryType,
    queryParams: outcome.queryParams,
    semantic: true,
  };
}
