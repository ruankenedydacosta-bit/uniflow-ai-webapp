// OPENAI3: recuperação local determinística sobre o manifesto de
// conhecimento de produto (Opção A da fase — busca por palavras-chave,
// sem dependência externa, sem embeddings/vector store). Adequada para o
// tamanho atual da base (~17 documentos curtos); reavaliar para Opção B
// (embeddings) somente se o volume de documentos crescer muito.
//
// normalizeText é reimplementado aqui (não importa de src/utils/searchText.js)
// para preservar o isolamento de domínio já praticado no projeto (ver
// src/utils/searchText.js e transactionFilterUtils.js, que fazem o mesmo).
import { PRODUCT_KNOWLEDGE_MANIFEST, WORKSPACE_SCOPE } from './productKnowledgeManifest.js';

const DIACRITIC_MARKS_PATTERN = new RegExp('[̀-ͯ]', 'g');
const DEFAULT_LIMIT = 3;
const MAX_CONTENT_CHARS_PER_RESULT = 600;
const MIN_SCORE_TO_MATCH = 1;

// Palavras funcionais de altíssima frequência em PT-BR: sem valor
// discriminativo para a busca, mas apareciam em praticamente todo
// documento -- sem este filtro, perguntas curtas (poucos termos reais)
// deixavam ruído de stopword empatar ou superar o documento certo.
const STOPWORDS = new Set([
  'como', 'para', 'com', 'uma', 'um', 'que', 'nao', 'sim', 'de', 'da', 'do',
  'das', 'dos', 'em', 'no', 'na', 'nos', 'nas', 'por', 'pela', 'pelo',
  'meu', 'minha', 'meus', 'minhas', 'seu', 'sua', 'seus', 'suas', 'este',
  'esta', 'isso', 'essa', 'esse', 'aquele', 'aquela', 'ele', 'ela', 'eles',
  'elas', 'voce', 'voces', 'eu', 'nos', 'sem', 'ainda', 'ser', 'ter', 'foi',
  'sao', 'tem', 'vai', 'ate', 'mais', 'mas', 'ou', 'se', 'ao', 'aos', 'onde',
  'quando', 'qual', 'quais', 'algo', 'alguma', 'algum', 'toda', 'todo',
  'existe', 'existem', 'app', 'aplicativo',
]);

function normalizeText(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .normalize('NFD')
    .replace(DIACRITIC_MARKS_PATTERN, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function tokenize(value) {
  return normalizeText(value)
    // remove pontuação (ex.: "objetivos?" nunca deve deixar de casar com
    // "objetivos" só porque a pergunta termina em "?").
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
}

// Um workspace pedido só encontra entradas aplicáveis a ele ou a BOTH --
// nunca cruza pessoal/empresa. Sem workspace informado, nenhuma entrada é
// filtrada por esse eixo (ex.: uso em contexto ainda não determinado).
function matchesWorkspace(entryWorkspace, requestedWorkspace) {
  if (!requestedWorkspace) return true;
  if (entryWorkspace === WORKSPACE_SCOPE.BOTH) return true;
  return entryWorkspace === requestedWorkspace;
}

function scoreEntry(entry, queryTokens) {
  if (queryTokens.length === 0) return 0;
  const titleTokens = new Set(tokenize(entry.title));
  const keywordTokens = new Set(entry.keywords.flatMap((keyword) => tokenize(keyword)));
  const contentTokens = new Set(tokenize(entry.content));

  let score = 0;
  for (const token of queryTokens) {
    if (titleTokens.has(token)) score += 3;
    if (keywordTokens.has(token)) score += 3;
    if (contentTokens.has(token)) score += 1;
  }
  return score;
}

function truncateContent(content) {
  if (content.length <= MAX_CONTENT_CHARS_PER_RESULT) return content;
  return `${content.slice(0, MAX_CONTENT_CHARS_PER_RESULT).trim()}…`;
}

/**
 * Busca local determinística no manifesto de conhecimento de produto.
 *
 * @param {string} query - pergunta/texto do usuário.
 * @param {object} [options]
 * @param {string} [options.workspace] - 'personal' | 'business', filtra por escopo aplicável.
 * @param {number} [options.limit] - máximo de resultados (nunca retorna o manual inteiro).
 * @returns {{ matched: boolean, results: Array<{id, title, category, status, file, routes, content}> }}
 */
export function retrieveProductKnowledge(query, options = {}) {
  const { workspace, limit = DEFAULT_LIMIT } = options;
  const queryTokens = tokenize(query);

  const scored = PRODUCT_KNOWLEDGE_MANIFEST
    .filter((entry) => matchesWorkspace(entry.workspaces, workspace))
    .map((entry) => ({ entry, score: scoreEntry(entry, queryTokens) }))
    .filter(({ score }) => score >= MIN_SCORE_TO_MATCH)
    .sort((a, b) => b.score - a.score);

  // Deduplicação: cada id do manifesto só pode aparecer uma vez (a fonte
  // já é 1 entrada por documento, mas o guard fica explícito e testável).
  const seenIds = new Set();
  const results = [];
  for (const { entry } of scored) {
    if (seenIds.has(entry.id)) continue;
    seenIds.add(entry.id);
    results.push({
      id: entry.id,
      title: entry.title,
      category: entry.category,
      status: entry.status,
      file: entry.file,
      routes: entry.routes,
      content: truncateContent(entry.content),
    });
    if (results.length >= limit) break;
  }

  return {
    matched: results.length > 0,
    results,
  };
}
